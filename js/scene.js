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
const FAC_POS = { reno: [-19, -6], water: [-12.5, 15], cctv: [-4, 0], library: [14, -18], ict: [-19, -18.5], solar: [10, 10], dome: [13, -32.5], newbldg: [-9, -32.5] };
export function flyToFacility(id) { const p = FAC_POS[id]; if (p) flyTo(new THREE.Vector3(p[0], 0, p[1]), id === 'cctv' ? 70 : 40, 0.42); }
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
  { const base = mesh(rbox(2.6, 0.3, 1.6, 0.1), clay('#E9DCC2')); base.position.set(-12.5, 0.15, 15); g.add(base);
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
}
export function setFacilities(list) {
  const set = new Set(list || []);
  for (const [id, g] of Object.entries(facilities)) {
    if (id === 'expansion') continue;
    const on = set.has(id);
    if (on && !g.visible) { g.visible = true; g.scale.set(1, 0.01, 1); g.userData.grow = 0; }
    if (!on) g.visible = false;
  }
  facilities.expansion.visible = set.has('dome') || set.has('newbldg');
}
export function setStudentCount(n) {
  const show = Math.max(6, Math.min(MAX_STUDENTS, Math.round(n / 40)));
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

// ---------- ถ่ายภาพเมือง ----------
export function snapshot(overview = false) {
  const keepPos = camera.position.clone(), keepTarget = controls.target.clone();
  if (overview) {
    // ภาพมุมกว้างของทั้งโรงเรียนสำหรับแชร์ แล้วคืนมุมกล้องเดิม
    controls.target.set(-2, 0, 2);
    camera.position.set(40, 46, 56);
    camera.lookAt(controls.target);
  }
  updateLabels();
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
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -55, 58);
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
  renderer.render(scene, camera);
  updateLabels();
  renderPortrait(t);
}

function animateChar(id, c, dt, t) {
  const g = c.group, parts = g.userData.parts;
  const quest = questChars.has(id);
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
