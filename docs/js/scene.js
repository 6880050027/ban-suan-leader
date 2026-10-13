// เมืองบ้านสวน: ฉาก 3 มิติสไตล์ดินปั้น หมุน ซูม เลื่อนได้ และคลิกตัวละคร/อาคารได้
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { CHARACTERS, AREAS, SCHOOL_NAME, AREA_OFFICE } from './data/world.js';

let renderer, scene, camera, controls, raycaster, pointer, clock;
let container, labelLayer;
const pickables = [];
const chars = {};       // id -> { group, parts, home, target, wait, labelEl, markerEl, moodEl }
const buildings = {};   // id -> { group, labelEl, center }
const movers = [];      // รถและเมฆ
let handlers = {};
let trophyGroup = null;
const MAX_STUDENTS = 32;
const facilities = {};   // id -> group
let sunLight = null, hemiLight = null;
let flyAnim = null;
let hovered = null;

// ---------- วัสดุดินปั้น ----------
let clayBump;
function makeClayBump() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 60;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return t;
}
const matCache = new Map();
function clay(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? 0.82, metalness: 0,
    bumpMap: opts.noBump ? null : clayBump, bumpScale: opts.bump ?? 0.6,
    emissive: opts.emissive || '#000000', emissiveIntensity: opts.ei ?? 1,
    transparent: !!opts.opacity, opacity: opts.opacity ?? 1,
  });
  matCache.set(k, m);
  return m;
}
function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m;
}
const rbox = (w, h, d, r = 0.25, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

// ---------- เริ่มต้น ----------
export function initScene(el, labels, h) {
  container = el; labelLayer = labels; handlers = h || {};
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#BFE3E0');
  scene.fog = new THREE.Fog('#BFE3E0', 110, 230);

  camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.5, 600);
  camera.position.set(58, 62, 78);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(2, 0, 3);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 10; controls.maxDistance = 170;
  controls.maxPolarAngle = 1.22; controls.minPolarAngle = 0.18;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;

  clayBump = makeClayBump();
  addLights();
  buildWorld();
  setupDaily();
  spawnPets();

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  clock = new THREE.Clock();

  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved < 6) pick(e, true);
  });
  renderer.domElement.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pick(e, false); });
  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(tick);
}

function onResize() {
  if (!container) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function addLights() {
  hemiLight = new THREE.HemisphereLight('#FFF4E0', '#7FA37A', 1.15); scene.add(hemiLight);
  const sun = new THREE.DirectionalLight('#FFE2BC', 2.3); sunLight = sun;
  sun.position.set(40, 70, 30);
  sun.castShadow = true;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
  sun.shadow.mapSize.set(smallScreen ? 1024 : 2048, smallScreen ? 1024 : 2048);
  const s = sun.shadow.camera; s.left = -70; s.right = 70; s.top = 70; s.bottom = -70; s.near = 10; s.far = 200;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#C9E4FF', 0.45);
  fill.position.set(-50, 30, -40);
  scene.add(fill);
}

// ---------- โลก ----------
function buildWorld() {
  // ทะเลรอบเกาะ
  const sea = mesh(new THREE.CircleGeometry(400, 48), clay('#9FD4D0', { noBump: true, rough: 0.6 }), { cast: false });
  sea.rotation.x = -Math.PI / 2; sea.position.y = -3.2; scene.add(sea);

  // ฐานเกาะ: ชั้นดิน + หญ้า
  const dirt = mesh(rbox(112, 5, 80, 3, 4), clay('#C98F62'));
  dirt.position.set(2, -2.6, 2); scene.add(dirt);
  const grass = mesh(rbox(110, 1.2, 78, 0.6, 3), clay('#9CCB7A'));
  grass.position.set(2, -0.6, 2); scene.add(grass);

  // บริเวณโรงเรียน (พื้นสีอ่อน)
  const campus = mesh(rbox(54, 0.3, 40, 0.2, 2), clay('#BFDC98'), { cast: false });
  campus.position.set(-4, 0.05, -1); scene.add(campus);

  roads();
  schoolCampus();
  townOutside();
  greenery();
  mergeStatic();
  buildFacilities();
  clouds();
  cars();
  spawnCharacters();
}

// รวม mesh ฉากที่ไม่ขยับตามวัสดุ เพื่อลด draw call ให้เล่นลื่นบนมือถือ
function mergeStatic() {
  scene.updateMatrixWorld(true);
  const isDyn = o => { for (let p = o; p; p = p.parent) if (p.userData.dynamic) return true; return false; };
  const buckets = new Map(), olds = [];
  scene.traverse(o => {
    if (!o.isMesh || isDyn(o) || o.material.visible === false) return;
    const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    (buckets.get(key) || buckets.set(key, { mat: o.material, cast: o.castShadow, rec: o.receiveShadow, geos: [] }).get(key)).geos.push(g);
    olds.push(o);
  });
  for (const o of olds) o.parent.remove(o);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat); m.castShadow = b.cast; m.receiveShadow = b.rec;
    m.matrixAutoUpdate = false;
    scene.add(m);
  }
  // ลบกลุ่มว่าง
  for (const c of [...scene.children]) if (c.isGroup && !c.children.length) scene.remove(c);
}

function roadSeg(x, z, w, d) {
  const r = mesh(new THREE.BoxGeometry(w, 0.12, d), clay('#6E7275', { bump: 0.2 }), { cast: false });
  r.position.set(x, 0.08, z); scene.add(r);
  return r;
}
function dashes(x1, z1, x2, z2, color = '#FFFFFF', w = 0.25) {
  const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len / 3);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const d = mesh(new THREE.BoxGeometry(1.4, 0.03, w), clay(color, { noBump: true }), { cast: false });
    d.position.set(x1 + (x2 - x1) * t, 0.16, z1 + (z2 - z1) * t);
    d.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    scene.add(d);
  }
}
function crosswalk(x, z, alongX) {
  for (let i = -3; i <= 3; i++) {
    const s = mesh(new THREE.BoxGeometry(alongX ? 0.7 : 4.6, 0.03, alongX ? 4.6 : 0.7), clay('#FAFAF2', { noBump: true }), { cast: false });
    s.position.set(x + (alongX ? i * 1.2 : 0), 0.16, z + (alongX ? 0 : i * 1.2)); scene.add(s);
  }
}
function roads() {
  // ถนนหน้าโรงเรียน (ทิศใต้) และถนนวงรอบ
  roadSeg(2, 23.5, 108, 6); dashes(-50, 23.5, 54, 23.5, '#F2C14E', 0.3);
  roadSeg(27, -1, 6, 43); dashes(27, -21, 27, 20);
  roadSeg(-35, -1, 6, 43); dashes(-35, -21, -35, 20);
  roadSeg(-4, -25, 68, 5); dashes(-36, -25, 28, -25);
  crosswalk(0, 23.5, true); crosswalk(27, 12, false);
  // ทางเดินในโรงเรียน
  const path = mesh(new THREE.BoxGeometry(4, 0.1, 18), clay('#E9DCC2', { bump: 0.3 }), { cast: false });
  path.position.set(0, 0.12, 9); scene.add(path);
  const path2 = mesh(new THREE.BoxGeometry(40, 0.1, 3), clay('#E9DCC2', { bump: 0.3 }), { cast: false });
  path2.position.set(-2, 0.12, -1); scene.add(path2);
}

function windowsOn(group, w, h, d, floors, color = '#FFE6A8') {
  const winMat = clay(color, { emissive: '#FFC86B', ei: 0.35, noBump: true, rough: 0.4 });
  const frameMat = clay('#FFFFFF', { noBump: true });
  const fh = h / floors;
  const cols = Math.max(2, Math.floor(w / 2.4));
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (c + 0.5) * (w / cols);
      const y = f * fh + fh * 0.55;
      for (const side of [1, -1]) {
        const fr = mesh(new THREE.BoxGeometry(1.25, 1.05, 0.12), frameMat, { cast: false });
        fr.position.set(x, y, side * (d / 2 + 0.03)); group.add(fr);
        const wi = mesh(new THREE.BoxGeometry(1.0, 0.82, 0.14), winMat, { cast: false });
        wi.position.set(x, y, side * (d / 2 + 0.05)); group.add(wi);
      }
    }
  }
}
function pitchedRoof(group, w, d, h, color, overhang = 0.6) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, 0); shape.lineTo(0, h); shape.lineTo(w / 2 + overhang, 0); shape.lineTo(-w / 2 - overhang, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d + overhang * 2, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.18, bevelSegments: 3 });
  geo.translate(0, 0, -(d + overhang * 2) / 2);
  const r = mesh(geo, clay(color));
  group.add(r);
  return r;
}

function building({ id, x, z, w, d, h, floors = 1, wall = '#F4E6CF', roof = '#E08A5B', roofType = 'pitch', rot = 0, label, area, awning, sign }) {
  const g = new THREE.Group();
  const body = mesh(rbox(w, h, d, 0.35), clay(wall));
  body.position.y = h / 2; g.add(body);
  // ฐาน
  const base = mesh(rbox(w + 0.6, 0.4, d + 0.6, 0.15), clay('#D8C8AE'));
  base.position.y = 0.2; g.add(base);
  windowsOn(g, w * 0.86, h, d, floors);
  // ประตู
  const door = mesh(rbox(1.6, 2.2, 0.2, 0.1), clay('#A86F4C'));
  door.position.set(0, 1.1, d / 2 + 0.08); g.add(door);
  if (roofType === 'pitch') {
    const r = pitchedRoof(g, w, d, Math.min(3.2, w * 0.28), roof); r.position.y = h - 0.05;
  } else {
    const slab = mesh(rbox(w + 0.5, 0.5, d + 0.5, 0.2), clay(roof)); slab.position.y = h + 0.2; g.add(slab);
    const rim = mesh(rbox(w * 0.3, 0.9, d * 0.3, 0.2), clay('#ECECEC')); rim.position.set(w * 0.25, h + 0.8, 0); g.add(rim);
  }
  if (awning) {
    const aw = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = mesh(new THREE.BoxGeometry(w * 0.7 / 7, 0.12, 1.6), clay(i % 2 ? '#FFFFFF' : awning, { bump: 0.3 }));
      s.position.set(-w * 0.35 + (i + 0.5) * w * 0.7 / 7, 0, 0); aw.add(s);
    }
    aw.position.set(0, Math.min(h - 0.4, 3), d / 2 + 0.8); aw.rotation.x = 0.25; g.add(aw);
  }
  if (sign) {
    const board = mesh(rbox(Math.min(w * 0.7, 7), 0.9, 0.25, 0.12), clay(sign));
    board.position.set(0, Math.min(h - 0.6, 3.6), d / 2 + 0.2); g.add(board);
  }
  g.position.set(x, 0, z); g.rotation.y = rot;
  scene.add(g);
  if (id) {
    // กล่องคลิกที่มองไม่เห็น (เพราะตัวอาคารจะถูกรวม geometry เพื่อให้เบาเครื่อง)
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const hit = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(c); hit.userData.pick = { type: 'building', id }; hit.userData.dynamic = true;
    scene.add(hit); pickables.push(hit);
    const el = makeLabel(label, 'b-label', area);
    buildings[id] = { group: g, labelEl: el, center: new THREE.Vector3(x, h + 2.5, z), label, area };
  }
  return g;
}

function schoolCampus() {
  // รั้วและประตูโรงเรียน
  const fenceMat = clay('#F1EBDD');
  for (const [x, z, w, d] of [[-4, 19, 54, 0.4], [-4, -21, 54, 0.4], [-31, -1, 0.4, 40], [23, -1, 0.4, 40]]) {
    const segs = Math.round(Math.max(w, d) / 2.2);
    for (let i = 0; i < segs; i++) {
      if (z === 19 && Math.abs(-31 + (i + 0.5) * (54 / segs)) < 3.5) continue; // ช่องประตู
      const p = mesh(rbox(w > d ? 54 / segs - 0.25 : 0.4, 1.1, d > w ? 40 / segs - 0.25 : 0.4, 0.15), fenceMat);
      p.position.set(w > d ? -31 + (i + 0.5) * (54 / segs) : x, 0.6, d > w ? -21 + (i + 0.5) * (40 / segs) : z);
      scene.add(p);
    }
  }
  for (const s of [-3.4, 3.4]) {
    const pillar = mesh(rbox(1, 3, 1, 0.2), clay('#E9D6B3')); pillar.position.set(s, 1.5, 19); scene.add(pillar);
  }
  const arch = mesh(rbox(8, 0.9, 0.8, 0.3), clay('#2F5D8A')); arch.position.set(0, 3.3, 19); scene.add(arch);
  addTextPlane(SCHOOL_NAME, 0, 3.3, 19.45, 7.4, 0.8, '#2F5D8A', '#FFFFFF');

  // อาคารหลัก
  building({ id: 'personnel', x: 0, z: -12, w: 16, d: 7, h: 6.5, floors: 2, wall: '#F7EBDD', roof: '#9B7BC8', label: 'อาคารอำนวยการ · ฝ่ายบุคคล', area: 'personnel' });
  building({ id: 'academic', x: -19, z: -11, w: 18, d: 7, h: 9.5, floors: 3, wall: '#FFF3E2', roof: '#5B8DD6', label: 'อาคารเรียน · ฝ่ายวิชาการ', area: 'academic' });
  building({ id: 'budget', x: 14, z: -11, w: 9, d: 6, h: 4.5, floors: 1, wall: '#FBEFD9', roof: '#D9A441', label: 'ห้องการเงินและพัสดุ · ฝ่ายงบประมาณ', area: 'budget', sign: '#D9A441' });
  building({ id: 'general', x: 15, z: 3, w: 8, d: 6, h: 4.2, floors: 1, wall: '#F3EEDC', roof: '#6FAF7A', label: 'อาคารบริหารทั่วไป · ความปลอดภัย', area: 'general', sign: '#6FAF7A' });
  building({ id: 'canteen', x: -20, z: 11, w: 11, d: 6, h: 3.6, floors: 1, wall: '#FFF6EA', roof: '#EE8C6B', label: 'โรงอาหาร', awning: '#EE8C6B' });
  building({ id: 'toilet', x: 17, z: 13, w: 6, d: 4, h: 3, floors: 1, wall: '#E3F1F2', roof: '#7FB7C2', roofType: 'flat', label: 'ห้องน้ำนักเรียน' });
  building({ id: 'guidance', x: -6, z: -16.5, w: 5, d: 3, h: 3, floors: 1, wall: '#F2F7FB', roof: '#A7C7E7', label: 'ห้องแนะแนว' });
  building({ id: 'hall', x: -25, z: 0.5, w: 5.5, d: 4, h: 3.4, floors: 1, wall: '#FFF4D6', roof: '#E3B341', label: 'หอเกียรติยศ', sign: '#E3B341' });
  const podium = mesh(rbox(5, 0.6, 1.6, 0.2), clay('#E9D6B3')); podium.position.set(-25, 0.3, 3.6); scene.add(podium);
  trophyGroup = new THREE.Group(); trophyGroup.position.set(-25, 0.6, 3.6); trophyGroup.userData.dynamic = true; scene.add(trophyGroup);

  // สนามกีฬา
  const trackGeo = new THREE.RingGeometry(7.5, 10.2, 48, 1);
  const track = mesh(trackGeo, clay('#D98A63', { bump: 0.4 }), { cast: false });
  track.rotation.x = -Math.PI / 2; track.scale.set(1.15, 0.8, 1); track.position.set(-4, 0.22, 7); scene.add(track);
  const field = mesh(new THREE.CircleGeometry(7.5, 40), clay('#86C06A'), { cast: false });
  field.rotation.x = -Math.PI / 2; field.scale.set(1.15, 0.8, 1); field.position.set(-4, 0.24, 7); scene.add(field);
  const line = mesh(new THREE.BoxGeometry(0.15, 0.02, 10), clay('#FFFFFF', { noBump: true }), { cast: false });
  line.position.set(-4, 0.27, 7); line.rotation.y = Math.PI / 2; scene.add(line);
  for (const s of [-1, 1]) {
    const goal = mesh(rbox(0.2, 1.4, 2.6, 0.08), clay('#FFFFFF')); goal.position.set(-4 + s * 7.6, 0.8, 7); scene.add(goal);
  }
  const fieldHit = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.6, 16), new THREE.MeshBasicMaterial({ visible: false }));
  fieldHit.position.set(-4, 0.4, 7); fieldHit.scale.set(1.15, 1, 0.8);
  fieldHit.userData.pick = { type: 'building', id: 'field' }; fieldHit.userData.dynamic = true; scene.add(fieldHit); pickables.push(fieldHit);
  buildings.field = { group: fieldHit, labelEl: makeLabel('สนามกีฬา', 'b-label'), center: new THREE.Vector3(-4, 2, 7), label: 'สนามกีฬา' };

  // เสาธงชาติ
  const pole = mesh(new THREE.CylinderGeometry(0.12, 0.15, 9, 10), clay('#EDEDED', { noBump: true }));
  pole.position.set(0, 4.5, -4.5); scene.add(pole);
  const base = mesh(rbox(2.4, 0.6, 2.4, 0.2), clay('#E2D3B8')); base.position.set(0, 0.3, -4.5); scene.add(base);
  const flagTex = stripesTexture(['#A51931', '#F4F5F8', '#2D2A4A', '#2D2A4A', '#F4F5F8', '#A51931']);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2, 10, 4), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(1.6, 7.9, -4.5); flag.castShadow = true; flag.userData.dynamic = true; scene.add(flag);
  movers.push({ type: 'flag', obj: flag, base: flag.geometry.attributes.position.array.slice() });

  // แท็งก์น้ำลายแดงขาว (อ้างอิงภาพตัวอย่าง)
  const tower = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const leg = mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 8), clay('#E9E1D3'));
    leg.position.set(i < 2 ? -1 : 1, 3.5, i % 2 ? -1 : 1); tower.add(leg);
  }
  for (let i = 0; i < 4; i++) {
    const band = mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.9, 24), clay(i % 2 ? '#FFFFFF' : '#E05A4E'));
    band.position.y = 7.4 + i * 0.9; tower.add(band);
  }
  const cap = mesh(new THREE.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), clay('#E05A4E'));
  cap.position.y = 10.5; tower.add(cap);
  tower.position.set(21, 0, -3); scene.add(tower);

  // ม้านั่งและกระถางดอกไม้
  for (const [x, z] of [[-9, 2.5], [6, 2.5], [-14, 4], [10, -6]]) bench(x, z);
  for (const [x, z] of [[-3, -8], [3, -8], [-6, 16], [6, 16]]) planter(x, z);
}

function townOutside() {
  building({ id: 'areaOffice', x: 39, z: -12, w: 13, d: 8, h: 7.5, floors: 2, wall: '#EFE7F6', roof: '#7A6FA8', label: AREA_OFFICE, sign: '#7A6FA8' });
  building({ id: 'health', x: 40, z: 10, w: 9, d: 6.5, h: 4.5, floors: 1, wall: '#FFFFFF', roof: '#7FC2A8', roofType: 'flat', label: 'หน่วยบริการสาธารณสุข' });
  const cross = new THREE.Group();
  cross.add(mesh(rbox(1.6, 0.5, 0.3, 0.1), clay('#E05A4E')), mesh(rbox(0.5, 1.6, 0.3, 0.1), clay('#E05A4E')));
  cross.position.set(40, 3.3, 13.5); scene.add(cross);
  building({ id: 'police', x: 33, z: 29, w: 4.5, d: 3.5, h: 3.2, floors: 1, wall: '#E8EEF8', roof: '#3E5C8A', label: 'ป้อมตำรวจชุมชน' });
  building({ id: 'cafe', x: -14, z: 31, w: 8, d: 5.5, h: 5.5, floors: 2, wall: '#F7E6D0', roof: '#B9784F', roofType: 'flat', label: 'คาเฟ่ชุมชน', awning: '#B9784F' });
  building({ id: 'flower', x: 10, z: 30, w: 6, d: 3.5, h: 3, floors: 1, wall: '#FFF1E6', roof: '#F28C6B', roofType: 'flat', label: 'ร้านดอกไม้', awning: '#F28C6B' });
  // บ้านชุมชน
  const houses = [[-46, -14, '#F4C7A1', '#C6604E'], [-46, -2, '#CFE3F2', '#5C7EA8'], [-46, 10, '#F6E3A7', '#D9824A'], [-26, 32, '#E6D3F0', '#8A6BB0'], [-40, 31, '#F7D4D4', '#C25B6A'], [48, 26, '#D8EBD0', '#5E9A62'], [22, 32, '#FFE0C2', '#C77B4A'], [-44, -26, '#E9E2D6', '#8C7A62']];
  houses.forEach(([x, z, wall, roof], i) => building({ x, z, w: 6, d: 5, h: 3.6 + (i % 2) * 2.2, floors: 1 + (i % 2), wall, roof, rot: (i % 3 - 1) * 0.15 }));
  // ป้ายรถเมล์
  const stop = new THREE.Group();
  const roofS = mesh(rbox(5, 0.3, 2, 0.12), clay('#5E9A80')); roofS.position.y = 2.8; stop.add(roofS);
  for (const s of [-2.2, 2.2]) { const p = mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 8), clay('#5E9A80')); p.position.set(s, 1.4, -0.7); stop.add(p); }
  const benchS = mesh(rbox(3.5, 0.3, 0.8, 0.1), clay('#C98F62')); benchS.position.set(0, 0.6, -0.5); stop.add(benchS);
  stop.position.set(18, 0, 28.5); scene.add(stop);
  // สัญญาณไฟ
  trafficLight(24, 20.2); trafficLight(-3.5, 27);
  // เสาไฟ
  for (let x = -46; x <= 50; x += 12) { lamp(x, 20.3); lamp(x + 6, 27); }
  for (let z = -18; z <= 14; z += 10) { lamp(30.5, z); lamp(-38.5, z); }
}

function lamp(x, z) {
  const g = new THREE.Group();
  const post = mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.6, 8), clay('#3A3A3A', { noBump: true })); post.position.y = 1.8; g.add(post);
  const bulb = mesh(new THREE.SphereGeometry(0.42, 16, 12), clay('#FFE7A8', { emissive: '#FFC870', ei: 0.9, noBump: true })); bulb.position.y = 3.8; g.add(bulb);
  g.position.set(x, 0, z); scene.add(g);
}
function trafficLight(x, z) {
  const g = new THREE.Group();
  const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), clay('#4A4A4A', { noBump: true })); post.position.y = 2; g.add(post);
  const box = mesh(rbox(0.9, 2.3, 0.8, 0.2), clay('#2F2F2F')); box.position.y = 4.6; g.add(box);
  ['#E0473B', '#F2B33D', '#5BC26A'].forEach((c, i) => {
    const l = mesh(new THREE.SphereGeometry(0.26, 12, 10), clay(c, { emissive: c, ei: i === 2 ? 0.9 : 0.15, noBump: true }));
    l.position.set(0, 5.3 - i * 0.7, 0.4); g.add(l);
  });
  g.position.set(x, 0, z); scene.add(g);
}
function bench(x, z) {
  const g = new THREE.Group();
  const seat = mesh(rbox(2.4, 0.25, 0.8, 0.1), clay('#C98F62')); seat.position.y = 0.6; g.add(seat);
  const back = mesh(rbox(2.4, 0.6, 0.18, 0.08), clay('#C98F62')); back.position.set(0, 1, -0.35); g.add(back);
  g.position.set(x, 0, z); scene.add(g);
}
function planter(x, z) {
  const g = new THREE.Group();
  const box = mesh(rbox(2.4, 0.8, 1.2, 0.2), clay('#B9784F')); box.position.y = 0.4; g.add(box);
  const cols = ['#F28C6B', '#F2C14E', '#E07A9B', '#FFFFFF', '#F6A6B2'];
  for (let i = 0; i < 9; i++) {
    const f = mesh(new THREE.SphereGeometry(0.26, 10, 8), clay(cols[i % cols.length]));
    f.position.set(-0.9 + (i % 5) * 0.45, 1 + Math.random() * 0.15, -0.25 + Math.floor(i / 5) * 0.5); g.add(f);
  }
  g.position.set(x, 0, z); scene.add(g);
}

function tree(x, z, s = 1, blossom = false) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.28 * s, 0.4 * s, 2.4 * s, 8), clay('#8A5A3C'));
  trunk.position.y = 1.2 * s; g.add(trunk);
  const greens = blossom ? ['#F6B7C8', '#F3A0B7', '#FAD0DB'] : ['#7DBB5E', '#8FCB68', '#6AAE50'];
  const blobs = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = (0.9 + Math.random() * 0.6) * s;
    const b = mesh(new THREE.IcosahedronGeometry(r, 2), clay(greens[i % greens.length]));
    const a = (i / blobs) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.8 * s, (2.6 + Math.random() * 1.2) * s, Math.sin(a) * 0.8 * s);
    g.add(b);
  }
  const top = mesh(new THREE.IcosahedronGeometry(1.1 * s, 2), clay(greens[0]));
  top.position.y = 3.8 * s; g.add(top);
  g.position.set(x, 0, z); g.rotation.y = Math.random() * 6;
  scene.add(g);
}
function greenery() {
  const spots = [[-28, -18], [-28, -6], [-28, 6], [-28, 16], [20, -18], [20, 18], [-12, 17], [10, 16], [7, -18], [-11, -18],
    [-50, -20], [-52, 4], [-50, 18], [-32, 36], [4, 36], [30, 36], [52, 18], [52, 0], [50, -24], [32, -24], [-24, -32], [-38, -33], [26, -33], [44, -2]];
  spots.forEach(([x, z], i) => tree(x, z, 0.8 + (i % 4) * 0.12, i % 6 === 0));
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, r = 46 + Math.random() * 6;
    const bush = mesh(new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.7, 1), clay(['#7DBB5E', '#6AAE50', '#9CCB7A'][i % 3]));
    bush.position.set(2 + Math.cos(a) * r, 0.5, 2 + Math.sin(a) * r * 0.7); scene.add(bush);
  }
}
function clouds() {
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = mesh(new THREE.SphereGeometry(1.4 + Math.random(), 14, 10), clay('#FFFFFF', { bump: 0.2 }), { cast: false, receive: false });
      b.position.set(k * 1.6 - 2.4, Math.random() * 0.6, Math.random() * 1.2); g.add(b);
    }
    g.position.set(-90 + Math.random() * 180, 44 + Math.random() * 14, -90 + Math.random() * 80);
    scene.add(g);
    movers.push({ type: 'cloud', obj: g, speed: 0.6 + Math.random() * 0.8 });
  }
}
function car(color) {
  const g = new THREE.Group();
  const body = mesh(rbox(3.4, 1.1, 1.7, 0.4), clay(color)); body.position.y = 0.8; g.add(body);
  const top = mesh(rbox(1.9, 0.9, 1.5, 0.35), clay('#FFFFFF')); top.position.set(-0.2, 1.65, 0); g.add(top);
  for (const [x, z] of [[-1.1, 0.85], [1.1, 0.85], [-1.1, -0.85], [1.1, -0.85]]) {
    const w = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), clay('#333333', { noBump: true }));
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.4, z); g.add(w);
  }
  scene.add(g); return g;
}
function cars() {
  const loop = [[-50, 22], [54, 22], [54, 25], [-50, 25]];
  const cols = ['#F28C6B', '#5B8DD6', '#F2C14E', '#7FC2A8'];
  cols.forEach((c, i) => {
    const g = car(c);
    movers.push({ type: 'car', obj: g, t: i / cols.length, lane: i % 2, speed: 0.012 + i * 0.002 });
  });
  // รถเมล์สีส้มแบบภาพตัวอย่าง
  const bus = new THREE.Group();
  const bb = mesh(rbox(8, 2.6, 2.4, 0.5), clay('#F2A541')); bb.position.y = 1.7; bus.add(bb);
  const stripe = mesh(rbox(8.05, 0.5, 2.45, 0.2), clay('#7FC2A8')); stripe.position.y = 0.9; bus.add(stripe);
  const win = mesh(rbox(6.8, 0.9, 2.46, 0.2), clay('#FFF6DD', { emissive: '#FFD27A', ei: 0.25 })); win.position.set(-0.3, 2.3, 0); bus.add(win);
  for (const x of [-2.6, 2.6]) for (const z of [1.2, -1.2]) { const w = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), clay('#333333')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.5, z); bus.add(w); }
  scene.add(bus);
  movers.push({ type: 'car', obj: bus, t: 0.5, lane: 0, speed: 0.008 });
}

function stripesTexture(colors) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  const ratio = [1, 1, 2, 0, 1, 1]; // ธงไตรรงค์ 1:1:2:1:1
  let y = 0;
  const seq = ['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'];
  [1, 1, 2, 1, 1].forEach((r, i) => { const h = 64 * r / 6; g.fillStyle = seq[i]; g.fillRect(0, y, 96, h + 1); y += h; });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function addTextPlane(text, x, y, z, w, h, bg, fg) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = '600 64px Mitr, "Noto Sans Thai", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.9), new THREE.MeshBasicMaterial({ map: t }));
  p.position.set(x, y, z); scene.add(p);
  // วาดใหม่เมื่อฟอนต์โหลดเสร็จ
  document.fonts?.ready.then(() => {
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = fg;
    g.font = '600 64px Mitr, "Noto Sans Thai", sans-serif'; g.fillText(text, c.width / 2, c.height / 2 + 4); t.needsUpdate = true;
  });
}

// ---------- ตัวละคร ----------
function makeCharacter(look, { small = false, isPlayer = false } = {}) {
  const g = new THREE.Group();
  const s = small ? 0.85 : 1;
  const skin = clay(look.skin), shirt = clay(look.shirt), hair = clay(look.hair);
  const pants = clay(look.pants || (isPlayer ? '#2E3A4F' : '#3D4E6B'));
  const legs = [];
  for (const x of [-0.22, 0.22]) {
    const leg = mesh(new THREE.CapsuleGeometry(0.17, 0.45, 4, 10), pants);
    leg.position.set(x, 0.42, 0); g.add(leg); legs.push(leg);
    const shoe = mesh(new THREE.SphereGeometry(0.2, 12, 8), clay('#5A3D2B'));
    shoe.scale.set(1, 0.6, 1.4); shoe.position.set(x, 0.1, 0.06); leg.add(shoe); shoe.position.set(0, -0.32, 0.06);
  }
  const body = mesh(new THREE.CapsuleGeometry(0.42, 0.55, 6, 14), shirt);
  body.position.y = 1.25; g.add(body);
  const arms = [];
  for (const x of [-0.52, 0.52]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 8), shirt);
    arm.position.set(x, 1.3, 0); arm.rotation.z = x > 0 ? -0.18 : 0.18; g.add(arm); arms.push(arm);
    const hand = mesh(new THREE.SphereGeometry(0.13, 10, 8), skin); hand.position.set(0, -0.34, 0); arm.add(hand);
  }
  const head = mesh(new THREE.SphereGeometry(0.52, 24, 18), skin);
  head.position.y = 2.18; g.add(head);
  const hairCap = mesh(new THREE.SphereGeometry(0.55, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 2.22; hairCap.rotation.x = -0.25; g.add(hairCap);
  if (look.acc === 'long') { const back = mesh(new THREE.CapsuleGeometry(0.42, 0.5, 4, 10), hair); back.position.set(0, 1.85, -0.25); back.scale.set(1, 1, 0.55); g.add(back); }
  if (look.acc === 'bun') { const bun = mesh(new THREE.SphereGeometry(0.22, 12, 10), hair); bun.position.set(0, 2.72, -0.25); g.add(bun); }
  if (look.acc === 'cap') { const cap = mesh(new THREE.SphereGeometry(0.56, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), clay(look.shirt)); cap.position.y = 2.28; g.add(cap); const brim = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16), clay(look.shirt)); brim.position.set(0, 2.35, 0.45); brim.scale.set(1, 1, 0.7); g.add(brim); }
  if (look.acc === 'chef') { const hat = mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.5, 16), clay('#FFFFFF')); hat.position.y = 2.75; g.add(hat); const puff = mesh(new THREE.SphereGeometry(0.45, 14, 10), clay('#FFFFFF')); puff.position.y = 3.05; g.add(puff); }
  if (look.acc === 'nurse') { const hat = mesh(rbox(0.6, 0.25, 0.3, 0.08), clay('#FFFFFF')); hat.position.set(0, 2.75, 0.1); g.add(hat); }
  if (look.acc === 'tie') { const tie = mesh(new THREE.ConeGeometry(0.12, 0.6, 4), clay(isPlayer ? '#D9A441' : '#B33A3A')); tie.rotation.x = Math.PI; tie.position.set(0, 1.4, 0.42); g.add(tie); }
  if (look.acc === 'student') { const tie = mesh(new THREE.ConeGeometry(0.14, 0.3, 4), clay('#2F5D8A')); tie.rotation.x = Math.PI; tie.position.set(0, 1.62, 0.42); g.add(tie); }
  // ใบหน้า
  const eyeMat = clay('#2A1E1A', { noBump: true, rough: 0.3 });
  for (const x of [-0.17, 0.17]) {
    const eye = mesh(new THREE.SphereGeometry(0.065, 10, 8), eyeMat, { cast: false }); eye.position.set(x, 2.2, 0.48); g.add(eye);
    const blush = mesh(new THREE.CircleGeometry(0.09, 12), clay('#F29B9B', { noBump: true, opacity: 0.75 }), { cast: false });
    blush.position.set(x * 1.6, 2.06, 0.47); blush.rotation.y = x * 0.9; g.add(blush);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12, Math.PI), eyeMat, { cast: false });
  mouth.position.set(0, 2.02, 0.5); mouth.rotation.z = Math.PI; g.add(mouth);
  if (look.acc === 'glasses') {
    for (const x of [-0.17, 0.17]) { const gl = mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 16), clay('#333333', { noBump: true }), { cast: false }); gl.position.set(x, 2.2, 0.5); g.add(gl); }
  }
  // วงแสงใต้เท้าผู้เล่น
  if (isPlayer) {
    const ring = mesh(new THREE.RingGeometry(0.75, 0.95, 32), new THREE.MeshBasicMaterial({ color: '#F2C14E', transparent: true, opacity: 0.85 }), { cast: false });
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    const badge = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16), clay('#F2C14E', { emissive: '#F2A541', ei: 0.4 }));
    badge.rotation.x = Math.PI / 2; badge.position.set(0.26, 1.55, 0.42); g.add(badge);
    g.userData.badge = badge;
  }
  // กล่องคลิกที่ใหญ่กว่าตัว เพื่อคลิกง่ายบนมือถือ
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.5; g.add(hit);
  g.scale.setScalar(s);
  g.userData.parts = { legs, arms, head, body };
  return g;
}

const STUDENT_LOOKS = [['#FFFFFF', '#F2C9A5', '#1B1B1B'], ['#FFFFFF', '#D9A77F', '#2B1D16'], ['#FFFFFF', '#F0C29C', '#3B2A22'], ['#FFFFFF', '#C99772', '#111111']];
function spawnCharacters() {
  for (const [id, c] of Object.entries(CHARACTERS)) {
    const g = makeCharacter(c.look, { small: c.small, isPlayer: id === 'player' });
    const [x, z] = c.pos;
    g.position.set(x, 0.2, z);
    g.rotation.y = Math.atan2(-x, 22 - z) * 0.3;
    g.traverse(o => { o.userData.pick = { type: 'char', id }; });
    scene.add(g); pickables.push(g);
    const labelEl = makeLabel(c.name, 'c-label' + (id === 'player' ? ' is-player' : ''));
    const markerEl = document.createElement('button');
    markerEl.className = 'q-marker'; markerEl.hidden = true; markerEl.textContent = '!';
    markerEl.setAttribute('aria-label', `เควสกับ ${c.name}`);
    markerEl.addEventListener('click', ev => { ev.stopPropagation(); handlers.onChar?.(id); });
    labelLayer.appendChild(markerEl);
    const moodEl = document.createElement('div'); moodEl.className = 'mood'; moodEl.hidden = true; labelLayer.appendChild(moodEl);
    chars[id] = { group: g, home: new THREE.Vector3(x, 0.2, z), target: null, wait: 1 + Math.random() * 4, wander: id !== 'player' && !['pakorn', 'areaDir', 'health', 'janpen', 'consultant'].includes(id) ? 1.8 : 0.6, labelEl, markerEl, moodEl, phase: Math.random() * 6 };
  }
  // นักเรียนทั่วไปเดินเล่นในสนาม
  for (let i = 0; i < MAX_STUDENTS; i++) {
    const [shirt, skin, hair] = STUDENT_LOOKS[i % 4];
    const g = makeCharacter({ shirt, skin, hair, pants: i % 2 ? '#2F4A6E' : '#3B3B3B', acc: i % 3 === 0 ? 'student' : (i % 3 === 1 ? 'long' : null) }, { small: true });
    const home = i < 18 ? new THREE.Vector3(-4 + (Math.random() - 0.5) * 16, 0.2, 7 + (Math.random() - 0.5) * 10) : new THREE.Vector3(-2 + (Math.random() - 0.5) * 30, 0.2, -1 + (Math.random() - 0.5) * 3);
    g.position.copy(home); scene.add(g);
    chars['student' + i] = { group: g, home, target: null, wait: Math.random() * 3, wander: 7, phase: Math.random() * 6, npc: true };
  }
}

// ---------- ป้ายลอย ----------
function makeLabel(text, cls, area) {
  const el = document.createElement('div');
  el.className = 'w-label ' + cls;
  el.textContent = text || '';
  if (area) el.style.setProperty('--area', AREAS[area].color);
  labelLayer.appendChild(el);
  return el;
}
const tmpV = new THREE.Vector3();
function project(v) {
  tmpV.copy(v).project(camera);
  return { x: (tmpV.x * 0.5 + 0.5) * container.clientWidth, y: (-tmpV.y * 0.5 + 0.5) * container.clientHeight, behind: tmpV.z > 1 };
}

let questChars = new Set();
export function setQuestMarkers(ids) {
  questChars = new Set(ids);
  for (const [id, c] of Object.entries(chars)) if (c.markerEl) c.markerEl.hidden = !questChars.has(id);
}
let quizBalloon = null, quizChar = null;
export function setQuizBalloon(id, onClick) {
  if (!quizBalloon) {
    quizBalloon = document.createElement('button');
    quizBalloon.className = 'quiz-balloon'; quizBalloon.innerHTML = '<span>?</span><small>คำถาม</small>';
    quizBalloon.setAttribute('aria-label', 'คำถามถูกหรือผิด ตอบถูกได้เงินเข้าโรงเรียน');
    labelLayer.appendChild(quizBalloon);
  }
  quizChar = id || null;
  quizBalloon.hidden = !id;
  quizBalloon.onclick = ev => { ev.stopPropagation(); onClick && onClick(); };
}
export function setMood(id, morale) {
  const c = chars[id]; if (!c?.moodEl) return;
  c.moodEl.hidden = false;
  c.moodEl.dataset.mood = morale >= 75 ? 'good' : morale >= 45 ? 'ok' : 'low';
  c.moodEl.title = `ขวัญกำลังใจ ${morale}`;
}
export function setPlayerScale(scale) {
  const p = chars.player?.group; if (p) p.scale.setScalar(scale);
}
export function setLabelsVisible(mode) { labelMode = mode; }
let labelMode = 'auto';

function updateLabels() {
  const dist = camera.position.distanceTo(controls.target);
  const showChars = labelMode === 'all' || dist < 70;
  const showBuild = labelMode === 'all' || dist < 115;
  for (const [id, c] of Object.entries(chars)) {
    if (!c.labelEl && !c.markerEl) continue;
    const head = c.group.position.clone(); head.y += 3.4 * c.group.scale.y;
    const p = project(head);
    const off = p.behind || p.x < -40 || p.x > container.clientWidth + 40 || p.y < -40 || p.y > container.clientHeight + 40;
    if (c.labelEl) {
      const vis = !off && (showChars || hovered === id || id === 'player' || questChars.has(id));
      c.labelEl.style.display = vis ? '' : 'none';
      if (vis) c.labelEl.style.transform = `translate(-50%,-100%) translate(${p.x}px,${p.y}px)`;
    }
    if (c.markerEl && !c.markerEl.hidden) {
      c.markerEl.style.display = off ? 'none' : '';
      const bob = Math.sin(clock.elapsedTime * 3 + c.phase) * 4;
      c.markerEl.style.transform = `translate(-50%,-100%) translate(${p.x}px,${p.y - 26 + bob}px)`;
    }
    if (c.moodEl && !c.moodEl.hidden) {
      c.moodEl.style.display = off || !showChars ? 'none' : '';
      c.moodEl.style.transform = `translate(-50%,-50%) translate(${p.x + 30}px,${p.y + 8}px)`;
    }
  }
  if (quizBalloon && quizChar && chars[quizChar]) {
    const c = chars[quizChar];
    const head = c.group.position.clone(); head.y += 4.2 * c.group.scale.y;
    const p = project(head);
    const bob = Math.sin(clock.elapsedTime * 2.2) * 6;
    quizBalloon.style.display = p.behind ? 'none' : '';
    quizBalloon.style.transform = `translate(-50%,-100%) translate(${p.x}px,${p.y - 30 + bob}px)`;
  }
  updateTags(dist);
  updatePetLabels(dist);
  for (const [id, b] of Object.entries(buildings)) {
    const p = project(b.center);
    const minor = id === 'guidance' || id === 'toilet' || id === 'police' || id === 'field';
    const vis = !p.behind && ((minor ? dist < 60 : showBuild) || hovered === 'b:' + id);
    b.labelEl.style.display = vis ? '' : 'none';
    if (vis) b.labelEl.style.transform = `translate(-50%,-100%) translate(${p.x}px,${p.y}px)`;
  }
}

// ---------- คลิก/ชี้ ----------
function pick(e, click) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, true);
  const info = hits.find(h => h.object.userData.pick)?.object.userData.pick;
  const key = info ? (info.type === 'char' ? info.id : 'b:' + info.id) : null;
  if (!click) {
    if (key !== hovered) {
      hovered = key;
      renderer.domElement.style.cursor = key ? 'pointer' : '';
      for (const [id, c] of Object.entries(chars)) c.labelEl?.classList.toggle('hover', id === key);
      for (const [id, b] of Object.entries(buildings)) b.labelEl.classList.toggle('hover', 'b:' + id === key);
    }
    return;
  }
  if (!info) return;
  if (info.type === 'char') handlers.onChar?.(info.id);
  else handlers.onBuilding?.(info.id);
}

// ---------- กล้อง ----------
export function flyTo(pos, dist = 22, polar = 0.62) {
  const from = controls.target.clone();
  const to = pos.clone(); to.y = 0;
  // คงทิศมุมกว้างเดิม แต่ยกกล้องให้สูงพอที่หลังคาจะไม่บังตัวละคร
  const cur = camera.position.clone().sub(controls.target);
  const az = Math.atan2(cur.x, cur.z);
  const dir = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
  const camFrom = camera.position.clone();
  const camTo = to.clone().add(dir.multiplyScalar(dist));
  flyAnim = { t: 0, from, to, camFrom, camTo };
}
// ฉากเปิด: บินกล้องไปยังจุดที่กำหนดอย่างช้า ๆ
export function cinematic(at, dist, az, dur = 2.6) {
  const to = new THREE.Vector3(at[0], 0, at[2]);
  const polar = 0.95;
  const dir = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
  flyAnim = { t: 0, dur, from: controls.target.clone(), to, camFrom: camera.position.clone(), camTo: to.clone().add(dir.multiplyScalar(dist)) };
}
// ตำแหน่งและความสูงป้ายของสิ่งที่จัดหา [x, z, ความสูงป้าย]
const FAC_POS = { garden: [17, 17, 3], bikepark: [-20, 16.8, 3.2], reno: [-19, -6, 3.6], water: [-15.5, 15.6, 4], cctv: [-4, 0, 4], library: [14, -18, 5.5], ict: [-19, -18.5, 6], solar: [10, 10, 2.6],
  dome: [13, -32.5, 8], newbldg: [-9, -32.5, 13], roof: [-20, 11, 7.6], toiletReno: [17, 13, 4.3], electric: [2.6, 4, 4.6], smartboard: [-19, -7.4, 10.5], nurse: [20.8, 7.6, 3.6], band: [14.5, -4, 5.2],
  expansion: [0, -32.5, 2], land2: [44.5, -32.5, 4.5],
  treecare: [10, 16, 5], pump: [21.4, -14.2, 3], generator: [21.5, -11.3, 3], wifi: [-10.3, -14.9, 12.5], airpurifier: [-11.8, -17.6, 4], fire: [9.2, -7.7, 3.4], langlab: [3.5, -18.5, 5], maker: [-19.3, -32.5, 5], hall: [34.5, -32.5, 8.5],
  land3: [72, 2, 3], land4: [72, -24, 3], newbldg2: [66, 2, 12.5], gym: [78, 2, 9], scibldg: [66, -24, 9.5], housing: [77, -25, 6] };
// ของที่ซื้อซ้ำได้และกิจกรรม: แสดงในเมืองเฉพาะภาคเรียนที่ใช้งาน [x, z, ความสูงป้าย]
const EV_POS = { teacher: [-11, -4.6, 3.8], foreign: [-26, -4.4, 3.8], janitor: [-28.5, 12, 3.8], scilab: [-21, -4.4, 2.6], pd: [-16, -4.4, 3.2], coding: [-6.5, -4.6, 2.6],
  uniform: [5, -6, 2.6], sports: [6.5, 4.5, 2.6], camp: [-9, 10.5, 3.4], scout: [0.5, 10.5, 3.4], moral: [-4, 13.2, 3.8], museum: [-35, -6, 4.4], scholar: [-25, 6.6, 3.6], lunchSec: [-17, 5, 2.6], counselor: [-4.5, -13.6, 3.8], plcnet: [-3.4, -7.4, 3.2], langcamp: [-4, 3.6, 3.4], eyes: [21.5, 10.6, 2.6] };
export function flyToFacility(id) { const p = FAC_POS[id] || EV_POS[id]; if (p) flyTo(new THREE.Vector3(p[0], 0, p[1]), id === 'cctv' || id === 'electric' ? 62 : id === 'land2' || id === 'expansion' || id === 'land3' || id === 'land4' ? 58 : 34, 0.5); }

// ---------- ป้ายชื่อของที่จัดหาและกิจกรรม ----------
let facNames = {}, tags = [], newKey = null, newUntil = 0;
export function setFacilityNames(map) { facNames = map || {}; refreshTags(); }
function refreshTags() {
  if (!labelLayer) return;
  for (const t of tags) t.el.remove();
  tags = [];
  const add = (key, pos, text, cls) => { const el = makeLabel(text, 'f-label ' + cls); tags.push({ key, el, pos: new THREE.Vector3(pos[0], pos[2], pos[1]) }); };
  for (const id of ownedNow) if (FAC_POS[id] && facilities[id]) add(id, FAC_POS[id], facNames[id] || id, 'fac');
  if (landNow >= 1) add('expansion', FAC_POS.expansion, 'ที่ดินแปลงที่ 1 (ได้รับบริจาค)', 'land');
  if (landNow >= 2) add('land2', FAC_POS.land2, 'ที่ดินแปลงที่ 2 · ลานกีฬาและกิจกรรม', 'land');
  if (landNow >= 3) add('land3', FAC_POS.land3, 'ที่ดินแปลงที่ 3', 'land');
  if (landNow >= 4) add('land4', FAC_POS.land4, 'ที่ดินแปลงที่ 4', 'land');
  for (const ev of eventsNow) { const p = EV_POS[ev.id]; if (p && !ev.npc) add(ev.id, p, (facNames[ev.id] || ev.id) + (ev.n > 1 ? ` ×${ev.n}` : '') + ' · ภาคเรียนนี้', 'ev'); }
}
function updateTags(dist) {
  const now = performance.now();
  for (const t of tags) {
    const p = project(t.pos);
    const isNew = t.key === newKey && now < newUntil;
    const vis = !p.behind && (isNew || labelMode === 'all' || dist < 78);
    t.el.style.display = vis ? '' : 'none';
    t.el.classList.toggle('new', isNew);
    if (vis) t.el.style.transform = `translate(-50%,-100%) translate(${p.x}px,${p.y}px)`;
  }
}

// ---------- กิจกรรมและของที่ใช้ในภาคเรียนนี้ ----------
let eventGroup = null, eventsNow = [], eventChars = [];
const NPC_NAME = { counselor: 'นักจิตวิทยาประจำโรงเรียน', teacher: 'ครูวิชาขาดแคลนที่จ้างเพิ่ม', foreign: 'ครูชาวต่างประเทศที่จ้างเพิ่ม', janitor: 'นักการภารโรงที่จ้างเพิ่ม' };
const NPC_LOOK = { counselor: { shirt: '#B59AD6', skin: '#F2C9A5', hair: '#3B2A22', acc: 'long' }, teacher: { shirt: '#7FA7D9', skin: '#E8B98F', hair: '#2B1D16', acc: 'tie' }, foreign: { shirt: '#F2C14E', skin: '#F3D3BC', hair: '#C9A15A', acc: null }, janitor: { shirt: '#6FAF7A', skin: '#C99772', hair: '#3B2A22', acc: 'cap' } };
function tent(g, x, z, color) {
  const t = mesh(new THREE.ConeGeometry(1.3, 1.7, 4), clay(color)); t.position.set(x, 0.85, z); t.rotation.y = Math.PI / 4; g.add(t);
  const door = mesh(new THREE.PlaneGeometry(0.5, 0.8), clay('#5A3D2B', { noBump: true })); door.position.set(x, 0.45, z + 0.93); door.rotation.x = -0.5; g.add(door);
}
function crates(g, x, z, color, n = 3) {
  for (let k = 0; k < n; k++) { const c = mesh(rbox(0.9, 0.7, 0.9, 0.1), clay(k % 2 ? '#D9B07A' : '#C99A62')); c.position.set(x - 0.5 + (k % 2) * 1, 0.35 + Math.floor(k / 2) * 0.72, z + (k === 2 ? 0 : 0)); g.add(c);
    const band = mesh(new THREE.BoxGeometry(0.92, 0.12, 0.92), clay(color, { noBump: true })); band.position.copy(c.position); g.add(band); }
}
function table(g, x, z, top = '#FFFFFF', w = 2.2) {
  const t = mesh(rbox(w, 0.12, 1, 0.05), clay(top)); t.position.set(x, 0.8, z); g.add(t);
  for (const dx of [-w / 2 + 0.15, w / 2 - 0.15]) { const l = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), clay('#8C8C8C')); l.position.set(x + dx, 0.4, z); g.add(l); }
}
function banner(g, x, z, color, w = 3) {
  for (const dx of [-w / 2, w / 2]) { const p = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), clay('#8C8C8C')); p.position.set(x + dx, 1.2, z); g.add(p); }
  const b = mesh(rbox(w, 0.7, 0.06, 0.03), clay(color)); b.position.set(x, 2.1, z); g.add(b);
}
function bus(g, x, z, color) {
  const b = new THREE.Group();
  const body = mesh(rbox(2.4, 2.2, 7, 0.45), clay(color)); body.position.y = 1.5; b.add(body);
  const win = mesh(rbox(2.46, 0.7, 6, 0.2), clay('#BFE3F2', { emissive: '#6FB7E0', ei: 0.2 })); win.position.y = 1.95; b.add(win);
  for (const [dx, dz] of [[-1.15, -2.3], [1.15, -2.3], [-1.15, 2.3], [1.15, 2.3]]) { const w = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14), clay('#333333', { noBump: true })); w.rotation.z = Math.PI / 2; w.position.set(dx, 0.45, dz); b.add(w); }
  b.position.set(x, 0, z); g.add(b);
}
const EV_BUILD = {
  plcnet: g => { banner(g, -3.4, -7.7, '#4AA3A2', 2.6); for (let k = 0; k < 3; k++) { const c = mesh(rbox(0.5, 0.5, 0.5, 0.08), clay('#FFFFFF')); c.position.set(-4.3 + k * 0.9, 0.25, -6.9); g.add(c); } },
  langcamp: g => { const cols = ['#C0392B', '#2E86C1', '#F1C40F', '#27AE60', '#8E44AD', '#E67E22'];
    cols.forEach((c, k) => { const a = k / cols.length * Math.PI * 2; const x = -4 + Math.cos(a) * 2.2, z = 3.6 + Math.sin(a) * 1.6;
      const p = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), clay('#DDDDDD')); p.position.set(x, 1.2, z); g.add(p);
      const f = mesh(new THREE.BoxGeometry(0.7, 0.42, 0.03), clay(c, { noBump: true })); f.position.set(x + 0.36, 2.2, z); g.add(f); });
    table(g, -4, 3.6, '#FFFFFF', 1.8); },
  eyes: g => { table(g, 21.5, 10.6, '#FFFFFF', 1.6); for (let k = 0; k < 3; k++) { const gl = mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), clay('#2C3E57')); gl.position.set(21 + k * 0.45, 0.92, 10.6); gl.rotation.x = Math.PI / 2; g.add(gl); } },
  scilab: g => { crates(g, -21, -4.4, '#5B8DD6'); const f = mesh(new THREE.ConeGeometry(0.3, 0.6, 12), clay('#BFE3F2', { emissive: '#7FD3FF', ei: 0.5 })); f.position.set(-20.5, 1.8, -4.4); g.add(f); },
  pd: g => { banner(g, -16, -5.4, '#9B7BC8', 3); for (let k = 0; k < 4; k++) { const c = mesh(rbox(0.5, 0.5, 0.5, 0.08), clay('#F2C14E')); c.position.set(-17.2 + k * 0.8, 0.25, -3.8); g.add(c); } },
  coding: g => { table(g, -6.5, -4.6, '#FFFFFF'); for (const dx of [-0.6, 0.6]) { const l = mesh(rbox(0.6, 0.4, 0.05, 0.02), clay('#2C3E57', { emissive: '#4FC3F7', ei: 0.8, noBump: true })); l.position.set(-6.5 + dx, 1.08, -4.75); l.rotation.x = -0.25; g.add(l); } },
  uniform: g => { table(g, 5, -6, '#F6E7C8'); for (let k = 0; k < 4; k++) { const sh = mesh(rbox(0.45, 0.18, 0.4, 0.05), clay(k % 2 ? '#FFFFFF' : '#2F4A6E')); sh.position.set(4.3 + k * 0.45, 0.95, -6); g.add(sh); } },
  sports: g => { const rack = mesh(rbox(2.2, 0.8, 0.8, 0.1), clay('#8A5A3C')); rack.position.set(6.5, 0.4, 4.5); g.add(rack);
    for (let k = 0; k < 4; k++) { const b = mesh(new THREE.SphereGeometry(0.28, 14, 10), clay(['#E07A5F', '#FFFFFF', '#F2C14E', '#5B8DD6'][k])); b.position.set(5.8 + k * 0.48, 1.05, 4.5); g.add(b); } },
  camp: g => { tent(g, -10, 10, '#E07A5F'); tent(g, -7.5, 11.5, '#F2C14E'); bus(g, -35, 7, '#F2C14E'); },
  scout: g => { tent(g, -0.5, 10, '#6FAF7A'); tent(g, 2, 11.5, '#5E9A62'); const p = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), clay('#8A5A3C')); p.position.set(3.4, 1.5, 9.4); g.add(p);
    const f = mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), clay('#2F8F5B', { noBump: true })); f.position.set(3.85, 2.7, 9.4); g.add(f); },
  moral: g => { const st = mesh(rbox(4, 0.5, 2, 0.15), clay('#E9D6B3')); st.position.set(-4, 0.25, 13.6); g.add(st); banner(g, -4, 14.4, '#F2C14E', 4); },
  museum: g => { bus(g, -35, -6, '#5B8DD6'); },
  scholar: g => { const st = mesh(rbox(3.4, 0.4, 1.6, 0.12), clay('#E9D6B3')); st.position.set(-25, 0.2, 6.6); g.add(st); banner(g, -25, 7.3, '#6FAF7A', 3.2); },
  lunchSec: g => { table(g, -17, 5, '#FFFFFF'); for (let k = 0; k < 4; k++) { const tr = mesh(rbox(0.45, 0.1, 0.32, 0.03), clay('#F2C14E')); tr.position.set(-17.75 + k * 0.5, 0.9, 5); g.add(tr); } },
};
export function setEvents(list) {
  if (!scene) return;
  if (!eventGroup) { eventGroup = new THREE.Group(); eventGroup.userData.dynamic = true; scene.add(eventGroup); }
  while (eventGroup.children.length) eventGroup.remove(eventGroup.children[0]);
  for (const c of eventChars) { scene.remove(chars[c].group); chars[c].labelEl?.remove(); delete chars[c]; }
  eventChars = [];
  const count = {};
  for (const id of list || []) count[id] = (count[id] || 0) + 1;
  eventsNow = [];
  for (const [id, n] of Object.entries(count)) {
    if (NPC_LOOK[id]) {
      const p = EV_POS[id];
      for (let k = 0; k < Math.min(n, 3); k++) {
        const g = makeCharacter(NPC_LOOK[id]); g.position.set(p[0] + k * 1.4, 0.2, p[1]); scene.add(g);
        const key = `ev_${id}_${k}`;
        chars[key] = { group: g, home: g.position.clone(), target: null, wait: 1 + k, wander: 1.6, phase: Math.random() * 6, labelEl: makeLabel(NPC_NAME[id] + (n > 1 ? ` (${n} อัตรา)` : ''), 'c-label ev-npc') };
        eventChars.push(key);
      }
      eventsNow.push({ id, n, npc: true });
    } else if (EV_BUILD[id]) { EV_BUILD[id](eventGroup); eventsNow.push({ id, n }); }
  }
  refreshTags();
}

// ---------- เน้นของใหม่หลังจัดหา ----------
let pulse = null;
export function showNew(id) {
  const p = FAC_POS[id] || EV_POS[id]; if (!p) return;
  newKey = id; newUntil = performance.now() + 9000;
  flyToFacility(id);
  if (pulse) scene.remove(pulse.mesh);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 40), new THREE.MeshBasicMaterial({ color: '#F2C14E', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(p[0], 0.35, p[1]); ring.userData.dynamic = true; scene.add(ring);
  pulse = { mesh: ring, t: 0 };
  // ป้ายของคนที่จ้างใหม่
  for (const k of eventChars) if (k.startsWith(`ev_${id}_`)) { const el = chars[k].labelEl; el?.classList.add('new'); setTimeout(() => el?.classList.remove('new'), 9000); }
}
export function flyToChar(id) { const c = chars[id]; if (c) flyTo(c.group.position, 24, 0.6); }
export function flyToBuilding(id) { const b = buildings[id]; if (b) flyTo(b.center, 34, 0.75); }
export function resetView() { flyAnim = { t: 0, from: controls.target.clone(), to: new THREE.Vector3(2, 0, 3), camFrom: camera.position.clone(), camTo: new THREE.Vector3(58, 62, 78) }; }
export function zoomBy(f) {
  const dir = camera.position.clone().sub(controls.target);
  const len = THREE.MathUtils.clamp(dir.length() * f, controls.minDistance, controls.maxDistance);
  flyAnim = { t: 0, from: controls.target.clone(), to: controls.target.clone(), camFrom: camera.position.clone(), camTo: controls.target.clone().add(dir.setLength(len)) };
}
export function charPos(id) { return chars[id]?.group.position.clone(); }

// ---------- สิ่งก่อสร้างที่ซื้อจากร้านค้า ----------
function fgroup(id, label) {
  const g = new THREE.Group(); g.userData.dynamic = true; g.visible = false; scene.add(g);
  facilities[id] = g;
  if (label) {
    g.userData.label = label;
  }
  return g;
}
function sparkleBanner(g, x, y, z, w, color) {
  const b = mesh(rbox(w, 0.8, 0.2, 0.15), clay(color)); b.position.set(x, y, z); g.add(b);
}
function buildFacilities() {
  // ปรับปรุงห้องเรียน: กระถางดอกไม้และแถบสีใหม่หน้าอาคารเรียน
  let g = fgroup('reno');
  for (const x of [-26, -22, -16, -12]) { const p = mesh(rbox(2.2, 0.7, 1, 0.2), clay('#B9784F')); p.position.set(x, 0.35, -6.8); g.add(p);
    for (let k = 0; k < 4; k++) { const f = mesh(new THREE.SphereGeometry(0.25, 10, 8), clay(['#F28C6B', '#F2C14E', '#E07A9B', '#FFFFFF'][k])); f.position.set(x - 0.75 + k * 0.5, 0.85, -6.8); g.add(f); } }
  sparkleBanner(g, -19, 3.2, -7.35, 12, '#7FC2A8');
  // จุดบริการน้ำดื่ม
  g = fgroup('water');
  { const wg = new THREE.Group(); wg.position.set(-3, 0, 0.6); g.add(wg); g = wg; // เลื่อนออกจากใต้ต้นไม้
    const base = mesh(rbox(2.6, 0.3, 1.6, 0.1), clay('#E9DCC2')); base.position.set(-12.5, 0.15, 15); g.add(base);
    const box = mesh(rbox(2, 1.6, 0.8, 0.2), clay('#7FB7C2')); box.position.set(-12.5, 1.1, 15.2); g.add(box);
    const tank = mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 16), clay('#BFE3F2', { rough: 0.3 })); tank.position.set(-12.5, 2.4, 15.2); g.add(tank);
    for (const x of [-13.1, -11.9]) { const t = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), clay('#DDDDDD')); t.position.set(x, 1.3, 14.7); t.rotation.x = Math.PI / 2; g.add(t); }
    const roof = mesh(rbox(3, 0.2, 2, 0.1), clay('#5E9A80')); roof.position.set(-12.5, 3.2, 15); g.add(roof);
    for (const x of [-13.8, -11.2]) { const p = mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), clay('#5E9A80')); p.position.set(x, 1.6, 14.2); g.add(p); } }
  // กล้องวงจรปิด
  g = fgroup('cctv');
  for (const [x, z, r] of [[-30.5, -20.5, 0.8], [22.5, -20.5, -0.8], [-30.5, 18.5, 2.3], [22.5, 18.5, -2.3], [4, 18.5, 3.14]]) {
    const pole = mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), clay('#5A5A5A', { noBump: true })); pole.position.set(x, 1.7, z); g.add(pole);
    const cam = mesh(rbox(0.7, 0.35, 0.35, 0.1), clay('#F4F4F4')); cam.position.set(x, 3.4, z); cam.rotation.y = r; g.add(cam);
    const led = mesh(new THREE.SphereGeometry(0.06, 8, 6), clay('#E0473B', { emissive: '#E0473B', ei: 1, noBump: true })); led.position.set(x, 3.6, z); g.add(led);
  }
  // ห้องสมุดมีชีวิต
  g = fgroup('library');
  { const b = mesh(rbox(8, 3.6, 4, 0.3), clay('#F6E3D3')); b.position.set(14, 1.8, -18); g.add(b);
    const r = mesh(rbox(8.6, 0.5, 4.6, 0.2), clay('#C77B4A')); r.position.set(14, 3.8, -18); g.add(r);
    for (let k = 0; k < 3; k++) { const w = mesh(rbox(1.6, 1.4, 0.15, 0.1), clay('#FFE6A8', { emissive: '#FFC86B', ei: 0.35 })); w.position.set(11.5 + k * 2.5, 2, -15.95); g.add(w); }
    const sign = mesh(rbox(3.6, 0.6, 0.15, 0.1), clay('#5B8DD6')); sign.position.set(14, 3.1, -15.9); g.add(sign);
    for (let k = 0; k < 4; k++) { const bk = mesh(rbox(0.25, 0.7, 0.5, 0.05), clay(['#E05A4E', '#5B8DD6', '#F2C14E', '#6FAF7A'][k])); bk.position.set(16.6 + k * 0.28, 4.4, -18); g.add(bk); } }
  // ห้องปฏิบัติการคอมพิวเตอร์
  g = fgroup('ict');
  { const b = mesh(rbox(10, 3.8, 4, 0.3), clay('#E8EEF8')); b.position.set(-19, 1.9, -18.5); g.add(b);
    const r = mesh(rbox(10.6, 0.5, 4.6, 0.2), clay('#3E5C8A')); r.position.set(-19, 4, -18.5); g.add(r);
    for (let k = 0; k < 4; k++) { const w = mesh(rbox(1.7, 1.3, 0.15, 0.1), clay('#BFE3F2', { emissive: '#6FB7E0', ei: 0.5 })); w.position.set(-22.6 + k * 2.4, 2.1, -16.45); g.add(w); }
    const dish = mesh(new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), clay('#FFFFFF')); dish.rotation.x = -2.2; dish.position.set(-16, 4.9, -19); g.add(dish); }
  // แผงโซลาร์เซลล์ภาคพื้นดิน
  g = fgroup('solar');
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const panel = mesh(new THREE.BoxGeometry(1.6, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: '#2B4C7E', roughness: 0.25, metalness: 0.4 }));
    panel.position.set(8.4 + c * 1.8, 1.1, 8.8 + r * 1.6); panel.rotation.x = -0.45; g.add(panel);
    const leg = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), clay('#BBBBBB')); leg.position.set(8.4 + c * 1.8, 0.5, 8.8 + r * 1.6); g.add(leg);
  }
  // สวนเกษตรและโรงเรือน
  g = fgroup('garden');
  { for (let r = 0; r < 3; r++) { const bed = mesh(rbox(3.2, 0.35, 0.8, 0.12), clay('#8A5A3C')); bed.position.set(15.5, 0.2, 15.9 + r * 1.1); g.add(bed);
      for (let k = 0; k < 5; k++) { const v = mesh(new THREE.IcosahedronGeometry(0.22, 1), clay(['#7DBB5E', '#9CCB7A', '#6AAE50'][k % 3])); v.position.set(14.2 + k * 0.65, 0.5, 15.9 + r * 1.1); g.add(v); } }
    const house = mesh(rbox(2.6, 1.8, 2.6, 0.2), new THREE.MeshStandardMaterial({ color: '#DDF2F0', transparent: true, opacity: 0.55, roughness: 0.2 })); house.position.set(19.3, 0.9, 17); g.add(house);
    const frame = mesh(rbox(2.8, 0.15, 2.8, 0.05), clay('#FFFFFF')); frame.position.set(19.3, 1.85, 17); g.add(frame); }
  // ลานจอดรถจักรยาน
  g = fgroup('bikepark');
  { const roof = mesh(rbox(6, 0.2, 2.2, 0.1), clay('#E08A5B')); roof.position.set(-20, 2.2, 16.8); g.add(roof);
    for (const x of [-22.8, -17.2]) { const p = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), clay('#8C8C8C')); p.position.set(x, 1.1, 16.1); g.add(p); }
    for (let k = 0; k < 6; k++) { const bike = new THREE.Group();
      for (const z of [-0.35, 0.35]) { const w = mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 14), clay('#333333', { noBump: true })); w.position.set(0, 0.3, z); w.rotation.y = Math.PI / 2; bike.add(w); }
      const bar = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), clay(['#5B8DD6', '#E05A4E', '#6FAF7A'][k % 3])); bar.position.y = 0.55; bike.add(bar);
      bike.position.set(-22.3 + k * 0.9, 0, 16.9); g.add(bike); } }
  // พื้นที่ขยาย (ทิศเหนือของโรงเรียน) สำหรับโดมและอาคารใหม่
  const pad = fgroup('expansion');
  { const p = mesh(rbox(44, 0.3, 9, 0.2), clay('#BFDC98'), { cast: false }); p.position.set(0, 0.06, -32.5); pad.add(p);
    const walk = mesh(new THREE.BoxGeometry(3, 0.1, 5), clay('#E9DCC2'), { cast: false }); walk.position.set(0, 0.14, -25); pad.add(walk);
    for (let i = -3; i <= 3; i++) { const st = mesh(new THREE.BoxGeometry(0.6, 0.03, 4.2), clay('#FAFAF2', { noBump: true }), { cast: false }); st.position.set(i * 1.1, 0.17, -25); pad.add(st); } }
  // โดมอเนกประสงค์
  g = fgroup('dome');
  { const floor = mesh(rbox(12, 0.3, 7.5, 0.2), clay('#D98A63')); floor.position.set(13, 0.2, -32.5); g.add(floor);
    for (const x of [7.6, 18.4]) for (const z of [-35.6, -29.4]) { const p = mesh(new THREE.CylinderGeometry(0.2, 0.2, 4.6, 10), clay('#F1EBDD')); p.position.set(x, 2.3, z); g.add(p); }
    const roof = mesh(new THREE.CylinderGeometry(4.2, 4.2, 12, 24, 1, false, 0, Math.PI), clay('#5E9A80'));
    roof.rotation.z = Math.PI / 2; roof.rotation.y = 0; roof.scale.set(1, 1, 0.9); roof.position.set(13, 4.6, -32.5); g.add(roof); }
  // อาคารเรียนหลังใหม่
  g = fgroup('newbldg');
  { const sg = new THREE.Group(); sg.position.set(-9, 0, -32.5); g.add(sg);
    const b = mesh(rbox(16, 9, 6.5, 0.35), clay('#FFF1DC')); b.position.y = 4.5; sg.add(b);
    windowsOn(sg, 14, 9, 6.5, 3, '#FFE6A8');
    const r = pitchedRoof(sg, 16, 6.5, 3.2, '#E05A4E'); r.position.y = 8.95;
    const sign = mesh(rbox(6, 0.8, 0.2, 0.15), clay('#2F5D8A')); sign.position.set(0, 3.4, 3.35); sg.add(sign); }
  // หลังคาโรงอาหารใหม่ (ทับหลังคาเดิม สีใหม่ชัดเจน)
  g = fgroup('roof');
  { const sg = new THREE.Group(); sg.position.set(-20, 0, 11); g.add(sg);
    const r = pitchedRoof(sg, 11.4, 6.4, 3.2, '#3E9C95'); r.position.y = 3.62;
    const ridge = mesh(rbox(0.5, 0.35, 8.2, 0.12), clay('#F2C14E')); ridge.position.set(0, 6.95, 0); sg.add(ridge); }
  // ห้องน้ำปรับปรุงใหม่ (ผนังกระเบื้องใหม่ทับอาคารเดิม)
  g = fgroup('toiletReno');
  { const sg = new THREE.Group(); sg.position.set(17, 0, 13); g.add(sg);
    const b = mesh(rbox(6.3, 3.1, 4.3, 0.3), clay('#BFE8E3')); b.position.y = 1.55; sg.add(b);
    for (let k = 0; k < 6; k++) { const t = mesh(new THREE.BoxGeometry(0.9, 0.9, 0.06), clay(k % 2 ? '#7FC2BC' : '#FFFFFF', { noBump: true })); t.position.set(-2.4 + k * 0.96, 0.75, 2.17); sg.add(t); }
    const slab = mesh(rbox(6.9, 0.45, 4.9, 0.2), clay('#2F8F88')); slab.position.y = 3.35; sg.add(slab);
    const door = mesh(rbox(1.4, 2.1, 0.12, 0.08), clay('#5B8DD6')); door.position.set(1.6, 1.05, 2.2); sg.add(door);
    const sign = mesh(rbox(2.6, 0.55, 0.12, 0.08), clay('#FFFFFF')); sign.position.set(-1.2, 2.5, 2.22); sg.add(sign); }
  // ระบบไฟฟ้าใหม่และโคมไฟ LED ตามทางเดิน
  g = fgroup('electric');
  for (const [x, z] of [[2.6, 4], [-2.6, 12], [2.6, 17], [-14, -2.9], [8, 0.9], [-18, 0.9]]) {
    const post = mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.8, 8), clay('#E9E9E9', { noBump: true })); post.position.set(x, 1.9, z); g.add(post);
    const arm = mesh(new THREE.BoxGeometry(0.9, 0.1, 0.18), clay('#E9E9E9', { noBump: true })); arm.position.set(x + 0.35, 3.8, z); g.add(arm);
    const led = mesh(rbox(0.7, 0.16, 0.38, 0.06), clay('#FFFFFF', { emissive: '#CFEFFF', ei: 1.4, noBump: true })); led.position.set(x + 0.65, 3.7, z); g.add(led);
  }
  { const tr = mesh(rbox(1.6, 1.8, 1.2, 0.15), clay('#7E8C99')); tr.position.set(21.4, 0.9, -8.5); g.add(tr);
    const bolt = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), clay('#F2C14E', { noBump: true })); bolt.position.set(21.4, 1.2, -7.88); bolt.rotation.z = Math.PI / 4; g.add(bolt); }
  // จอสัมผัสอัจฉริยะ: จอเรืองแสงหน้าอาคารเรียน
  g = fgroup('smartboard');
  for (let f = 0; f < 3; f++) for (let k = 0; k < 4; k++) {
    const sc = mesh(rbox(1.5, 0.9, 0.1, 0.05), clay('#2C3E57', { emissive: '#4FC3F7', ei: 0.9, noBump: true }));
    sc.position.set(-25.5 + k * 4.3, 1.1 + f * 3.15, -7.33); g.add(sc);
  }
  // ห้องพยาบาล
  g = fgroup('nurse');
  { const b = mesh(rbox(3, 2.6, 2.6, 0.25), clay('#FFFFFF')); b.position.set(20.8, 1.3, 7.6); g.add(b);
    const r = mesh(rbox(3.4, 0.35, 3, 0.12), clay('#E05A4E')); r.position.set(20.8, 2.75, 7.6); g.add(r);
    const c1 = mesh(new THREE.BoxGeometry(0.9, 0.28, 0.08), clay('#E0473B', { noBump: true })); c1.position.set(20.8, 1.9, 8.93); g.add(c1);
    const c2 = mesh(new THREE.BoxGeometry(0.28, 0.9, 0.08), clay('#E0473B', { noBump: true })); c2.position.set(20.8, 1.9, 8.93); g.add(c2); }
  // วงโยธวาทิต: ศาลาดนตรีพร้อมกลอง
  g = fgroup('band');
  { const base = mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.4, 24), clay('#E9D6B3')); base.position.set(14.5, 0.2, -4); g.add(base);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const p = mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 8), clay('#FFFFFF')); p.position.set(14.5 + Math.cos(a) * 2.1, 1.8, -4 + Math.sin(a) * 2.1); g.add(p); }
    const roof = mesh(new THREE.ConeGeometry(2.9, 1.4, 6), clay('#C0392B')); roof.position.set(14.5, 3.9, -4); g.add(roof);
    for (const [dx, dz, c] of [[-0.8, 0, '#F2C14E'], [0.7, 0.4, '#5B8DD6'], [0, -0.8, '#FFFFFF']]) { const d = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.55, 16), clay(c)); d.position.set(14.5 + dx, 0.7, -4 + dz); g.add(d); } }
  // ที่ดินแปลงที่ 2 (ตะวันออกเฉียงเหนือ): ลานกีฬาและกิจกรรม
  g = fgroup('land2');
  { const p = mesh(rbox(23, 0.3, 9, 0.2), clay('#BFDC98'), { cast: false }); p.position.set(40.5, 0.06, -32.5); g.add(p);
    const court = mesh(rbox(12, 0.12, 6, 0.1), clay('#E07A5F'), { cast: false }); court.position.set(44.5, 0.22, -32.5); g.add(court);
    const line = mesh(new THREE.BoxGeometry(0.12, 0.04, 6), clay('#FFFFFF', { noBump: true }), { cast: false }); line.position.set(44.5, 0.3, -32.5); g.add(line);
    for (const s of [-1, 1]) { const hoop = mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 14), clay('#E0473B')); hoop.rotation.x = Math.PI / 2; hoop.position.set(44.5 + s * 5.3, 2.6, -32.5); g.add(hoop);
      const board = mesh(rbox(0.12, 1, 1.6, 0.05), clay('#FFFFFF')); board.position.set(44.5 + s * 5.8, 3, -32.5); g.add(board);
      const pole = mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), clay('#8C8C8C')); pole.position.set(44.5 + s * 6.1, 1.5, -32.5); g.add(pole); }
    for (const [x, z] of [[31, -29.6], [31, -35.4]]) { const t = mesh(new THREE.IcosahedronGeometry(1.1, 1), clay('#7DBB5E')); t.position.set(x, 1.8, z); g.add(t);
      const tr = mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), clay('#8A5A3C')); tr.position.set(x, 0.6, z); g.add(tr); }
    lotFence(g, 29.5, 51.5, -36.5, -28.5); }
  // รั้วแปลงที่ 1
  lotFence(facilities.expansion, -21.5, 21.5, -36.5, -28.5, true);
  // ---- รายการรอบที่ 4 ----
  // ตัดแต่งและค้ำยันต้นไม้
  g = fgroup('treecare');
  for (const [x, z] of [[-12, 17], [10, 16], [-28, 6], [-28, 16], [20, 18], [-28, -6]]) {
    for (const a of [0.6, 2.7, 4.8]) { const p = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), clay('#B07A4F')); p.position.set(x + Math.cos(a) * 0.8, 1.05, z + Math.sin(a) * 0.8); p.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(p); }
    const band = mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 14), clay('#FFFFFF')); band.rotation.x = Math.PI / 2; band.position.set(x, 1.6, z); g.add(band);
  }
  // ระบบสูบน้ำและคันกั้นน้ำ
  g = fgroup('pump');
  { const h = mesh(rbox(2.2, 1.8, 1.6, 0.15), clay('#9FB3BF')); h.position.set(21.4, 0.9, -14.2); g.add(h);
    const pipe = mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 10), clay('#3E5C8A')); pipe.rotation.z = Math.PI / 2; pipe.position.set(21.4, 0.5, -12.7); g.add(pipe);
    const bag = clay('#CDB991');
    for (const [x1, x2, z] of [[-30, -6, 18.3], [6, 13, 18.3], [-29, -10, -7.4], [-9, 8, -8.1]]) for (let x = x1; x < x2; x += 0.95) { const b = mesh(rbox(0.9, 0.35, 0.5, 0.15), bag); b.position.set(x + 0.45, 0.2, z); g.add(b); } }
  // เครื่องกำเนิดไฟฟ้าสำรอง
  g = fgroup('generator');
  { const b = mesh(rbox(1.9, 1.3, 1.2, 0.15), clay('#E3B341')); b.position.set(21.5, 0.65, -11.3); g.add(b);
    const ex = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 8), clay('#5A5A5A')); ex.position.set(22.1, 1.7, -11.6); g.add(ex);
    const pnl = mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), clay('#2C3E57', { emissive: '#6FE07A', ei: 0.6, noBump: true })); pnl.position.set(21.2, 0.85, -10.68); g.add(pnl); }
  // อินเทอร์เน็ตไร้สาย: เสาสัญญาณข้างอาคาร
  g = fgroup('wifi');
  for (const [x, z, h] of [[-10.3, -14.9, 11], [8.6, -15.4, 8.5], [19.6, 0.3, 6.5]]) {
    const m = mesh(new THREE.CylinderGeometry(0.06, 0.09, h, 8), clay('#E9E9E9', { noBump: true })); m.position.set(x, h / 2, z); g.add(m);
    for (const k of [0, 1, 2]) { const r = mesh(new THREE.TorusGeometry(0.25 + k * 0.22, 0.04, 6, 16, Math.PI / 2), clay('#4FC3F7', { emissive: '#4FC3F7', ei: 0.8, noBump: true })); r.position.set(x, h + 0.1, z); r.rotation.set(0, 0, Math.PI / 4); g.add(r); }
  }
  // ห้องปลอดฝุ่น
  g = fgroup('airpurifier');
  { const b = mesh(rbox(3.4, 2.6, 2.8, 0.25), new THREE.MeshStandardMaterial({ color: '#DDF2F0', transparent: true, opacity: 0.75, roughness: 0.2 })); b.position.set(-11.8, 1.3, -17.6); g.add(b);
    const r = mesh(rbox(3.8, 0.3, 3.2, 0.12), clay('#7FC2BC')); r.position.set(-11.8, 2.75, -17.6); g.add(r);
    const fan = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 16), clay('#FFFFFF', { emissive: '#BFEFFF', ei: 0.5 })); fan.rotation.x = Math.PI / 2; fan.position.set(-11.8, 1.6, -16.15); g.add(fan); }
  // ระบบดับเพลิง: ถังดับเพลิงและกริ่งเตือนหน้าอาคาร
  g = fgroup('fire');
  for (const [x, z] of [[-10.5, -6.9], [9.2, -7.7], [11.2, 6.4], [-14.2, 7.7], [-8.6, -14.6], [14.2, -7.7]]) {
    const st = mesh(rbox(0.5, 0.9, 0.4, 0.08), clay('#FFFFFF')); st.position.set(x, 0.45, z); g.add(st);
    const ext = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 12), clay('#D7372B')); ext.position.set(x, 1.15, z); g.add(ext);
    const bell = mesh(new THREE.SphereGeometry(0.18, 12, 8), clay('#E0473B', { emissive: '#E0473B', ei: 0.4 })); bell.position.set(x, 2.6, z - 0.1); g.add(bell);
  }
  // ศูนย์ภาษาและวัฒนธรรม
  g = fgroup('langlab');
  { const b = mesh(rbox(7, 3.4, 3.6, 0.3), clay('#FFF1E6')); b.position.set(3.5, 1.7, -18.5); g.add(b);
    const r = mesh(rbox(7.6, 0.45, 4.2, 0.15), clay('#D9824A')); r.position.set(3.5, 3.6, -18.5); g.add(r);
    for (let k = 0; k < 3; k++) { const w = mesh(rbox(1.5, 1.2, 0.12, 0.08), clay('#FFE6A8', { emissive: '#FFC86B', ei: 0.35 })); w.position.set(1.3 + k * 2.2, 1.9, -16.68); g.add(w); }
    const cols = ['#C0392B', '#2E86C1', '#F1C40F', '#27AE60', '#8E44AD'];
    cols.forEach((c, k) => { const p = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), clay('#DDDDDD')); p.position.set(0.6 + k * 1.45, 1.6, -16.2); g.add(p);
      const f = mesh(new THREE.BoxGeometry(0.75, 0.45, 0.03), clay(c, { noBump: true })); f.position.set(0.98 + k * 1.45, 2.95, -16.2); g.add(f); }); }
  // ห้อง STEM และเมกเกอร์สเปซ (ที่ดินแปลงที่ 1)
  g = fgroup('maker');
  { const b = mesh(rbox(3.2, 3.2, 6, 0.3), clay('#E8EEF8')); b.position.set(-19.3, 1.6, -32.5); g.add(b);
    const r = mesh(rbox(3.6, 0.4, 6.4, 0.15), clay('#F28C6B')); r.position.set(-19.3, 3.4, -32.5); g.add(r);
    const gear = mesh(new THREE.TorusGeometry(0.55, 0.18, 8, 8), clay('#F2C14E')); gear.position.set(-17.65, 2.2, -32.5); gear.rotation.y = Math.PI / 2; g.add(gear); }
  // หอประชุม (ที่ดินแปลงที่ 2)
  g = fgroup('hall');
  { const b = mesh(rbox(8, 5, 7, 0.4), clay('#F6E7C8')); b.position.set(34.5, 2.5, -32.5); g.add(b);
    const roof = mesh(new THREE.CylinderGeometry(4.6, 4.6, 8.4, 24, 1, false, 0, Math.PI), clay('#9B7BC8')); roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.scale.set(1, 1, 0.55); roof.position.set(34.5, 5, -32.5); g.add(roof);
    const door = mesh(rbox(2.4, 2.6, 0.2, 0.1), clay('#A86F4C')); door.position.set(34.5, 1.3, -28.95); g.add(door); }
  // ---- ที่ดินแปลงที่ 3–4 (ส่วนขยายด้านตะวันออก) และอาคารบนที่ดินใหม่ ----
  const extLot = (id, z1, z2, label) => {
    const g = fgroup(id);
    const d = mesh(rbox(28, 5, z2 - z1, 1.2, 3), clay('#C98F62')); d.position.set(72, -2.6, (z1 + z2) / 2); g.add(d);
    const gr = mesh(rbox(27.4, 1.2, z2 - z1 - 0.6, 0.5, 3), clay('#9CCB7A')); gr.position.set(72, -0.6, (z1 + z2) / 2); g.add(gr);
    const pad = mesh(rbox(24, 0.3, z2 - z1 - 4, 0.2), clay('#BFDC98'), { cast: false }); pad.position.set(72, 0.06, (z1 + z2) / 2); g.add(pad);
    lotFence(g, 60, 84, z1 + 2, z2 - 2);
    return g;
  };
  extLot('land3', -11, 15);
  extLot('land4', -37, -11);
  // อาคารเรียนหลังที่ 2
  g = fgroup('newbldg2');
  { const sg = new THREE.Group(); sg.position.set(66, 0, 2); g.add(sg);
    const b = mesh(rbox(10, 9, 6.5, 0.35), clay('#FDEBD3')); b.position.y = 4.5; sg.add(b);
    windowsOn(sg, 8.6, 9, 6.5, 3, '#FFE6A8');
    const r = pitchedRoof(sg, 10, 6.5, 2.8, '#2F8F88'); r.position.y = 8.95; }
  // โรงยิมเนเซียม
  g = fgroup('gym');
  { const b = mesh(rbox(9, 5, 9, 0.4), clay('#E8EEF8')); b.position.set(78, 2.5, 2); g.add(b);
    const roof = mesh(new THREE.CylinderGeometry(4.8, 4.8, 9.4, 24, 1, false, 0, Math.PI), clay('#5B8DD6')); roof.rotation.z = Math.PI / 2; roof.scale.set(1, 1, 0.5); roof.position.set(78, 5, 2); g.add(roof);
    const door = mesh(rbox(2.6, 2.8, 0.2, 0.1), clay('#3E5C8A')); door.position.set(78, 1.4, 6.55); g.add(door); }
  // อาคารปฏิบัติการวิทยาศาสตร์
  g = fgroup('scibldg');
  { const sg = new THREE.Group(); sg.position.set(66, 0, -24); g.add(sg);
    const b = mesh(rbox(10, 6.5, 6, 0.35), clay('#E7F2EC')); b.position.y = 3.25; sg.add(b);
    windowsOn(sg, 8.6, 6.5, 6, 2, '#CFEFFF');
    const slab = mesh(rbox(10.6, 0.5, 6.6, 0.2), clay('#4AA3A2')); slab.position.y = 6.75; sg.add(slab);
    const flask = mesh(new THREE.ConeGeometry(0.7, 1.4, 16), clay('#BFE3F2', { emissive: '#7FD3FF', ei: 0.4 })); flask.position.set(3, 7.7, 0); sg.add(flask); }
  // บ้านพักครู
  g = fgroup('housing');
  for (let k = 0; k < 4; k++) { const sg = new THREE.Group(); sg.position.set(74 + (k % 2) * 6, 0, -29 + Math.floor(k / 2) * 8); g.add(sg);
    const b = mesh(rbox(4.6, 3, 4, 0.3), clay(['#FFF1E6', '#F6E3D3', '#FBEFD9', '#EFF6EA'][k])); b.position.y = 1.5; sg.add(b);
    const r = pitchedRoof(sg, 4.6, 4, 1.6, ['#C77B4A', '#B05A4A', '#D9824A', '#7A6FA8'][k]); r.position.y = 2.95; }
}
function lotFence(g, x1, x2, z1, z2, gate = false) {
  const mat = clay('#F6E7C8');
  const post = (x, z, w, d) => { const p = mesh(rbox(w, 0.9, d, 0.12), mat); p.position.set(x, 0.55, z); g.add(p); };
  for (let x = x1; x < x2 - 0.1; x += 2.2) { const w = Math.min(2, x2 - x - 0.2); if (w < 0.4) continue; post(x + w / 2, z1, w, 0.3); if (!(gate && Math.abs(x + w / 2) < 2.4)) post(x + w / 2, z2, w, 0.3); }
  for (let z = z1; z < z2 - 0.1; z += 2.2) { const d = Math.min(2, z2 - z - 0.2); if (d < 0.4) continue; post(x1, z + d / 2, 0.3, d); post(x2, z + d / 2, 0.3, d); }
}
export function setFacilities(list) {
  const set = new Set(list || []);
  for (const [id, g] of Object.entries(facilities)) {
    if (id === 'expansion' || id === 'land2' || id === 'land3' || id === 'land4') continue;
    const on = set.has(id);
    if (on && !g.visible) { g.visible = true; g.scale.set(1, 0.01, 1); g.userData.grow = 0; }
    if (!on) g.visible = false;
  }
  facilities.expansion.visible = landNow >= 1 || set.has('dome') || set.has('newbldg');
  facilities.land2.visible = landNow >= 2;
  facilities.land3.visible = landNow >= 3;
  facilities.land4.visible = landNow >= 4;
  ownedNow = set; refreshTags();
}
let landNow = 0, ownedNow = new Set();
export function setLand(n) {
  const was = landNow; landNow = n || 0;
  for (const [id, need] of [['expansion', 1], ['land2', 2], ['land3', 3], ['land4', 4]]) {
    const g = facilities[id]; const on = landNow >= need || (id === 'expansion' && (ownedNow.has('dome') || ownedNow.has('newbldg')));
    if (on && !g.visible) { g.visible = true; g.scale.set(1, 0.01, 1); g.userData.grow = 0; }
    if (!on) g.visible = false;
  }
  if (was !== landNow) refreshTags();
}
let studentShow = 16;
export function setStudentCount(n) {
  studentShow = Math.max(6, Math.min(MAX_STUDENTS, Math.round(n / 40)));
  applyStudentVisibility();
}
function applyStudentVisibility() {
  // จำนวนนักเรียนที่เห็นขึ้นกับจำนวนนักเรียนจริงและช่วงเวลาของวัน
  const frac = { night: 0, class: 0.25, home: 0.4 }[studentMode] ?? 1;
  const show = Math.round(studentShow * frac);
  for (let i = 0; i < MAX_STUDENTS; i++) { const c = chars['student' + i]; if (c) c.group.visible = i < show; }
}
let crisisOn = false;
export function setCrisis(on) {
  crisisOn = !!on;
  const sky = new THREE.Color(on ? '#B9BDBA' : '#BFE3E0');
  scene.background = sky; scene.fog.color = sky;
  if (sunLight) sunLight.intensity = on ? 1.3 : 2.3;
  if (hemiLight) hemiLight.intensity = on ? 0.9 : 1.15;
  renderer.toneMappingExposure = on ? 0.92 : 1.05;
}


// ---------- ภัยในเมือง (การ์ดวิกฤต) ----------
let hazard = null;   // { type, group, t, level, leaving, rain }
const HAZ_SKY = { flood: '#7F8B8E', blackout: '#3E4A57', tree: '#A9B6B4', haze: '#CDBB9C' };
export function setHazard(type, { mitigated = false } = {}) {
  if (hazard?.type === type && !hazard.leaving) return;
  clearHazardNow();
  if (!type) return;
  const g = new THREE.Group(); g.userData.dynamic = true; scene.add(g);
  hazard = { type, group: g, t: 0, t0: performance.now(), level: 0, leaving: false, mitigated };
  if (type === 'flood') {
    // ผืนน้ำขุ่นคลุมทั้งเมือง สูงขึ้นช้า ๆ มีคลื่นเล็ก ๆ และเศษขยะลอย
    const geo = new THREE.PlaneGeometry(116, 84, 58, 42);
    const mat = new THREE.MeshStandardMaterial({ color: '#8A8262', roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.88 });
    const w = new THREE.Mesh(geo, mat); w.rotation.x = -Math.PI / 2; w.position.set(2, -0.4, 2); w.receiveShadow = true; g.add(w);
    hazard.water = w; hazard.base = Float32Array.from(geo.attributes.position.array);
    hazard.target = mitigated ? 0.55 : 1.15;
    hazard.debris = [];
    for (let i = 0; i < 26; i++) {
      const d = mesh(i % 3 ? rbox(0.5, 0.18, 0.35, 0.06) : new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), clay(['#C9A27A', '#7FA37A', '#E9E9E9', '#5B8DD6'][i % 4]));
      d.position.set(-30 + Math.random() * 54, 0, -20 + Math.random() * 40); d.rotation.y = Math.random() * 6; g.add(d);
      hazard.debris.push({ m: d, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4 });
    }
    addRain(g, 1400);
  } else if (type === 'blackout') {
    hazard.dim = mitigated ? 0.55 : 0.25;
    hazard.glow = [];
    scene.traverse(o => { if (o.isMesh && o.material?.emissiveIntensity > 0) { o.userData.ei0 ??= o.material.emissiveIntensity; hazard.glow.push(o); } });
    if (mitigated) { // ไฟสำรองติดที่ห้องพยาบาลและห้องคอมพิวเตอร์
      for (const [x, z] of [[20.8, 9.2], [-19, -16.3], [0, -8.3]]) { const l = new THREE.PointLight('#FFE7A8', 18, 14); l.position.set(x, 3, z); g.add(l); }
    }
    const sparks = mesh(new THREE.SphereGeometry(0.25, 10, 8), clay('#FFF2A8', { emissive: '#FFD84D', ei: 2, noBump: true })); sparks.position.set(-15, 3.2, 8.6); g.add(sparks); hazard.spark = sparks;
    const wire = mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 6), clay('#222222', { noBump: true })); wire.position.set(-15, 1.8, 8.6); wire.rotation.z = 0.5; g.add(wire);
  } else if (type === 'tree') {
    // ต้นไม้ใหญ่ล้มขวางทางเข้า กิ่งพาดสายไฟ
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.45, 0.6, 9, 12), clay('#7A5236')); trunk.rotation.z = Math.PI / 2; trunk.position.set(0, 0.6, 0); t.add(trunk);
    for (const [x, y, z, r] of [[4.4, 1.6, 0, 1.8], [5.2, 1.2, 1.4, 1.4], [3.6, 1.1, -1.5, 1.5], [5.8, 1.9, -0.6, 1.3]]) { const c = mesh(new THREE.IcosahedronGeometry(r, 1), clay('#6AAE50')); c.position.set(x, y, z); t.add(c); }
    const root = mesh(new THREE.CylinderGeometry(1.3, 0.6, 0.6, 10), clay('#8A5A3C')); root.rotation.z = Math.PI / 2; root.position.set(-4.6, 0.9, 0); t.add(root);
    t.position.set(-1.5, 0, 15.5); t.rotation.y = 0.35; g.add(t); hazard.tree = t;
    for (const x of [-6.5, 5.5]) { const cone = mesh(new THREE.ConeGeometry(0.3, 0.8, 10), clay('#F28C3A')); cone.position.set(x, 0.4, 14.2); g.add(cone); }
    addRain(g, mitigated ? 300 : 700);
  } else if (type === 'haze') {
    hazard.fog = mitigated ? [85, 220] : [55, 185];
  } else if (type === 'dogs') {
    spawnStrays(mitigated ? 2 : 4);
  }
}
function addRain(g, n) {
  const pos = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { const x = -50 + Math.random() * 104, y = Math.random() * 40, z = -36 + Math.random() * 78; pos.set([x, y, z, x - 0.15, y - 1.1, z], i * 6); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const r = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#D9E6EA', transparent: true, opacity: 0.55 }));
  g.add(r); hazard.rain = r;
}
export function clearHazard() { if (hazard) hazard.leaving = true; }
export function hazardNow() { return hazard && !hazard.leaving ? hazard.type : null; }
function clearHazardNow() {
  if (!hazard) return;
  if (hazard.type === 'dogs') removeStrays();
  scene.remove(hazard.group);
  restoreAtmosphere();
  hazard = null;
}
function restoreAtmosphere() {
  const sky = new THREE.Color(crisisOn ? '#B9BDBA' : '#BFE3E0');
  scene.background = sky; scene.fog.color = sky; scene.fog.near = 110; scene.fog.far = 230;
  if (sunLight) sunLight.intensity = crisisOn ? 1.3 : 2.3;
  if (hemiLight) hemiLight.intensity = crisisOn ? 0.9 : 1.15;
  renderer.toneMappingExposure = crisisOn ? 0.92 : 1.05;
  scene.traverse(o => { if (o.isMesh && o.userData.ei0 != null) o.material.emissiveIntensity = o.userData.ei0; });
}
function tickHazard(dt, t) {
  if (!hazard) return;
  const h = hazard;
  // ใช้เวลาจริง ไม่ผูกกับจำนวนเฟรม เครื่องช้าก็ยังเห็นน้ำขึ้นภายในเวลาเดียวกัน
  const now = performance.now();
  if (h.leaving && !h.l0) { h.l0 = now; h.lk = h.level || 1; }
  const k = h.leaving ? Math.max(0, h.lk - (now - h.l0) / 5000) : Math.min(1, (now - h.t0) / 6000);
  h.level = k;
  if (HAZ_SKY[h.type]) {
    const sky = new THREE.Color(crisisOn ? '#B9BDBA' : '#BFE3E0').lerp(new THREE.Color(HAZ_SKY[h.type]), k);
    scene.background = sky; scene.fog.color = sky;
  }
  if (h.type === 'flood' && h.water) {
    h.water.position.y = -0.4 + (h.target + 0.4) * k;
    const p = h.water.geometry.attributes.position, b = h.base;
    for (let i = 0; i < p.count; i++) { const x = b[i * 3], y = b[i * 3 + 1]; p.array[i * 3 + 2] = Math.sin(x * 0.35 + t * 1.3) * 0.06 + Math.cos(y * 0.42 + t * 1.1) * 0.05; }
    p.needsUpdate = true; h.water.geometry.computeVertexNormals();
    for (const d of h.debris) { d.m.position.y = h.water.position.y + 0.05 + Math.sin(t * 1.8 + d.ph) * 0.05; d.m.position.x += d.vx * dt; d.m.position.z += d.vz * dt; d.m.rotation.y += dt * 0.2; d.m.visible = h.water.position.y > 0.1; }
    if (sunLight) sunLight.intensity = 2.3 - 1.2 * k;
  }
  if (h.type === 'blackout') {
    const dim = 1 - (1 - h.dim) * k;
    if (sunLight) sunLight.intensity = 2.3 * (1 - 0.85 * k * (h.mitigated ? 0.8 : 1)); if (hemiLight) hemiLight.intensity = 1.15 * (1 - 0.55 * k);
    renderer.toneMappingExposure = 1.05 * (1 - 0.28 * k) * (0.9 + 0.1 * dim);
    for (const o of h.glow) o.material.emissiveIntensity = o.userData.ei0 * (1 - 0.92 * k);
    if (h.spark) h.spark.visible = !h.leaving && Math.sin(t * 23) > 0.3;
  }
  if (h.type === 'haze' && h.fog) { scene.fog.near = 110 + (h.fog[0] - 110) * k; scene.fog.far = 230 + (h.fog[1] - 230) * k; if (sunLight) sunLight.intensity = 2.3 - 0.9 * k; }
  if (h.type === 'tree' && h.tree && h.leaving) h.tree.position.y = -3 * (1 - k);
  if (h.rain) { const p = h.rain.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) { let y = p.array[i * 3 + 1] - dt * 38; if (y < 0) y += 40; p.array[i * 3 + 1] = y; p.array[i * 3 + 4] = y - 1.1; } p.needsUpdate = true; h.rain.material.opacity = 0.55 * k; }
  if (h.leaving && k <= 0) clearHazardNow();
}


// ---------- นาฬิกาในเกม กลางวัน กลางคืน และกิจวัตรของโรงเรียน ----------
// เวลาไม่ใช่เวลาจริง: ช่วงกลางวันเดินช้า ช่วงกลางคืนเดินเร็ว ช่วงเข้าแถวเดินช้าเป็นพิเศษให้เห็นพิธี
let clockMin = 6 * 60 + 40, dayIdx = 0, studentMode = 'arrive', clockOn = true;
const DAYS = ['วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์'];
const SKY_KEYS = [[0, '#16203A'], [5, '#24304F'], [6, '#F3C29D'], [7.5, '#BFE3E0'], [17, '#BFE3E0'], [18.2, '#F2A27A'], [19.2, '#2A3557'], [24, '#16203A']];
function lerpKey(keys, h) {
  for (let i = 0; i < keys.length - 1; i++) if (h >= keys[i][0] && h <= keys[i + 1][0]) {
    const k = (h - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
    return new THREE.Color(keys[i][1]).lerp(new THREE.Color(keys[i + 1][1]), k);
  }
  return new THREE.Color(keys[0][1]);
}
function dayLight(h) { // 0 = กลางคืน, 1 = กลางวันเต็มที่
  if (h < 5.5 || h > 19.3) return 0;
  if (h < 7.2) return (h - 5.5) / 1.7;
  if (h > 17.4) return 1 - (h - 17.4) / 1.9;
  return 1;
}
function modeAt(m) {
  if (m < 6 * 60 + 15 || m >= 18 * 60 + 30) return 'night';
  if (m < 7 * 60 + 40) return 'arrive';
  if (m < 8 * 60 + 15) return 'assembly';
  if (m < 15 * 60 + 30) return 'class';
  if (m < 17 * 60 + 30) return 'sports';
  return 'home';
}
const MODE_TH = { night: 'กลางคืน · โรงเรียนปิด', arrive: 'นักเรียนเดินทางมาโรงเรียน', assembly: 'เข้าแถวเคารพธงชาติ', class: 'เวลาเรียน', sports: 'กิจกรรมกีฬาหลังเลิกเรียน', home: 'นักเรียนกลับบ้าน' };
export function clockInfo() {
  const hh = String(Math.floor(clockMin / 60)).padStart(2, '0'), mm = String(Math.floor(clockMin % 60)).padStart(2, '0');
  return { time: `${hh}:${mm}`, day: DAYS[dayIdx % 5], mode: studentMode, label: MODE_TH[studentMode] };
}
export function setClockRunning(on) { clockOn = on; }
export function setClock(min) { clockMin = min; }
let flagMover = null, ball = null, ballT = 0, ballFrom = null, ballTo = null, lampLights = [];
function minuteSeconds(m) { // วินาทีจริงต่อ 1 นาทีในเกม
  if (m >= 7 * 60 + 35 && m < 8 * 60 + 15) return 0.75;
  if (m < 6 * 60 || m >= 19 * 60) return 0.05;
  return 0.35;
}
function tickClock(dt) {
  if (!clockOn) return;
  clockMin += dt / minuteSeconds(clockMin);
  if (clockMin >= 1440) { clockMin -= 1440; dayIdx++; }
  const mode = modeAt(clockMin);
  if (mode !== studentMode) { studentMode = mode; onModeChange(); }
  const h = clockMin / 60, L = dayLight(h);
  let sky = lerpKey(SKY_KEYS, h);
  if (crisisOn) sky.lerp(new THREE.Color('#9AA09D'), 0.5);
  scene.background = sky; scene.fog.color = sky;
  if (sunLight) { sunLight.intensity = (0.12 + 2.18 * L) * (crisisOn ? 0.6 : 1); const a = (h - 6) / 12 * Math.PI; sunLight.position.set(Math.cos(a) * 60, 25 + Math.sin(Math.max(0, a)) * 50, 30); }
  if (hemiLight) hemiLight.intensity = 0.38 + 0.77 * L;
  renderer.toneMappingExposure = 0.88 + 0.17 * L;
  for (const l of lampLights) l.intensity = (1 - L) * 22;
  // ธงชาติ: ชักขึ้นตอน 08:00 ลดลงตอน 18:00
  if (flagMover) {
    const m = clockMin, top = 7.9, low = 1.6;
    let y = top;
    if (m >= 7 * 60 + 55 && m < 8 * 60) y = low + (top - low) * ((m - (7 * 60 + 55)) / 5);
    else if (m >= 18 * 60 && m < 18 * 60 + 5) y = top - (top - low) * ((m - 18 * 60) / 5);
    else if (m >= 18 * 60 + 5 || m < 7 * 60 + 55) y = low;
    flagMover.obj.position.y = y; flagMover.obj.visible = y > low + 0.05 || (m >= 7 * 60 + 40 && m < 8 * 60);
  }
  // ลูกบอลช่วงกีฬา
  if (ball) {
    ball.visible = studentMode === 'sports';
    if (ball.visible) {
      ballT += dt / 1.3;
      if (!ballFrom || ballT >= 1) { ballFrom = ball.position.clone(); const a = Math.random() * Math.PI * 2, r = Math.random() * 6; ballTo = new THREE.Vector3(-4 + Math.cos(a) * r * 1.1, 0.3, 7 + Math.sin(a) * r * 0.7); ballT = 0; }
      ball.position.lerpVectors(ballFrom, ballTo, ballT); ball.position.y = 0.3 + Math.sin(ballT * Math.PI) * 1.6;
    }
  }
}
function onModeChange() {
  applyStudentVisibility();
  for (let i = 0; i < MAX_STUDENTS; i++) { const c = chars['student' + i]; if (c) { c.target = null; c.wait = Math.random() * 1.5; } }
  handlers.onClockMode?.(studentMode);
}
// ตำแหน่งแถวเคารพธงชาติ หันหน้าไปทางเสาธง
function assemblySlot(i) { const col = i % 8, row = Math.floor(i / 8); return new THREE.Vector3(-5.2 + col * 1.5, 0.2, 0.2 + row * 1.5); }
function lapPoint(c, t) { const a = c.phase + t * 0.35; return new THREE.Vector3(-4 + Math.cos(a) * 8.85 * 1.15, 0.2, 7 + Math.sin(a) * 8.85 * 0.8); }
function studentTarget(c, i, t) {
  if (studentMode === 'assembly') return assemblySlot(i);
  if (studentMode === 'sports') return i % 3 === 0 ? lapPoint(c, t) : null;
  if (studentMode === 'home') return new THREE.Vector3(-4 + (i % 5) * 2 - 4, 0.2, 20.5);
  return null;
}
function setupDaily() {
  flagMover = movers.find(m => m.type === 'flag') || null;
  ball = mesh(new THREE.SphereGeometry(0.3, 16, 12), clay('#FFFFFF')); ball.userData.dynamic = true; ball.position.set(-4, 0.3, 7); ball.visible = false; scene.add(ball);
  for (const [x, z] of [[-4, 0], [0, 12], [-20, 6], [14, -6], [-14, -14]]) { const l = new THREE.PointLight('#FFD99A', 0, 26, 1.6); l.position.set(x, 5, z); scene.add(l); lampLights.push(l); }
}

// ---------- สัตว์ในโรงเรียน ----------
function makePet(kind) {
  const g = new THREE.Group();
  const col = kind === 'cat' ? '#F2A65A' : kind === 'dog2' ? '#3A2E28' : '#C9A27A';
  const s = kind === 'cat' ? 0.55 : 0.8;
  const body = mesh(new THREE.CapsuleGeometry(0.35 * s, 0.7 * s, 4, 10), clay(col)); body.rotation.z = Math.PI / 2; body.position.y = 0.55 * s; g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.32 * s, 14, 10), clay(col)); head.position.set(0.62 * s, 0.85 * s, 0); g.add(head);
  for (const z of [-0.14, 0.14]) { const ear = mesh(new THREE.ConeGeometry(0.1 * s, 0.25 * s, 6), clay(col)); ear.position.set(0.62 * s, 1.15 * s, z * s); g.add(ear); }
  const tail = mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.6 * s, 6), clay(col)); tail.position.set(-0.7 * s, 0.8 * s, 0); tail.rotation.z = kind === 'cat' ? -0.3 : 0.9; g.add(tail);
  const legs = [];
  for (const [x, z] of [[0.35, 0.18], [0.35, -0.18], [-0.35, 0.18], [-0.35, -0.18]]) { const l = mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.45 * s, 6), clay(col)); l.position.set(x * s, 0.22 * s, z * s); g.add(l); legs.push(l); }
  g.userData.legs = legs; g.userData.dynamic = true;
  return g;
}
const pets = [];
function spawnPets() {
  for (const [kind, x, z, label] of [['cat', -18, 15.5, 'แมวประจำโรงอาหาร'], ['dog', 19, -2, 'สุนัขประจำโรงเรียน']]) {
    const g = makePet(kind); g.position.set(x, 0.15, z); scene.add(g);
    pets.push({ g, home: new THREE.Vector3(x, 0.15, z), target: null, wait: Math.random() * 3, speed: kind === 'cat' ? 0.8 : 1.4, wander: kind === 'cat' ? 3 : 7, labelEl: makeLabel(label, 'c-label pet-label') });
  }
}
function tickPets(dt, t) {
  for (const p of pets) {
    if (!p.g.visible) continue;
    if (!p.target) { p.wait -= dt; if (p.wait <= 0) { const a = Math.random() * 6.28, r = Math.random() * p.wander; p.target = p.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); } continue; }
    const to = p.target.clone().sub(p.g.position); to.y = 0; const d = to.length();
    if (d < 0.1) { p.target = null; p.wait = 2 + Math.random() * 6; if (p.away) p.g.visible = false; continue; }
    p.g.position.add(to.normalize().multiplyScalar(Math.min(d, p.speed * dt)));
    p.g.rotation.y = Math.atan2(-to.z, to.x);
    p.g.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 12 + i * 1.6) * 0.5; });
  }
}
function updatePetLabels(dist) {
  for (const p of pets) {
    if (!p.labelEl) continue;
    const pos = p.g.position.clone(); pos.y += 1.4; const pr = project(pos);
    const vis = p.g.visible && !pr.behind && dist < 45;
    p.labelEl.style.display = vis ? '' : 'none';
    if (vis) p.labelEl.style.transform = `translate(-50%,-100%) translate(${pr.x}px,${pr.y}px)`;
  }
}
// ฝูงสุนัขจรจัด (ใช้กับการ์ดเหตุสุนัขกัด)
let strayDogs = [];
function spawnStrays(n) {
  for (let i = 0; i < n; i++) {
    const g = makePet(i % 2 ? 'dog2' : 'dog'); g.position.set(-2 + i * 1.2, 0.15, 22); scene.add(g);
    const p = { g, home: new THREE.Vector3(-4 + i * 2, 0.15, 12), target: new THREE.Vector3(-6 + i * 2.5, 0.15, 13 - i), wait: 0, speed: 3.2, wander: 6, stray: true };
    pets.push(p); strayDogs.push(p);
  }
}
function removeStrays() {
  for (const p of strayDogs) { p.target = new THREE.Vector3(p.g.position.x, 0.15, 30); p.away = true; p.speed = 4; }
  strayDogs = [];
}

// ---------- รองผู้อำนวยการและครูที่ได้รับจัดสรรเพิ่ม ----------
let staffKeys = [];
export function setStaff(deputies = [], extraTeachers = 0) {
  if (!scene) return;
  for (const k of staffKeys) { scene.remove(chars[k].group); chars[k].labelEl?.remove(); delete chars[k]; }
  staffKeys = [];
  deputies.forEach((d, i) => {
    const g = makeCharacter(d.look); const x = -8 + i * 3, z = -7.6; g.position.set(x, 0.2, z); scene.add(g);
    const key = 'staff_' + d.id;
    chars[key] = { group: g, home: g.position.clone(), target: null, wait: 1 + i, wander: 2.5, phase: Math.random() * 6, labelEl: makeLabel(d.name, 'c-label') };
    staffKeys.push(key);
  });
  const looks = [['#9CCB7A', '#F2C9A5'], ['#E8C25A', '#D9A77F'], ['#7FA7D9', '#C99772'], ['#E07A9B', '#F2C9A5']];
  for (let i = 0; i < Math.min(8, extraTeachers); i++) {
    const [shirt, skin] = looks[i % 4];
    const g = makeCharacter({ shirt, skin, hair: '#2B1D16', acc: i % 2 ? 'long' : null }); g.position.set(-26 + (i % 4) * 4, 0.2, -3.5 - Math.floor(i / 4) * 1.5); scene.add(g);
    const key = 'staffT' + i;
    chars[key] = { group: g, home: g.position.clone(), target: null, wait: Math.random() * 3, wander: 3, phase: Math.random() * 6, labelEl: i === 0 ? makeLabel(`ครูที่ได้รับจัดสรรเพิ่ม ${extraTeachers} คน`, 'c-label') : null };
    staffKeys.push(key);
  }
}

// ---------- ถ้วยรางวัลในหอเกียรติยศ ----------
export function setTrophies(n) {
  if (!trophyGroup) return;
  while (trophyGroup.children.length) trophyGroup.remove(trophyGroup.children[0]);
  const gold = clay('#F2C14E', { rough: 0.35, emissive: '#B8860B', ei: 0.15, bump: 0.15 });
  const shown = Math.min(n, 10);
  for (let i = 0; i < shown; i++) {
    const cup = new THREE.Group();
    const base = mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.16, 12), clay('#8A5A3C'));
    const stem = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 10), gold); stem.position.y = 0.23;
    const bowl = mesh(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold); bowl.rotation.x = Math.PI; bowl.position.y = 0.6;
    const rim = mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 16), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6;
    cup.add(base, stem, bowl, rim);
    cup.position.set(-2 + (i % 5) * 1, 0.08, i < 5 ? -0.35 : 0.35);
    trophyGroup.add(cup);
  }
}

// ---------- ภาพตัวละครที่เด้งขึ้นมาอ่านภารกิจ ----------
let pRenderer = null, pScene, pCam, pChar = null, pCharId = null, pPaper = null, pActive = false;
export function portraitCanvas() {
  if (pRenderer) return pRenderer.domElement;
  pRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  pRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  pRenderer.setSize(220, 250);
  pRenderer.outputColorSpace = THREE.SRGBColorSpace;
  pRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  pScene = new THREE.Scene();
  pScene.add(new THREE.HemisphereLight('#FFF4E0', '#B79A7A', 1.6));
  const key = new THREE.DirectionalLight('#FFE2BC', 2.2); key.position.set(2, 4, 5); pScene.add(key);
  pCam = new THREE.PerspectiveCamera(30, 220 / 250, 0.1, 50);
  pCam.position.set(0, 1.9, 6.2); pCam.lookAt(0, 1.55, 0);
  return pRenderer.domElement;
}
export function setPortrait(charId, size) {
  portraitCanvas();
  if (size) { pRenderer.setSize(size[0], size[1]); pCam.aspect = size[0] / size[1]; pCam.updateProjectionMatrix(); }
  pActive = !!charId;
  if (!charId || charId === pCharId) return;
  if (pChar) pScene.remove(pChar);
  const c = CHARACTERS[charId];
  pChar = makeCharacter(c.look, { small: false, isPlayer: charId === 'player' });
  // ท่าถือเอกสาร: แขนยื่นมาด้านหน้า
  const parts = pChar.userData.parts;
  parts.arms.forEach((a, i) => { a.rotation.x = -1.15; a.rotation.z = i ? -0.35 : 0.35; a.position.z = 0.25; });
  const paperTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160;
    const g = cv.getContext('2d'); g.fillStyle = '#FFFDF6'; g.fillRect(0, 0, 128, 160);
    g.fillStyle = '#D9714F'; g.fillRect(14, 16, 60, 10);
    g.fillStyle = '#C9BBA8'; for (let y = 40; y < 150; y += 14) g.fillRect(14, y, 100 - (y % 28 ? 20 : 0), 5);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  pPaper = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.03), [clay('#FFFDF6'), clay('#FFFDF6'), clay('#FFFDF6'), clay('#FFFDF6'), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9 }), clay('#F3EBDD')]);
  pPaper.position.set(0, 1.25, 0.78); pPaper.rotation.x = -0.35;
  pChar.add(pPaper);
  // รวมส่วนศีรษะ (ผม ตา ปาก แว่น หมวก) ให้หมุนไปด้วยกันเวลาก้มอ่าน
  const pivot = new THREE.Group(); pivot.position.set(0, 1.85, 0); pChar.add(pivot);
  for (const ch of [...pChar.children]) if (ch !== pivot && ch !== pPaper && ch.isMesh && ch.position.y >= 1.8) pivot.attach(ch);
  pChar.userData.headPivot = pivot;
  pChar.rotation.y = 0;
  pScene.add(pChar);
  pCharId = charId;
}
function renderPortrait(t) {
  if (!pActive || !pChar || !pRenderer.domElement.isConnected) return;
  const hp = pChar.userData.headPivot;
  hp.rotation.x = 0.22 + Math.sin(t * 1.6) * 0.05;   // ก้มอ่าน
  hp.rotation.y = Math.sin(t * 0.9) * 0.16;          // กวาดสายตาอ่าน
  pPaper.position.y = 1.25 + Math.sin(t * 1.6) * 0.03;
  pChar.position.y = Math.abs(Math.sin(t * 2.2)) * 0.03;
  pChar.rotation.y = Math.sin(t * 0.5) * 0.12;
  pRenderer.render(pScene, pCam);
}

// ---------- ภาพนิ่งตัวละครสำหรับทำเนียบบุคลากร ----------
const avatarCache = {};
export function avatarImage(charId) {
  if (avatarCache[charId]) return avatarCache[charId];
  portraitCanvas();
  const keepSize = pRenderer.getSize(new THREE.Vector2());
  pRenderer.setSize(180, 200); pCam.aspect = 180 / 200; pCam.updateProjectionMatrix();
  const c = CHARACTERS[charId];
  const g = makeCharacter(c.look, { small: false, isPlayer: charId === 'player' });
  const arm = g.userData.parts.arms[1]; arm.rotation.z = -2.5; // โบกมือทักทาย
  g.rotation.y = -0.25;
  const wasVisible = pChar ? pChar.visible : false; if (pChar) pChar.visible = false;
  pScene.add(g);
  pCam.position.set(0, 1.9, 6.6); pCam.lookAt(0, 1.5, 0);
  pRenderer.render(pScene, pCam);
  const url = pRenderer.domElement.toDataURL('image/png');
  pScene.remove(g); if (pChar) pChar.visible = wasVisible;
  pCam.position.set(0, 1.9, 6.2); pCam.lookAt(0, 1.55, 0);
  pRenderer.setSize(keepSize.x, keepSize.y); pCam.aspect = keepSize.x / keepSize.y; pCam.updateProjectionMatrix();
  avatarCache[charId] = url;
  return url;
}

// ---------- ถ่ายภาพเมือง ----------
export function snapshot(overview = false) {
  const keepPos = camera.position.clone(), keepTarget = controls.target.clone();
  if (overview) {
    // ภาพมุมกว้างของทั้งโรงเรียนสำหรับแชร์ แล้วคืนมุมกล้องเดิม
    controls.target.set(-2, 0, 2);
    camera.position.set(40, 46, 56);
    camera.lookAt(controls.target);
  }
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  if (overview) { camera.position.copy(keepPos); controls.target.copy(keepTarget); camera.lookAt(keepTarget); }
  return url;
}

// ---------- ลูป ----------
const ease = t => 1 - Math.pow(1 - t, 3);
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (flyAnim) {
    flyAnim.t = Math.min(1, flyAnim.t + dt / (flyAnim.dur || 0.9));
    const k = ease(flyAnim.t);
    controls.target.lerpVectors(flyAnim.from, flyAnim.to, k);
    camera.position.lerpVectors(flyAnim.camFrom, flyAnim.camTo, k);
    if (flyAnim.t >= 1) flyAnim = null;
  }
  // จำกัดการเลื่อนให้อยู่บนเกาะ
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -55, landNow >= 3 ? 84 : 58);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, -40, 42);
  controls.target.y = 0;
  controls.update();

  for (const [id, c] of Object.entries(chars)) if (c.group.visible) animateChar(id, c, dt, t);
  for (const g of Object.values(facilities)) if (g.visible && g.userData.grow != null) {
    g.userData.grow = Math.min(1, g.userData.grow + dt / 1.2);
    const k = g.userData.grow, e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    g.scale.set(1, Math.max(0.01, e), 1); if (k >= 1) { g.scale.set(1, 1, 1); g.userData.grow = null; }
  }
  for (const m of movers) {
    if (m.type === 'cloud') { m.obj.position.x += m.speed * dt; if (m.obj.position.x > 80) m.obj.position.x = -80; }
    else if (m.type === 'car') {
      m.t = (m.t + m.speed * dt * 4) % 1;
      const dirRight = m.lane === 0;
      const x = dirRight ? -52 + m.t * 108 : 56 - m.t * 108;
      m.obj.position.set(x, 0.15, dirRight ? 22 : 25);
      m.obj.rotation.y = dirRight ? 0 : Math.PI;
    } else if (m.type === 'flag') {
      const pos = m.obj.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const bx = m.base[i * 3];
        pos.array[i * 3 + 2] = Math.sin(bx * 2.2 + t * 4) * 0.12 * (bx + 1.5) / 3;
      }
      pos.needsUpdate = true;
    }
  }
  tickClock(dt);
  tickPets(dt, t);
  tickHazard(dt, t);
  if (pulse) {
    pulse.t += dt;
    const k = (pulse.t % 1.4) / 1.4;
    pulse.mesh.scale.setScalar(1 + k * 7); pulse.mesh.material.opacity = 0.9 * (1 - k);
    if (pulse.t > 8.4) { scene.remove(pulse.mesh); pulse = null; }
  }
  renderer.render(scene, camera);
  updateLabels();
  renderPortrait(t);
}

function animateChar(id, c, dt, t) {
  const g = c.group, parts = g.userData.parts;
  const quest = questChars.has(id);
  if (c.npc && id.startsWith('student')) {
    const i = +id.slice(7), tg = studentTarget(c, i, t);
    if (tg) {
      const to = tg.clone().sub(g.position); to.y = 0; const d = to.length();
      if (d > 0.12) {
        const sp = (studentMode === 'sports' ? 3.2 : 2.2) * dt;
        g.position.add(to.normalize().multiplyScalar(Math.min(sp, d)));
        g.rotation.y = Math.atan2(to.x, to.z);
        const sw = Math.sin(t * (studentMode === 'sports' ? 14 : 9) + c.phase) * 0.6;
        if (parts) { parts.legs[0].rotation.x = sw; parts.legs[1].rotation.x = -sw; parts.arms[0].rotation.x = -sw * 0.6; parts.arms[1].rotation.x = sw * 0.6; }
      } else if (studentMode === 'assembly') {
        g.rotation.y = Math.PI; // หันหน้าเข้าหาเสาธง
        if (parts) { parts.legs[0].rotation.x = 0; parts.legs[1].rotation.x = 0; parts.arms[0].rotation.x = 0; parts.arms[1].rotation.x = 0; }
        if (studentMode === 'home') g.visible = false;
      } else if (studentMode === 'home') g.visible = false;
      return;
    }
  }
  if (!c.target) {
    c.wait -= dt;
    if (c.wait <= 0 && c.wander > 0 && !quest) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * c.wander;
      c.target = c.home.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    if (quest) { // หันหน้าเข้ากล้องและโบกมือ
      const toCam = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
      g.rotation.y += (toCam - g.rotation.y) * Math.min(1, dt * 3);
      if (parts) { parts.arms[1].rotation.z = -2.4 + Math.sin(t * 6 + c.phase) * 0.4; }
    } else if (parts) parts.arms[1].rotation.z += (-0.18 - parts.arms[1].rotation.z) * Math.min(1, dt * 5);
    // หายใจ
    g.position.y = 0.2 + Math.abs(Math.sin(t * 2 + c.phase)) * 0.03;
    if (parts) { parts.legs[0].rotation.x *= 0.85; parts.legs[1].rotation.x *= 0.85; }
  } else {
    const to = c.target.clone().sub(g.position); to.y = 0;
    const d = to.length();
    if (d < 0.15) { c.target = null; c.wait = 2 + Math.random() * 5; }
    else {
      const sp = (c.npc ? 1.6 : 1.2) * dt;
      g.position.add(to.normalize().multiplyScalar(Math.min(sp, d)));
      const yaw = Math.atan2(to.x, to.z);
      let diff = yaw - g.rotation.y; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      g.rotation.y += diff * Math.min(1, dt * 8);
      const sw = Math.sin(t * 9 + c.phase) * 0.5;
      if (parts) { parts.legs[0].rotation.x = sw; parts.legs[1].rotation.x = -sw; parts.arms[0].rotation.x = -sw * 0.6; parts.arms[1].rotation.x = sw * 0.6; }
      g.position.y = 0.2 + Math.abs(Math.sin(t * 9 + c.phase)) * 0.08;
    }
  }
}
