// หน้าจอ ภารกิจ การสั่งงานตัวละคร สมุดผู้นำ และการบันทึก
import { LEVELS } from './data/levels.js';
import {
  AREAS, TIERS, TAGS, COMMANDS, READINESS_TH, CHARACTERS, COMMAND_TASKS, COMMAND_REACTIONS,
  PASS_RATIO, RANKS, BIOS, BIO_GROUPS, COMMON_ADVICE, VALIDITY_NOTE, TEACHER_VIEW, SCHOOL_NAME, AREA_OFFICE, REF, COMMAND_EXP,
} from './data/world.js';
import * as St from './state.js';
import * as Sc from './scene.js';
import * as Au from './audio.js';
import * as Aw from './awards.js';
import * as Ec from './economy.js';
import * as Rq from './requirements.js';
import { QUIZ } from './data/quiz.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = h => String(h).replace(/<[^>]+>/g, '');
const THAI_LETTERS = ['ก', 'ข', 'ค', 'ง', 'จ'];
const DIFF_DOTS = d => '●'.repeat(d) + '○'.repeat(4 - d);

let activeLevel = null; // id ของด่านที่กำลังเล่น
let modalStack = [];

// งานประจำของตัวละครเมื่อไม่มีภารกิจ (ใช้ฝึกอ่านความพร้อม ไม่ให้ EXP)
const ROUTINE = {
  prasert: 'ตรวจความปลอดภัยอาคารและสนามเด็กเล่นประจำเดือน', malee: 'จัดตารางนิเทศชั้นเรียนภาคเรียนนี้',
  tonkla: 'ทำทะเบียนคุมครุภัณฑ์ให้เป็นปัจจุบัน', arun: 'นำวง PLC กลุ่มสาระวิทยาศาสตร์', wilai: 'ปรับแผนสอนซ่อมเสริมคณิตศาสตร์ ม.2',
  somsak: 'ทบทวนข้อตกลงเรื่องการมาสายกับสภานักเรียน', boonmee: 'ซ่อมก๊อกน้ำที่รั่วหลังโรงอาหาร', pe: 'จัดตารางการใช้สนามกีฬา',
  newtemp: 'เตรียมการสอนฟิสิกส์ ม.5', cook: 'ทำบันทึกอุณหภูมิตู้เย็นประจำวัน', guidance: 'ติดตามนักเรียนกลุ่มเสี่ยงรายเดือน',
  soonthorn: 'นัดประชุมคณะกรรมการสถานศึกษาประจำภาคเรียน', janpen: 'หารือกิจกรรมเครือข่ายผู้ปกครอง', fah: 'รับฟังข้อเสนอของสภานักเรียน',
  pakorn: 'หารือแผนนิเทศของเขตพื้นที่', areaDir: 'รายงานความก้าวหน้าของโรงเรียน', health: 'ประสานการตรวจสุขภาพนักเรียน', consultant: 'ฟังข้อเสนอ (อย่างระมัดระวัง)',
};

export function init() {
  bindHUD();
  Sc.setFacilityNames(Object.fromEntries(Ec.ITEMS.flatMap(i => [[i.id, shortName(i.th)], [i.facility || i.id, shortName(i.th)]])));
  setInterval(quizTick, 4000);
  refreshSoundIcon();
  refreshHUD();
  if (St.hasSave()) { St.load(); refreshHUD(); syncWorld(); }
  const vm = location.search.match(/[?&]visit=([A-Za-z0-9_-]+)/);
  if (vm) { try { enterVisit(Ec.decodeVisit(vm[1])); return; } catch { toast('รหัสโรงเรียนในลิงก์ไม่ถูกต้อง', 'bad'); } }
  showTitle();
}

// ---------------- HUD ----------------
function bindHUD() {
  // เบราว์เซอร์ให้เริ่มเสียงได้หลังผู้ใช้แตะครั้งแรกเท่านั้น
  const firstTouch = () => { Au.unlock(); window.removeEventListener('pointerdown', firstTouch); window.removeEventListener('keydown', firstTouch); };
  window.addEventListener('pointerdown', firstTouch); window.addEventListener('keydown', firstTouch);
  document.body.addEventListener('click', e => {
    const b = e.target.closest('[data-act], .btn, .cmd, .tr-item');
    if (b && !b.classList.contains('opt')) (b.dataset.act === 'close' || b.dataset.act === 'closeSheet') ? Au.sfx.close() : Au.sfx.click();
    if (!b || !b.dataset.act) return;
    const act = b.dataset.act, arg = b.dataset.arg;
    ACTIONS[act]?.(arg, b, e);
  });
}
const ACTIONS = {
  board: () => questBoard(),
  rules: () => showRules(),
  book: () => leaderBook(),
  save: () => saveModal(),
  home: () => Sc.resetView(),
  zin: () => Sc.zoomBy(0.7),
  zout: () => Sc.zoomBy(1.4),
  close: () => closeModal(),
  closeSheet: () => closeSheet(),
  start: arg => openLevel(+arg),
  skip: arg => { if (!St.LEVEL_BY_ID[+arg].warning && !Rq.check(+arg).ok) { openModal(`<h2>ยังข้ามด่าน ${arg} ไม่ได้</h2><p>ข้ามด่านได้เมื่อโรงเรียนมีความพร้อมตามเกณฑ์ของด่านนั้นแล้วเท่านั้น</p>${reqBox(+arg)}<div class="btn-row"><button class="btn" data-act="board">กลับหน้าภารกิจ</button></div>`, { wide: true }); return; } const t = St.tierOf(+arg).id; const before = t < 4 && St.tierOpen(t + 1); St.skipLevel(+arg); closeModal(); afterLevelChange(+arg, 0, before); toast(`ข้ามด่าน ${arg} แล้ว ด่านนี้ยังนับเป็นการผ่านเพื่อปลดล็อก และไม่กระทบสิทธิรับโปรไฟล์`); },
  fly: arg => { Sc.flyToChar(arg); openChar(arg); },
  title: () => showTitle(),
  sound: () => soundModal(),
  hall: () => hallModal(),
  share: () => shareModal(),
  snap: () => { $('#camctl [data-act=snap]')?.classList.remove('pulse'); shareModal({ view: 'current' }); },
  menu: () => menuModal(),
  quiz: () => quizModal(),
  reqs: arg => openModal(`<h2>ด่าน ${arg} · ${esc(St.LEVEL_BY_ID[+arg].title)}</h2>${reqBox(+arg, { title: 'สิ่งที่โรงเรียนยังต้องมีก่อนนับว่าผ่าน' })}<div class="btn-row"><button class="btn" data-act="board">กลับหน้าภารกิจ</button></div>`, { wide: true }),
  seeNew: arg => { closeModal(); Sc.showNew(arg); },
  cast: arg => castModal(arg === 'first'),
  finance: arg => financeModal(arg || 'overview'),
  buy: arg => buyModal(arg),
  quest: arg => questModal(arg),
  visit: () => visitModal(),
  leaveVisit: () => leaveVisit(),
  intro: () => { closeModal(); playIntro(); },
  beginSteps: arg => { const a = St.lv(+arg).attempt; if (!a) return; a.phase = 'steps'; St.save(); closeSheet(); activeLevel = +arg; renderPhase(); renderTracker(); },
};

export function refreshHUD() {
  const exp = St.totalExp(), r = St.rankFor(exp);
  $('#hud-name').textContent = St.S.playerName ? `ผอ.${St.S.playerName}` : 'ท่าน ผอ.';
  $('#hud-rank').textContent = r.th;
  $('#hud-rank-sub').textContent = r.sub;
  const lo = r.min, hi = r.next ? r.next.min : Math.max(exp, r.min + 1);
  $('#hud-exp-bar').style.width = (r.next ? Math.min(100, 100 * (exp - lo) / (hi - lo)) : 100) + '%';
  $('#hud-exp').textContent = r.next ? `${exp} / ${r.next.min} EXP` : `${exp} EXP · ระดับสูงสุด`;
  if (visiting) return;
  const m = Ec.meters();
  for (const k of ['keng', 'dee', 'suk']) {
    const v = m[k];
    $(`#m-${k} .bar i`).style.width = (v ?? 0) + '%';
    $(`#m-${k} b`).textContent = v == null ? '–' : v;
  }
  $('#hud-progress').textContent = `${St.completedCount()}/20 ด่าน`;
  Sc.setPlayerScale(r.scale);
  Sc.setTrophies(Aw.earnedCount());
  for (const id of Object.keys(CHARACTERS)) if (CHARACTERS[id].readiness && id !== 'player') Sc.setMood(id, St.S.chars[id].morale);
  const e = Ec.econ();
  $('#hud-students').textContent = Ec.fmt(e.students);
  $('#hud-size').textContent = Ec.sizeLabel();
  $('#hud-money').textContent = Ec.fmt(Ec.usable());
  $('#hud-fin').classList.toggle('crisis', e.crisis);
  $('#hud-crisis').hidden = !e.crisis;
  Sc.setFacilities(Object.keys(e.owned));
  Sc.setLand(e.land);
  const evs = Ec.activeEvents().map(v => v.id), evKey = evs.join(',');
  if (evKey !== lastEvKey) { lastEvKey = evKey; Sc.setEvents(evs); }
  Sc.setStudentCount(e.students);
  Sc.setCrisis(e.crisis);
  // ด่านที่รอเกณฑ์โรงเรียน: เมื่อโรงเรียนพร้อมแล้วให้นับว่าผ่าน
  const openBefore = [2, 3, 4].map(t => St.tierOpen(t));
  const done = Rq.promote();
  if (done.length) {
    Au.sfx.unlock?.();
    for (const id of done) toast(`ด่าน ${id} ผ่านเกณฑ์ความพร้อมของโรงเรียนแล้ว นับว่าผ่านด่าน`, 'rank');
    [2, 3, 4].forEach((t, i) => { if (!openBefore[i] && St.tierOpen(t)) toast(`ปลดล็อก <b>${TIERS[t - 1].th}</b>`, 'rank'); });
    grantAwards();
  }
}
let lastEvKey = null;
function shortName(th) { return th.replace(/\s*\((?:1 ปี|แบบมาตรฐาน)\)/, '').replace(/ครบชุด$/, ''); }
// กล่องเกณฑ์ความพร้อมของโรงเรียนประจำด่าน
function reqBox(id, { title = 'เกณฑ์ความพร้อมของโรงเรียนในด่านนี้', links = true } = {}) {
  const c = Rq.check(id);
  if (!c.rows.length) return '';
  const goBtn = r => {
    if (!links || r.ok) return '';
    const g = r.go || {};
    if (g.item) return `<button class="btn sm go" data-act="buy" data-arg="${g.item}">จัดหา</button>`;
    if (g.quest === 'land') return `<button class="btn sm go" data-act="quest" data-arg="land">ขยายพื้นที่</button>`;
    if (g.quest) return `<button class="btn sm go" data-act="finance" data-arg="quests">หารายได้</button>`;
    if (g.crisis) return `<button class="btn sm go" data-act="finance" data-arg="overview">ดูงบ</button>`;
    if (g.students || g.meter) return `<button class="btn sm go" data-act="finance" data-arg="shop">ร้านค้า</button>`;
    return '';
  };
  return `<div class="req-box ${c.ok ? 'ok' : ''}"><h4>${title}</h4><p class="small">${esc(Rq.WHY[id] || '')}</p>
    <ul class="reqs">${c.rows.map(r => `<li class="${r.ok ? 'ok' : 'no'}"><span class="mk">${r.ok ? '✓' : '!'}</span><span>${esc(r.th)} <span class="now">(${esc(r.now)})</span></span>${goBtn(r)}</li>`).join('')}</ul>
    ${c.rows.some(r => r.go?.meter && !r.ok) ? '<p class="tiny">ตัวชี้วัดเก่ง ดี มีสุข มาจากการตัดสินใจในด่านที่เล่นแล้ว (เล่นด่านเดิมซ้ำได้) และจากสิ่งที่โรงเรียนจัดหาอย่างถูกระเบียบ</p>' : ''}</div>`;
}

function syncWorld() {
  // ตั้งเครื่องหมายภารกิจตามด่านที่กำลังเล่น
  const id = currentAttemptLevel();
  activeLevel = id;
  if (id && St.lv(id).attempt?.phase === 'meet') {
    const pending = (COMMAND_TASKS[id] || []).filter(t => !St.lv(id).attempt.commands[t.c]).map(t => t.c);
    Sc.setQuestMarkers(pending);
  } else Sc.setQuestMarkers([]);
  renderTracker();
}
function currentAttemptLevel() {
  for (const [id, l] of Object.entries(St.S.levels)) if (l.attempt) return +id;
  return null;
}

// ---------------- Modal ----------------
function openModal(html, { wide = false, cls = '', closable = true } = {}) {
  const m = $('#modal');
  m.className = 'modal show ' + (wide ? 'wide ' : '') + cls;
  // ย้ายภาพตัวละครกลับมาไว้นอกหน้าต่างก่อนเปลี่ยนเนื้อหา ไม่ให้ถูกลบไปพร้อมเนื้อหาเดิม
  const rd = $('#reader'); if (rd && rd.parentElement !== document.body) { rd.hidden = true; document.body.appendChild(rd); }
  $('#modal-body').innerHTML = html;
  $('#modal-close').hidden = !closable;
  m.setAttribute('aria-hidden', 'false');
  $('#modal-body').scrollTop = 0;
  const f = $('#modal-body [autofocus]'); if (f) setTimeout(() => f.focus(), 50);
  Au.setDuck(true);
}
function closeModal() {
  const m = $('#modal'); m.className = 'modal'; m.setAttribute('aria-hidden', 'true');
  Au.setDuck(false);
  hideReader();
}
function toast(msg, kind = '') {
  if (kind === 'rank') (msg.includes('ปลดล็อก') ? Au.sfx.unlock : Au.sfx.rankUp)();
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.innerHTML = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4800);
}

// ---------------- Title ----------------
function showTitle() {
  const has = St.hasSave();
  openModal(`
    <div class="title-screen">
      <div class="title-badge">เกมจำลองสถานการณ์เพื่อเตรียมความพร้อมผู้บริหารสถานศึกษา</div>
      <h1>เส้นทางผู้บริหาร<br><span>เมืองบ้านสวน</span></h1>
      <p class="lead">ท่านได้รับแต่งตั้งเป็นผู้อำนวยการ${esc(SCHOOL_NAME)} โรงเรียนมัธยมศึกษาขนาดกลาง สังกัด ${esc(AREA_OFFICE)} ในปีการศึกษา 2570 ภารกิจของท่านคือพัฒนาครูและนักเรียนให้ "เก่ง ดี มีสุข" ผ่านการบริหารงาน 4 ด้านตามกฎกระทรวงกระจายอำนาจฯ พ.ศ. 2550 ใน 20 ด่าน ตั้งแต่งานประจำไปจนถึงภาวะวิกฤต</p>
      ${has ? `<p class="small">ข้อมูลที่บันทึกไว้: ${esc(St.S.playerName ? 'ผอ.' + St.S.playerName : 'ไม่ระบุชื่อ')} · ผ่าน ${St.completedCount()}/20 ด่าน · ${St.totalExp()} EXP</p>` : ''}
      <div class="btn-row center">
        ${has ? `<button class="btn primary" id="t-continue" autofocus>เล่นต่อ</button>` : ''}
        <button class="btn ${has ? '' : 'primary'}" id="t-new" ${has ? '' : 'autofocus'}>เริ่มเกมใหม่</button>
        <button class="btn ghost" id="t-intro">ประวัติโรงเรียน</button>
        <button class="btn ghost" data-act="save">นำเข้ารหัสบันทึก</button>
      </div>
      <p class="fineprint">ชื่อบุคคล โรงเรียน และเขตพื้นที่ในเกมเป็นชื่อสมมติทั้งหมด ส่วนสถานการณ์อิงกรณีจริงที่มีแหล่งอ้างอิง ข้อมูลระเบียบเป็นสถานะ ณ เดือนตุลาคม 2569 ผลโปรไฟล์ใช้เพื่อการสะท้อนคิด ไม่ใช่เครื่องมือวินิจฉัย</p>
    </div>`, { cls: 'title', closable: false });
  $('#t-continue')?.addEventListener('click', () => { closeModal(); syncWorld(); refreshHUD(); if (!St.S.seenRules) showRules(); else resumeHint(); });
  $('#t-new').addEventListener('click', () => newGameForm(has));
  $('#t-intro').addEventListener('click', () => { closeModal(); playIntro(() => showTitle()); });
}
function newGameForm(hadSave) {
  openModal(`
    <h2>เริ่มเกมใหม่</h2>
    ${hadSave ? `<p class="warn">การเริ่มเกมใหม่จะเขียนทับข้อมูลเดิมในเบราว์เซอร์นี้ หากต้องการเก็บข้อมูลเดิมไว้ โปรดไปที่เมนู "บันทึก" และคัดลอกรหัสสำรองก่อน</p>` : ''}
    <label class="field">ชื่อที่ใช้ในเกม (ไม่จำเป็นต้องเป็นชื่อจริง)
      <input id="ng-name" maxlength="24" placeholder="เช่น ใจดี" autofocus>
    </label>
    <div class="btn-row"><button class="btn primary" id="ng-go">เข้าสู่เมืองบ้านสวน</button><button class="btn ghost" data-act="title">ย้อนกลับ</button></div>`, { closable: false });
  const go = () => { St.newGame($('#ng-name').value.trim()); refreshHUD(); syncWorld(); closeModal(); playIntro(() => castModal(true)); };
  $('#ng-go').addEventListener('click', go);
  $('#ng-name').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
function resumeHint() {
  const id = currentAttemptLevel();
  if (id) toast(`ท่านยังทำด่าน ${id} ไม่เสร็จ เปิดเมนู "ภารกิจ" เพื่อดำเนินการต่อ`);
}

// ---------------- Intro: ประวัติโรงเรียน (แต่งขึ้น) ----------------
const INTRO_SHOTS = [
  { year: 'พ.ศ. 2512', text: 'ชาวบ้านสวนร่วมกันบริจาคที่ดินริมคลองและแรงงาน สร้างอาคารเรียนไม้หลังแรก เปิดสอนนักเรียนรุ่นแรก 42 คน', at: [-19, 0, -11], dist: 34, az: -0.5 },
  { year: 'พ.ศ. 2538', text: 'โรงเรียนขยายการรับนักเรียนจนเปิดสอนครบตั้งแต่ ม.1 ถึง ม.6 และกลายเป็นโรงเรียนประจำชุมชนที่ผู้ปกครองหลายรุ่นผูกพัน', at: [-4, 0, 7], dist: 40, az: 0.3 },
  { year: 'พ.ศ. 2565', text: 'ผลสัมฤทธิ์ของนักเรียนเริ่มลดลง ครูหลายคนขอย้าย ภาระงานเอกสารเพิ่มขึ้น และชุมชนตั้งคำถามถึงทิศทางของโรงเรียน', at: [14, 0, -9], dist: 30, az: 0.9 },
  { year: 'พ.ศ. 2570', text: 'ท่านได้รับแต่งตั้งเป็นผู้อำนวยการคนที่ 9 ครู นักเรียน และชุมชนกำลังรอดูว่าท่านจะนำโรงเรียนไปในทิศทางใด', at: [3.4, 0, -6], dist: 20, az: 0.55, player: true },
];
function playIntro(done) {
  const el = $('#intro');
  el.hidden = false; document.body.classList.add('cine');
  el.innerHTML = `<div class="ib top"></div><div class="ib bottom"><div class="cap"><b></b><p></p></div><button class="btn sm ghost skip">ข้ามฉากเปิด</button></div>`;
  Au.unlock();
  let i = 0, timer = null, finished = false;
  const finish = () => { if (finished) return; finished = true; clearTimeout(timer); document.body.classList.remove('cine'); el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 500); Sc.resetView(); done && done(); };
  const next = () => {
    if (i >= INTRO_SHOTS.length) return finish();
    const s = INTRO_SHOTS[i++];
    Sc.cinematic(s.at, s.dist, s.az, 2.6);
    const cap = el.querySelector('.cap'); cap.classList.remove('show');
    setTimeout(() => { cap.querySelector('b').textContent = s.year; cap.querySelector('p').textContent = s.text; cap.classList.add('show'); Au.sfx.page(); }, 250);
    timer = setTimeout(next, i === INTRO_SHOTS.length ? 3200 : 2700);
  };
  el.querySelector('.skip').addEventListener('click', finish);
  next();
}

// ---------------- Rules (andragogy) ----------------
function showRules(first = false) {
  openModal(`
    <h2>กติกาและผลที่ผู้เล่นจะได้รับ</h2>
    <p class="lead">เกมนี้ออกแบบสำหรับครูและรองผู้อำนวยการที่เตรียมเข้าสู่ตำแหน่งผู้บริหารสถานศึกษา ซึ่งเป็นผู้เรียนวัยผู้ใหญ่ที่มีประสบการณ์ในโรงเรียนอยู่แล้ว กติกาจึงอิงหลักการเรียนรู้ของผู้ใหญ่ (andragogy) ของ Knowles และวงจรการเรียนรู้จากประสบการณ์ของ Kolb</p>
    <div class="grid2">
      <section class="card">
        <h3>ขั้นตอนการเล่น</h3>
        <ol class="steps">
          <li>เปิดเมนู <b>ภารกิจ</b> แล้วเลือกด่านในช่วงที่เปิดแล้ว ด่านในช่วงเดียวกันเล่นตามลำดับใดก็ได้</li>
          <li>ศึกษาเหตุผลความสำคัญของด่านและกรณีจริงที่ด่านอ้างอิง จากนั้นบันทึกสั้น ๆ ว่าหากเป็นโรงเรียนของท่านจะดำเนินการอย่างไร</li>
          <li>ไปพบตัวละครที่มีเครื่องหมาย <span class="mini-marker">!</span> ในเมือง แล้วเลือกวิธีทำงานกับบุคคลนั้น ได้แก่ สั่งการ สอนงาน สนับสนุน มอบหมาย หรือปรึกษาหารือ</li>
          <li>ตัดสินใจทีละขั้น ขั้นละ 5 ตัวเลือก ระบบแสดงผลที่ตามมา เหตุผล และแหล่งอ้างอิงทันที</li>
          <li>สรุปบทเรียนท้ายด่าน ด่านจะผ่านเมื่อได้ EXP ไม่น้อยกว่าร้อยละ ${Math.round(PASS_RATIO * 100)} <b>และ</b> โรงเรียนมีความพร้อมตามเกณฑ์ของด่าน เช่น มีสิ่งก่อสร้างหรือของที่จำเป็น ตัวชี้วัดเก่ง ดี มีสุขถึงระดับที่กำหนด ไม่อยู่ในภาวะวิกฤต มีนักเรียนหรือพื้นที่เพียงพอ ถ้ายังไม่พร้อม ด่านจะรอเกณฑ์โรงเรียน และช่วงถัดไปจะยังไม่เปิดจนกว่าจะผ่านครบ 5 ด่าน</li>
        </ol>
        <h3>การให้คะแนน</h3>
        <ul class="tight">
          <li><b>ด้านระเบียบ:</b> บางขั้นมีตัวเลือกที่ขัดระเบียบ 1 ข้อ หากเลือกจะได้ 0 EXP ระบบแสดงผลที่ตามมาจากกรณีจริง และให้เลือกใหม่ได้ 1 ครั้งโดยได้ EXP ครึ่งหนึ่ง คะแนนความรู้ระเบียบนับจากการเลือกครั้งแรก</li>
          <li><b>ขั้นสะท้อนแนวการนำ:</b> ทุกตัวเลือกไม่ขัดระเบียบ จึงไม่มีคำตอบที่ถูกเพียงข้อเดียว</li>
          <li><b>ยังไม่ยืนยันตัวบท:</b> ตัวเลือกที่ยังไม่ได้ตรวจสอบกับตัวบทต้นฉบับจะไม่นำมาตัดสินถูกหรือผิด</li>
          <li><b>ด้านแนวการนำ:</b> ทุกตัวเลือกจัดอยู่ใน 7 แนวการนำ หรือเป็นพฤติกรรมนิ่งเฉยหรือหลีกเลี่ยง ค่า EXP แสดงความเหมาะสมกับสถานการณ์ ไม่ได้จัดอันดับว่าแนวใดดีกว่า</li>
          <li><b>การทำงานกับบุคลากร:</b> หากวิธีที่เลือกสอดคล้องกับระดับความพร้อม (R1–R4 ตาม Hersey และ Blanchard) จะได้ ${COMMAND_EXP.fit} EXP หากใกล้เคียงจะได้ ${COMMAND_EXP.near} EXP และบุคลากรจะพัฒนาขึ้นในด่านต่อไป</li>
        </ul>
      </section>
      <section class="card">
        <h3>หลักการเรียนรู้ของผู้ใหญ่ในเกม</h3>
        <table class="mini">
          <tr><th>หลักของ Knowles</th><th>การนำมาใช้ในเกม</th></tr>
          <tr><td>ผู้เรียนต้องรู้ว่าเรียนเพื่ออะไร</td><td>ทุกด่านระบุงานที่ฝึกและระเบียบที่อ้างอิง</td></tr>
          <tr><td>ผู้เรียนกำหนดการเรียนของตนเอง</td><td>เลือกลำดับด่านในช่วงเดียวกัน เล่นซ้ำ และข้ามด่านที่มีเนื้อหาสะเทือนใจได้</td></tr>
          <tr><td>ประสบการณ์เดิมเป็นทรัพยากร</td><td>บันทึกแนวทางของโรงเรียนตนเองก่อนตัดสินใจ</td></tr>
          <tr><td>ความพร้อมผูกกับบทบาท</td><td>ความยากเรียงตามภาระงานจริงของผู้อำนวยการ</td></tr>
          <tr><td>การเรียนรู้โดยยึดปัญหา</td><td>ผลของด่านต้นส่งต่อไปยังด่านหลังผ่านความพร้อมของบุคลากร</td></tr>
          <tr><td>แรงจูงใจภายใน</td><td>ไม่มีการจัดอันดับผู้เล่น มีเพียงข้อมูลย้อนกลับ</td></tr>
        </table>
        <h3>ผลที่ผู้เล่นจะได้รับ</h3>
        <ul class="tight">
          <li>ฝึกตัดสินใจในสถานการณ์ที่ผู้อำนวยการปีแรกมีโอกาสพบจริง โดยไม่เกิดผลเสียจริง</li>
          <li>เฉลยพร้อมแหล่งอ้างอิงที่ตรวจสอบได้</li>
          <li>ระดับผู้บริหารที่เพิ่มขึ้นตาม EXP ตัวชี้วัด "เก่ง ดี มีสุข" และรางวัลในหอเกียรติยศ</li>
          <li><b>สมุดผู้นำ:</b> แนวโน้มการตัดสินใจ 4 มิติ แนวทางพัฒนาตนจาก Bass, Hallinger และ Robinson กับคณะ และแผนพัฒนาแบบ PIE สำหรับโรงเรียนของท่าน</li>
        </ul>
        <h3>การควบคุมมุมมอง</h3>
        <p class="small">ลากเพื่อหมุน · ใช้ล้อเมาส์หรือสองนิ้วเพื่อซูม · คลิกขวาหรือลากสองนิ้วเพื่อเลื่อน · แตะตัวละครหรืออาคารเพื่อดูรายละเอียด</p>
      </section>
    </div>
    <details class="card soft"><summary>วิธีคำนวณตัวชี้วัด "เก่ง ดี มีสุข"</summary>
      <p class="small">เป็นตัวชี้วัดภายในเกม ไม่ใช่การวัดผลจริง <b>เก่ง</b> คำนวณจากร้อยละ EXP ในด่านวิชาการ ร่วมกับสัดส่วนการเลือกแนวมุ่งการเรียนการสอนและแนวพัฒนาครู (แสดงผลเมื่อผ่านด่านวิชาการอย่างน้อย 1 ด่าน) <b>ดี</b> คำนวณจากคะแนนความรู้ระเบียบ ร่วมกับร้อยละ EXP ในด่านงบประมาณ งานบุคคล และการบริหารทั่วไป <b>มีสุข</b> คำนวณจากความสอดคล้องระหว่างวิธีทำงานกับความพร้อมของบุคลากร ขวัญกำลังใจของครู การใส่ใจรายบุคคล และการไม่นิ่งเฉยต่อปัญหา</p>
    </details>
    <p class="fineprint">${esc(VALIDITY_NOTE)}</p>
    <div class="btn-row"><button class="btn primary" id="r-ok">${first ? 'รับทราบ และไปที่ภารกิจแรก' : 'ปิด'}</button></div>`, { wide: true });
  $('#r-ok').addEventListener('click', () => { St.S.seenRules = true; St.save(); closeModal(); if (first) questBoard(); });
}

// ---------------- Quest board ----------------
function statusChip(id) {
  const l = St.S.levels[id];
  const st = l?.attempt ? 'inprogress' : (l?.status || (St.levelOpen(id) ? 'open' : 'locked'));
  const map = { open: 'พร้อมเล่น', inprogress: 'กำลังเล่น', passed: 'ผ่านแล้ว', failed: 'ยังไม่ผ่าน', skipped: 'ข้ามแล้ว', locked: 'ล็อก', pending: 'รอเกณฑ์โรงเรียน', passedExp: 'รอเกณฑ์โรงเรียน' };
  return `<span class="chip st-${st}">${map[st]}</span>`;
}
function questBoard() {
  const tiers = TIERS.map(t => {
    const open = St.tierOpen(t.id);
    const rows = t.levels.map(id => {
      const L = St.LEVEL_BY_ID[id], A = AREAS[L.area], l = St.S.levels[id];
      const locked = !open;
      const best = l?.bestExp ? `${l.bestExp}/${St.maxExp(id)} EXP` : `สูงสุด ${St.maxExp(id)} EXP`;
      const btn = locked ? '' : (l?.attempt ? `<button class="btn sm primary" data-act="start" data-arg="${id}">เล่นต่อ</button>` :
        `<button class="btn sm ${l?.status === 'passed' ? '' : 'primary'}" data-act="start" data-arg="${id}">${l?.status ? 'เล่นใหม่' : 'เริ่ม'}</button>`);
      return `<div class="q-row ${locked ? 'locked' : ''}" style="--area:${A.color}">
        <div class="q-num">${id}</div>
        <div class="q-main"><div class="q-title">${esc(L.title)} ${L.warning ? '<span class="chip warn-chip">มีคำเตือนเนื้อหา</span>' : ''}</div>
          <div class="q-meta"><span class="area-dot"></span>${A.th} · <span class="dots" title="ความยาก">${DIFF_DOTS(L.difficulty)}</span> ${L.difficultyTh} · ${L.steps.length} ขั้น · ${best}</div>
          <div class="q-reqs">เกณฑ์โรงเรียน: ${Rq.check(id).rows.map(r => r.ok ? esc(r.th) + ' ✓' : `<b>${esc(r.th)}</b>`).join(' · ')}</div>
          ${l?.status === 'pending' ? `<div class="btn-row left"><button class="btn sm" data-act="reqs" data-arg="${id}">ดูสิ่งที่ยังขาด</button></div>` : ''}</div>
        <div class="q-side">${statusChip(id)}${btn}</div></div>`;
    }).join('');
    return `<section class="tier ${open ? '' : 'locked'}"><h3>${t.th} ${open ? '' : '<span class="chip">ผ่านช่วงก่อนหน้าให้ครบ รวมเกณฑ์โรงเรียน เพื่อปลดล็อก</span>'}</h3>${rows}</section>`;
  }).join('');
  openModal(`<h2>ภารกิจ 20 ด่าน</h2>
    <p class="small">งาน 4 ด้านวนสลับกัน ด้านละ 5 ด่าน ภายในช่วงเดียวกันเลือกเล่นด่านไหนก่อนก็ได้ ด่านจะนับว่าผ่านเมื่อได้ EXP ถึงเกณฑ์ <b>และ</b> โรงเรียนมีความพร้อมตามเกณฑ์ของด่าน (สิ่งก่อสร้างหรือของที่ต้องมี ตัวชี้วัดเก่ง ดี มีสุข สถานะการเงิน จำนวนนักเรียน หรือพื้นที่)</p>
    <div class="legend">${Object.values(AREAS).map(a => `<span style="--area:${a.color}"><i class="area-dot"></i>${a.th}</span>`).join('')}</div>
    ${tiers}`, { wide: true });
}

// ---------------- Level flow ----------------
function openLevel(id) {
  if (!St.levelOpen(id)) return toast('ด่านนี้ยังไม่เปิด โปรดผ่านด่านในช่วงก่อนหน้าให้ครบ');
  const cur = currentAttemptLevel();
  if (cur && cur !== id) {
    openModal(`<h2>ยังมีด่านที่เล่นค้างอยู่</h2><p>ท่านกำลังเล่นด่าน ${cur} อยู่ ถ้าเริ่มด่าน ${id} ความคืบหน้าของด่าน ${cur} จะถูกยกเลิก</p>
      <div class="btn-row"><button class="btn primary" data-act="start" data-arg="${cur}">กลับไปด่าน ${cur}</button><button class="btn" id="lv-abandon">ยกเลิกด่าน ${cur} แล้วเริ่มด่าน ${id}</button></div>`);
    $('#lv-abandon').addEventListener('click', () => { const l = St.lv(cur); l.attempt = null; if (l.status === 'inprogress') l.status = 'open'; St.save(); openLevel(id); });
    return;
  }
  const L = St.LEVEL_BY_ID[id];
  const l = St.lv(id);
  if (l.attempt) { activeLevel = id; return renderPhase(); }
  if (L.warning) {
    const txt = id === 17
      ? 'ด่านนี้เกี่ยวกับเหตุความรุนแรงในโรงเรียน เกมบรรยายอย่างจำกัด ไม่แสดงภาพและไม่ระบุจำนวนผู้สูญเสีย ถ้าเรื่องนี้กระทบใจท่าน เลือกข้ามได้โดยไม่เสียสิทธิรับโปรไฟล์'
      : 'ด่านนี้เกี่ยวกับการล่วงละเมิดทางเพศต่อนักเรียน เกมไม่บรรยายรายละเอียดของการกระทำ ถ้าเรื่องนี้กระทบใจท่าน เลือกข้ามได้โดยไม่เสียสิทธิรับโปรไฟล์';
    openModal(`<h2>คำเตือนเนื้อหา · ด่าน ${id}</h2><p>${txt}</p>
      <div class="btn-row"><button class="btn primary" id="w-go">เข้าด่าน</button><button class="btn" data-act="skip" data-arg="${id}">ข้ามด่านนี้</button></div>`);
    $('#w-go').addEventListener('click', () => { St.startAttempt(id); activeLevel = id; renderPhase(); });
    return;
  }
  St.startAttempt(id); activeLevel = id; renderPhase();
}

function levelHeader(L, att) {
  const A = AREAS[L.area];
  const exp = St.attemptExp(L.id);
  return `<div class="lv-head" style="--area:${A.color}">
    <div><span class="chip area">${A.th}</span> <span class="chip">ด่าน ${L.id} · ${L.difficultyTh}</span></div>
    <h2>${esc(L.title)}</h2>
    <div class="lv-exp">EXP ด่านนี้ <b>${exp}</b> / ${St.maxExp(L.id)} <span class="small">(ผ่านที่ ${Math.ceil(St.maxExp(L.id) * PASS_RATIO)})</span></div></div>`;
}

function renderPhase() {
  const id = activeLevel; const L = St.LEVEL_BY_ID[id]; const l = St.lv(id); const att = l.attempt;
  if (!att) return;
  if (att.phase === 'brief') return renderBrief(L, att);
  if (att.phase === 'meet') return renderMeet(L, att);
  if (att.phase === 'steps') return renderStep(L, att);
}

function renderBrief(L, att) {
  const A = AREAS[L.area];
  const tasks = COMMAND_TASKS[L.id] || [];
  openModal(`${levelHeader(L, att)}
    <div class="kolb"><span class="on">ประสบการณ์ตรง</span><span>สังเกตและสะท้อนคิด</span><span>สร้างความคิดรวบยอด</span><span>ทดลองปฏิบัติ</span></div>
    <section class="card soft"><h3>ทำไมเรื่องนี้สำคัญ</h3><p>${esc(A.why)}</p></section>
    <section class="story">${L.intro.map(p => `<p>${p}</p>`).join('')}</section>
    ${reqBox(L.id, { title: 'นอกจาก EXP ด่านนี้จะผ่านได้เมื่อโรงเรียนมีความพร้อมดังนี้', links: false })}
    <details class="card soft" open><summary>กรณีจริงที่ด่านนี้อิง (ชื่อจริงถูกตัดออก)</summary><p class="small">${L.realCase}</p>
      ${L.ambiguity ? `<p class="small"><b>ความกำกวมของด่าน:</b> ${L.ambiguity}</p>` : ''}</details>
    <label class="field">ถ้าเป็นโรงเรียนของท่าน ท่านจะทำอะไรเป็นอย่างแรก (ไม่บังคับ บันทึกไว้เทียบตอนท้ายด่าน)
      <textarea id="b-ref" rows="2" maxlength="500">${esc(St.lv(L.id).reflectionBefore || '')}</textarea></label>
    <div class="btn-row">
      <button class="btn primary" id="b-go">${tasks.length ? `ออกไปพบ${tasks.map(t => CHARACTERS[t.c].name).join(' และ ')}` : 'เริ่มตัดสินใจ'}</button>
      <button class="btn ghost" data-act="close">ไว้ทีหลัง</button></div>`, { wide: true });
  showReader(L.reader, L.hook, true);
  $('#b-go').addEventListener('click', () => {
    St.lv(L.id).reflectionBefore = $('#b-ref').value.trim();
    att.phase = tasks.length ? 'meet' : 'steps'; St.save();
    if (att.phase === 'meet') {
      closeModal(); syncWorld();
      Sc.flyToChar(tasks[0].c);
      Au.sfx.quest();
      toast(`แตะ${CHARACTERS[tasks[0].c].name}ที่มีเครื่องหมาย <b>!</b> เพื่อเลือกวิธีทำงานกับบุคคลนี้`);
    } else renderPhase();
  });
}

function renderMeet(L, att) {
  closeModal(); syncWorld();
}

function renderTracker() {
  const el = $('#tracker');
  const id = currentAttemptLevel();
  if (!id) { el.hidden = true; return; }
  const L = St.LEVEL_BY_ID[id], att = St.lv(id).attempt;
  const tasks = COMMAND_TASKS[id] || [];
  const done = tasks.every(t => att.commands[t.c]);
  el.hidden = false;
  el.style.setProperty('--area', AREAS[L.area].color);
  el.innerHTML = `<div class="tr-title">ด่าน ${id} · ${esc(L.title)}</div>
    ${att.phase === 'brief' ? `<button class="btn sm primary" data-act="start" data-arg="${id}">อ่านสถานการณ์</button>` : ''}
    ${att.phase !== 'brief' ? tasks.map(t => `<button class="tr-item ${att.commands[t.c] ? 'done' : ''}" data-act="fly" data-arg="${t.c}">${att.commands[t.c] ? '✓' : '!'} ${esc(CHARACTERS[t.c].name)}</button>`).join('') : ''}
    ${att.phase === 'meet' && done ? `<button class="btn sm primary" id="tr-steps">เริ่มตัดสินใจ</button>` : ''}
    ${att.phase === 'steps' ? `<button class="btn sm primary" data-act="start" data-arg="${id}">ตัดสินใจต่อ (ขั้น ${att.step + 1}/${L.steps.length})</button>` : ''}`;
  $('#tr-steps')?.addEventListener('click', () => { att.phase = 'steps'; St.save(); closeSheet(); renderPhase(); renderTracker(); });
}

function renderStep(L, att) {
  const i = att.step; const st = L.steps[i];
  const order = att.order[i];
  const a = att.answers[i];
  const revealed = !!a;
  const canRetry = a && !a.retried && st.options[a.first].legal === 'illegal';
  const retrying = att.retryMode === i;
  const opts = order.map((oi, pos) => {
    const o = st.options[oi];
    const chosen = a && (a.final === oi || a.first === oi);
    const isFinal = a && a.final === oi;
    const disabled = revealed && !(retrying && oi !== a.first);
    return `<button class="opt ${chosen ? 'chosen' : ''} ${isFinal ? 'final' : ''} ${revealed && a.first === oi && o.legal === 'illegal' ? 'bad' : ''}" data-oi="${oi}" ${disabled ? 'disabled' : ''}>
      <span class="opt-l">${THAI_LETTERS[pos]}</span><span class="opt-t">${o.text}</span></button>`;
  }).join('');
  let reveal = '';
  if (revealed && !retrying) {
    const showIdx = a.retried ? [a.first, a.final] : [a.first];
    reveal = showIdx.map((oi, k) => feedbackCard(st.options[oi], k === 1 ? 'ตัวเลือกที่เลือกใหม่' : 'ตัวเลือกของท่าน', k === 0 && a.retried ? 0 : a.exp, k === 0 && a.retried)).join('');
    reveal += `<details class="all-opts"><summary>ดูเหตุผลของทุกตัวเลือก</summary>${order.map((oi, pos) => {
      const o = st.options[oi];
      return `<div class="ao"><b>${THAI_LETTERS[pos]}.</b> ${o.text}<div class="ao-meta">${legalChip(o.legal)} ${tagChips(o.tags)} <span class="chip">${o.legal === 'illegal' ? 0 : o.exp} EXP</span></div><p class="small">${o.explain}</p></div>`;
    }).join('')}</details>`;
  }
  const last = i === L.steps.length - 1;
  openModal(`${levelHeader(L, att)}
    <div class="kolb"><span class="${revealed ? '' : 'on'}">ประสบการณ์ตรง</span><span class="${revealed ? 'on' : ''}">สังเกตและสะท้อนคิด</span><span>สร้างความคิดรวบยอด</span><span>ทดลองปฏิบัติ</span></div>
    <div class="step-prog">${L.steps.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'cur' : ''}"></i>`).join('')}</div>
    <h3 class="step-title">ขั้นที่ ${i + 1} · ${esc(st.title)}</h3>
    ${st.styleOnly ? `<p class="badge-style">ขั้นสะท้อนแนวการนำ: ทุกตัวเลือกในขั้นนี้ไม่ขัดระเบียบ จึงไม่มีคำตอบที่ถูกเพียงข้อเดียว</p>` : ''}
    ${st.hasUnverified ? `<p class="badge-unv">ขั้นนี้มีตัวเลือกที่ยังไม่ได้ยืนยันกับตัวบทต้นฉบับ ตัวเลือกดังกล่าวจึงไม่นำมาตัดสินถูกหรือผิด</p>` : ''}
    ${st.note ? `<p class="small note">${st.note}</p>` : ''}
    ${retrying ? `<p class="warn">ตัวเลือกแรกขัดระเบียบ เลือกใหม่ได้ 1 ครั้ง (ได้ EXP ครึ่งหนึ่งของตัวเลือกใหม่)</p>` : ''}
    <div class="opts">${opts}</div>
    <div id="reveal">${reveal}</div>
    <div class="btn-row">
      ${canRetry && !retrying ? `<button class="btn" id="s-retry">เลือกใหม่ (1 ครั้ง)</button>` : ''}
      ${revealed && !retrying ? `<button class="btn primary" id="s-next">${last ? 'สรุปด่าน' : 'ขั้นถัดไป'}</button>` : ''}
      <button class="btn ghost" data-act="close">พักไว้ก่อน</button></div>`, { wide: true });
  showReader(L.reader, revealed ? 'บันทึกการตัดสินใจของท่านไว้แล้ว โปรดพิจารณาเหตุผลและแหล่งอ้างอิงก่อนดำเนินการขั้นต่อไป' : `ขั้นที่ ${i + 1}: ${st.title} ขอให้ท่านพิจารณาตัวเลือกทั้ง 5 ข้อ`, false);
  $('#modal-body').querySelectorAll('.opt:not([disabled])').forEach(b => b.addEventListener('click', () => {
    const oi = +b.dataset.oi;
    const before = att.answers[i];
    const res = St.answer(L.id, i, oi);
    att.retryMode = null;
    const o = st.options[oi];
    if (!before) logStep(L, st, o);
    if (o.legal === 'illegal') { Au.sfx.bad(); if (!res.retried) toast('ตัวเลือกนี้ขัดระเบียบ โปรดพิจารณาผลที่ตามมาด้านล่าง', 'bad'); }
    else { Au.sfx.good(); setTimeout(() => Au.sfx.exp(), 260); toast(`+${res.exp} EXP`, 'good'); }
    St.save(); renderStep(L, att); refreshHUD();
    setTimeout(() => $('#reveal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }));
  $('#s-retry')?.addEventListener('click', () => { att.retryMode = i; renderStep(L, att); });
  $('#s-next')?.addEventListener('click', () => {
    if (last) return finishLevelUI(L);
    att.step++; St.save(); renderStep(L, att); renderTracker();
  });
}
function legalChip(legal) {
  return { ok: '<span class="chip ok">ไม่ขัดระเบียบ</span>', illegal: '<span class="chip bad">ขัดระเบียบ</span>', undetermined: '<span class="chip unv">ยังไม่ยืนยันตัวบท</span>' }[legal];
}
function tagChips(tags) {
  return tags.map((t, k) => `<span class="chip tag" style="--tag:${TAGS[t].color}" title="${esc(TAGS[t].base)}">${k ? '' : '★ '}${TAGS[t].th}</span>`).join(' ');
}
function feedbackCard(o, label, exp, wasFirstBad) {
  const consequence = o.legal === 'illegal' ? `<p class="consequence"><b>ผลที่ตามมา:</b> ${o.explain}</p>` : `<p>${o.explain}</p>`;
  return `<div class="fb ${o.legal}">
    <div class="fb-head"><span class="small">${label}</span> ${legalChip(o.legal)} <span class="chip exp">+${exp} EXP</span></div>
    <div class="fb-tags">${tagChips(o.tags)}</div>
    ${consequence}
    ${o.legal === 'undetermined' ? `<p class="small">ตัวเลือกนี้อิงตัวบทที่ยังไม่ได้ตรวจสอบกับต้นฉบับ จึงไม่นับในคะแนนด้านระเบียบ</p>` : ''}
    ${!wasFirstBad ? `<p class="teacher-view"><b>ครูอาจเห็นการตัดสินใจนี้อย่างไร:</b> ${esc(TEACHER_VIEW[o.tags[0]])}</p>` : ''}
  </div>`;
}
function logStep(L, st, o) {
  const tasks = COMMAND_TASKS[L.id] || [];
  for (const t of tasks) St.addLog(t.c, `ด่าน ${L.id} ขั้น "${st.title}": ทำตามแนวทางที่ ผอ. เลือก — ${strip(o.text).slice(0, 110)}`);
}

function finishLevelUI(L) {
  const beforeRank = St.rankFor().index;
  const tierBefore = St.tierOf(L.id).id;
  const nextTierOpenBefore = tierBefore < 4 && St.tierOpen(tierBefore + 1);
  const att = St.lv(L.id).attempt;
  // แนวการนำที่เลือกในด่านนี้
  const tagCount = {};
  L.steps.forEach((st, i) => { const o = st.options[att.answers[i].first]; tagCount[o.tags[0]] = (tagCount[o.tags[0]] || 0) + 1; });
  const domTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0][0];
  const cmdRows = Object.entries(att.commands).map(([c, r]) => `<li>${esc(CHARACTERS[c].name)}: ท่านเลือก <b>${COMMANDS[r.cmd].th}</b> · ความพร้อม ${r.readiness} · ${r.result === 'fit' ? 'เข้ากัน' : r.result === 'near' ? 'ใกล้เคียง' : 'ไม่เข้ากัน'}</li>`).join('');
  const res = St.finishLevel(L.id);
  const tick = res.passed ? Ec.semesterTick(L.id, Ec.meters()) : null;
  const gate = res.passed ? Rq.gate(L.id) : null;
  const pending = gate && !gate.ok;
  const pre = St.lv(L.id).reflectionBefore;
  activeLevel = null; syncWorld(); refreshHUD();
  const afterRank = St.rankFor();
  (res.passed ? Au.sfx.levelClear : Au.sfx.levelFail)();
  openModal(`<div class="lv-head" style="--area:${AREAS[L.area].color}"><span class="chip area">${AREAS[L.area].th}</span><h2>สรุปด่าน ${L.id} · ${esc(L.title)}</h2></div>
    <div class="kolb"><span>ประสบการณ์ตรง</span><span class="on">สังเกตและสะท้อนคิด</span><span class="on">สร้างความคิดรวบยอด</span><span class="on">ทดลองปฏิบัติ</span></div>
    <div class="result ${res.passed && !pending ? 'pass' : 'fail'}"><b>${res.exp}</b> / ${res.max} EXP · ${pending ? 'การตัดสินใจผ่านเกณฑ์ แต่โรงเรียนยังไม่พร้อม' : res.passed ? 'ผ่านด่าน' : `ยังไม่ผ่าน (ต้องได้ ${Math.ceil(res.max * PASS_RATIO)})`}</div>
    ${res.passed ? reqBox(L.id, { title: pending ? 'ด่านนี้จะนับว่าผ่านเมื่อโรงเรียนมีความพร้อมครบ' : 'โรงเรียนผ่านเกณฑ์ความพร้อมของด่านนี้' }) : ''}
    <div class="grid2">
      <section class="card"><h3>แบบแผนการตัดสินใจในด่านนี้</h3><div>${Object.entries(tagCount).map(([t, n]) => `<span class="chip tag" style="--tag:${TAGS[t].color}">${TAGS[t].th} × ${n}</span>`).join(' ')}</div>
        ${cmdRows ? `<h3>การทำงานกับคน</h3><ul class="tight">${cmdRows}</ul>` : ''}</section>
      <section class="card soft"><h3>การ์ดแนวคิด</h3><p><b>${TAGS[domTag].th}</b> (${TAGS[domTag].en})</p><p class="small">ฐานทฤษฎี: ${esc(TAGS[domTag].base)}</p>
        <p class="small">${esc(TEACHER_VIEW[domTag])}</p></section>
    </div>
    ${pre ? `<section class="card soft"><h3>ก่อนเริ่มด่าน ท่านเขียนไว้ว่า</h3><p class="quote">${esc(pre)}</p><p class="small">ตรงหรือต่างจากสิ่งที่ท่านเลือกในเกมอย่างไร</p></section>` : ''}
    <label class="field">บทเรียนหนึ่งข้อที่จะลองใช้ในโรงเรียนของท่าน (ลองปฏิบัติ)
      <textarea id="f-lesson" rows="2" maxlength="500">${esc(St.lv(L.id).lesson || '')}</textarea></label>
    <div class="btn-row"><button class="btn primary" id="f-done">กลับเมือง</button><button class="btn" id="f-again">เล่นด่านนี้ใหม่</button></div>`, { wide: true });
  showReader(L.reader, res.passed ? 'ขอบคุณท่านผู้อำนวยการที่พิจารณาเรื่องนี้อย่างรอบคอบ' : 'เรื่องนี้ยังต้องทบทวนอีกครั้ง ท่านสามารถเล่นด่านนี้ใหม่ได้', false);
  const keep = () => { const v = $('#f-lesson').value.trim(); if (v) { St.lv(L.id).lesson = v; St.save(); } grantAwards(); };
  $('#f-done').addEventListener('click', () => { keep(); closeModal(); afterLevelChange(L.id, beforeRank, nextTierOpenBefore); });
  $('#f-again').addEventListener('click', () => { keep(); openLevel(L.id); });
  if (afterRank.index > beforeRank) setTimeout(() => toast(`เลื่อนระดับเป็น <b>${afterRank.th}</b>`, 'rank'), 400);
  if (tick) {
    const d = tick.students - tick.studentsBefore;
    setTimeout(() => { Au.sfx.exp(); toast(`ได้รับงบรอบภาคเรียน · รายหัว +${Ec.fmt(tick.inPer)} · ค่าสาธารณูปโภคและค่าจ้าง −${Ec.fmt(tick.expense)} บาท<br>นักเรียน ${d >= 0 ? '+' : ''}${d} คน (รวม ${Ec.fmt(tick.students)} คน)`, 'good'); }, 1300);
    if (tick.full) setTimeout(() => toast('จำนวนนักเรียนเต็มความจุแล้ว หากต้องการรับเพิ่ม ต้องขยายพื้นที่โรงเรียน หรือยื่นคำขอตั้งงบลงทุนอาคารเรียนหลังใหม่ (ต้องมีพื้นที่ก่อน)', 'rank'), 2400);
    if (tick.crisisStart) setTimeout(() => crisisModal(), 1800);
    if (tick.crisisEnd) setTimeout(() => toast('โรงเรียนพ้นภาวะวิกฤตทางการเงินแล้ว', 'rank'), 1800);
  }
  // ความพร้อมของตัวละครที่เติบโต
  for (const c of Object.keys(att.commands)) {
    const cr = St.S.chars[c].credits;
    if (att.commands[c].result === 'fit' && (att.commands[c].readiness === 'R1' || att.commands[c].readiness === 'R2'))
      setTimeout(() => toast(`${esc(CHARACTERS[c].name)} มีความพร้อมเพิ่มขึ้น เพราะท่านเลือกวิธีทำงานที่สอดคล้องกับระดับความพร้อม (สะสม ${cr})`), 900);
  }
}
function afterLevelChange(id, beforeRank, nextTierOpenBefore) {
  refreshHUD(); syncWorld(); grantAwards();
  const t = St.tierOf(id).id;
  if (t < 4 && !nextTierOpenBefore && St.tierOpen(t + 1)) toast(`ปลดล็อก <b>${TIERS[t].th}</b>`, 'rank');
  if (t === 2 && TIERS[1].levels.every(St.levelDone) && !St.S.debrief.midShown) { St.S.debrief.midShown = true; St.save(); setTimeout(() => leaderBook('mid'), 600); }
  if (St.completedCount() === 20 && !St.S.debrief.finalShown) { St.S.debrief.finalShown = true; St.save(); setTimeout(() => leaderBook('final'), 600); }
}

// ---------------- Character sheet ----------------
function openChar(id) {
  const c = CHARACTERS[id]; const s = St.S.chars[id];
  const lvId = currentAttemptLevel();
  const task = lvId ? (COMMAND_TASKS[lvId] || []).find(t => t.c === id) : null;
  const att = lvId ? St.lv(lvId).attempt : null;
  const inMeet = task && att && att.phase !== 'brief';
  const done = inMeet && att.commands[id];
  const readiness = task ? St.taskReadiness(task) : c.readiness;
  const isPlayer = id === 'player';
  const sheet = $('#sheet');
  const cmdList = readiness === 'ST' ? ['consult', 'direct', 'delegate'] : ['direct', 'coach', 'support', 'delegate'];
  const routineDone = s.routineAt === St.completedCount();
  let body = '';
  if (isPlayer) {
    const r = St.rankFor();
    body = `<p>${esc(c.role)}</p><p class="small">ระดับ: <b>${r.th}</b> · ${r.sub}</p><p class="small">ผ่าน ${St.completedCount()}/20 ด่าน · ${St.totalExp()} EXP</p>
      <div class="btn-row"><button class="btn sm primary" data-act="board">ภารกิจ</button><button class="btn sm" data-act="book">สมุดผู้นำ</button></div>`;
  } else {
    body = `<p class="small">${esc(c.role)}</p>${BIOS[id] ? `<p class="bio">${esc(BIOS[id].bio)}</p>` : ''}
      ${readiness ? `<p class="ready"><span class="chip">${readiness === 'ST' ? 'ผู้มีส่วนได้เสีย' : readiness}</span> ${esc(READINESS_TH[readiness])}</p>` : ''}
      ${c.readiness && c.readiness !== 'ST' ? `<div class="morale"><span>ขวัญกำลังใจ</span><div class="bar"><i style="width:${s.morale}%"></i></div><b>${s.morale}</b></div>` : ''}`;
    if (inMeet) {
      body += `<div class="task-box"><h4>ด่าน ${lvId}: เลือกวิธีทำงานกับ${esc(c.name)}</h4><p class="small">${task.note}</p>
        ${done ? cmdFeedback(id, done) + nextAfterMeet(lvId) : `<div class="cmds">${cmdList.map(k => `<button class="cmd" data-cmd="${k}"><b>${COMMANDS[k].th}</b><span>${COMMANDS[k].hint}</span></button>`).join('')}</div>`}</div>`;
    } else if (c.readiness) {
      body += `<div class="task-box soft"><h4>งานประจำ: ${esc(ROUTINE[id] || 'งานทั่วไป')}</h4>
        ${routineDone ? `<p class="small">ท่านคุยเรื่องนี้แล้ว รอบถัดไปเปิดหลังผ่านด่านถัดไป</p>` : `<p class="small">ฝึกอ่านความพร้อมของคน ไม่ได้ EXP แต่มีผลต่อขวัญกำลังใจและตัวชี้วัด "มีสุข"</p>
        <div class="cmds">${cmdList.map(k => `<button class="cmd" data-rcmd="${k}"><b>${COMMANDS[k].th}</b><span>${COMMANDS[k].hint}</span></button>`).join('')}</div>`}</div>`;
    }
    body += `<h4>สิ่งที่${esc(c.name)}ทำไปแล้ว</h4>${s.log.length ? `<ul class="log">${s.log.slice(0, 8).map(e => `<li>${esc(e.text)}</li>`).join('')}</ul>` : '<p class="small">ยังไม่มีบันทึก</p>'}`;
  }
  sheet.innerHTML = `<button class="x" data-act="closeSheet" aria-label="ปิด">×</button>
    <div class="sheet-head"><span class="avatar" style="--shirt:${c.look.shirt};--skin:${c.look.skin};--hair:${c.look.hair}"></span><div><h3>${esc(c.name)}</h3></div></div>${body}`;
  if (!sheet.classList.contains('show')) Au.sfx.open();
  sheet.classList.add('show');
  sheet.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => {
    const r = St.judgeCommand(lvId, id, b.dataset.cmd);
    St.addLog(id, `ด่าน ${lvId}: ได้รับการ${COMMANDS[b.dataset.cmd].th}จาก ผอ.`);
    St.save();
    (r.result === 'fit' ? Au.sfx.cmdFit : Au.sfx.cmdMiss)();
    if (r.result !== 'miss') toast(`+${COMMAND_EXP[r.result]} EXP · ${r.result === 'fit' ? 'สอดคล้องกับระดับความพร้อม' : 'ใกล้เคียงกับระดับความพร้อม'}`, 'good');
    refreshHUD(); syncWorld(); openChar(id); grantAwards();
    const pending = (COMMAND_TASKS[lvId] || []).filter(t => !St.lv(lvId).attempt.commands[t.c]);
    if (!pending.length) toast('ท่านพบบุคลากรครบแล้ว กด "เริ่มตัดสินใจ" ที่แถบด่านด้านล่าง');
  }));
  sheet.querySelectorAll('[data-rcmd]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.rcmd;
    const fit = readiness === 'ST' ? 'consult' : ({ R1: 'direct', R2: 'coach', R3: 'support', R4: 'delegate' })[readiness];
    const ok = k === fit;
    s.morale = Math.max(10, Math.min(100, s.morale + (ok ? 5 : -4)));
    if (ok && (readiness === 'R1' || readiness === 'R2')) s.credits++;
    s.routineAt = St.completedCount();
    (ok ? Au.sfx.cmdFit : Au.sfx.cmdMiss)();
    St.addLog(id, `งานประจำ "${ROUTINE[id]}": ได้รับการ${COMMANDS[k].th}จาก ผอ. ${ok ? '(ทำได้ราบรื่น)' : '(ดูอึดอัด)'}`);
    St.save(); refreshHUD();
    toast(`${esc(CHARACTERS[id].name)}: ${esc(pickLine(ok ? (fit === 'consult' ? 'consultFit' : 'fit') : (readiness === 'ST' ? 'stakeholderCommand' : (['direct', 'coach', 'support', 'delegate'].indexOf(k) < ['direct', 'coach', 'support', 'delegate'].indexOf(fit) ? 'over' : 'under'))))}`);
    openChar(id);
  }));
}
function pickLine(k) { const a = COMMAND_REACTIONS[k]; return a[Math.floor(Math.random() * a.length)]; }
function cmdFeedback(id, d) {
  const key = d.result === 'fit' ? (d.fit === 'consult' ? 'consultFit' : 'fit') : (d.fit === 'consult' ? 'stakeholderCommand' : (['direct', 'coach', 'support', 'delegate'].indexOf(d.cmd) < ['direct', 'coach', 'support', 'delegate'].indexOf(d.fit) ? 'over' : 'under'));
  const line = COMMAND_REACTIONS[key][0];
  return `<div class="fb ${d.result === 'fit' ? 'ok' : d.result === 'near' ? 'undetermined' : 'illegal'}">
    <p class="say">“${esc(line)}”</p>
    <p class="small">ท่านเลือก <b>${COMMANDS[d.cmd].th}</b> · ความพร้อมในด่านนี้ ${d.readiness} · วิธีที่เข้ากันคือ <b>${COMMANDS[d.fit].th}</b> → ${d.result === 'fit' ? `เข้ากัน +${COMMAND_EXP.fit} EXP` : d.result === 'near' ? `ใกล้เคียง +${COMMAND_EXP.near} EXP` : 'ไม่เข้ากัน 0 EXP'}</p>
    <p class="small">หมายเหตุ: หลักฐานเชิงประจักษ์ของโมเดล Hersey–Blanchard ยังอ่อน เกมใช้เพื่อฝึกการอ่านคน ไม่ได้อ้างว่าคำสั่งที่เข้าคู่ได้ผลดีกว่าเสมอ</p></div>`;
}
function nextAfterMeet(lvId) {
  const att = St.lv(lvId).attempt;
  const pending = (COMMAND_TASKS[lvId] || []).filter(t => !att.commands[t.c]);
  return pending.length
    ? `<div class="btn-row"><button class="btn sm primary" data-act="fly" data-arg="${pending[0].c}">ไปพบ${esc(CHARACTERS[pending[0].c].name)}</button></div>`
    : `<div class="btn-row"><button class="btn sm primary" data-act="beginSteps" data-arg="${lvId}">เริ่มตัดสินใจ</button></div>`;
}
function closeSheet() { $('#sheet').classList.remove('show'); }

export function onCharClick(id) {
  if (visiting) return toast('ท่านกำลังเยี่ยมโรงเรียนของผู้อื่น โปรดกลับโรงเรียนของตนเองก่อนทำงานกับบุคลากร');
  if (id.startsWith('student')) return toast('นักเรียนกำลังทำกิจกรรมในสนาม ทุกการตัดสินใจของท่านส่งผลถึงนักเรียนในท้ายที่สุด');
  Sc.flyToChar(id); openChar(id);
}
export function onBuildingClick(id) {
  if (visiting) return;
  if (id === 'hall') { Sc.flyToBuilding('hall'); return hallModal(); }
  const areaOf = { academic: 'academic', personnel: 'personnel', budget: 'budget', general: 'general' };
  const area = areaOf[id];
  const sheet = $('#sheet');
  const names = { canteen: 'โรงอาหาร', toilet: 'ห้องน้ำนักเรียน', guidance: 'ห้องแนะแนว', field: 'สนามกีฬา', areaOffice: AREA_OFFICE, health: 'หน่วยบริการสาธารณสุข', police: 'ป้อมตำรวจชุมชน', cafe: 'คาเฟ่ชุมชน', flower: 'ร้านดอกไม้' };
  let html = '';
  if (area) {
    const A = AREAS[area];
    const lvls = LEVELS.filter(l => l.area === area);
    html = `<h3 style="color:${A.color}">${A.th}</h3><p class="small">${esc(A.why)}</p>
      <h4>ด่านของงานนี้</h4><ul class="lv-list">${lvls.map(l => `<li><span>ด่าน ${l.id} · ${esc(l.title)}</span> ${statusChip(l.id)} ${St.levelOpen(l.id) ? `<button class="btn sm" data-act="start" data-arg="${l.id}">เปิด</button>` : ''}</li>`).join('')}</ul>`;
  } else {
    const hints = {
      toilet: 'ห้องน้ำนักเรียนที่มีผู้ใช้หลายร้อยคนต่อวัน หากระบบประปาชำรุด ผู้บริหารต้องเลือกแหล่งเงินและวิธีจัดจ้างให้ถูกต้องตามระเบียบ (ด่าน 2)',
      canteen: 'โรงอาหารใช้น้ำบาดาลในการประกอบอาหาร คุณภาพน้ำจึงเป็นประเด็นด้านความปลอดภัยของนักเรียน (ด่าน 13)',
      areaOffice: 'สำนักงานเขตพื้นที่การศึกษา หน่วยงานต้นสังกัดของโรงเรียน การทำงานกับหน่วยเหนือใช้การหารือและการนำเสนอข้อมูล',
      health: 'หน่วยงานภายนอกที่โรงเรียนต้องประสานเมื่อเกิดเหตุด้านสุขภาพของนักเรียนและบุคลากร',
      police: 'ภายหลังการยกเลิกเวรครู การรักษาความปลอดภัยในเวลากลางคืนดำเนินการร่วมกับตำรวจและองค์กรปกครองส่วนท้องถิ่น (ด่าน 1)',
      field: 'สนามกีฬาที่นักเรียนใช้ทำกิจกรรมในช่วงพักกลางวัน',
      guidance: 'ห้องแนะแนว จุดเริ่มต้นของระบบดูแลช่วยเหลือนักเรียน',
      cafe: 'ร้านค้าในชุมชนรอบโรงเรียน', flower: 'ร้านค้าในชุมชนรอบโรงเรียน',
    };
    html = `<h3>${esc(names[id] || id)}</h3><p class="small">${esc(hints[id] || 'ส่วนหนึ่งของชุมชนรอบโรงเรียน')}</p>`;
  }
  sheet.innerHTML = `<button class="x" data-act="closeSheet" aria-label="ปิด">×</button>${html}`;
  sheet.classList.add('show');
  Sc.flyToBuilding(id);
}

// ---------------- Leader book / debrief ----------------
function bar(v, color) { return `<div class="bar"><i style="width:${v ?? 0}%;${color ? `background:${color}` : ''}"></i></div>`; }
function leaderBook(kind) {
  const P = St.computeProfile();
  if (!P.steps) return openModal(`<h2>สมุดผู้นำ</h2><p>ยังไม่มีข้อมูล เล่นจบอย่างน้อย 1 ด่านเพื่อเห็นแนวโน้มการตัดสินใจของท่าน</p><div class="btn-row"><button class="btn primary" data-act="board">ไปที่ภารกิจ</button></div>`);
  const pr = P.profile;
  const d = (St.S.debrief[kind || 'book'] ||= {});
  const axis = (k) => { const a = P.axes[k];
    return `<div class="axis"><div class="ax-lbl"><span>${a.left} <b>${a.l}</b></span><span><b>${a.r}</b> ${a.right}</span></div>
      ${a.separate ? `<div class="ax-sep">${bar(a.l, '#E07A9B')}${bar(a.r, '#8C8C7A')}</div><p class="tiny">Bass ถือว่าผู้นำที่ดีที่สุดสูงทั้งสองด้าน จึงรายงานแยกสองค่า ไม่หักลบกัน</p>`
        : `<div class="ax-track"><i style="left:${a.l + a.r ? Math.round(100 * a.r / (a.l + a.r)) : 50}%"></i></div>`}</div>`; };
  const tagRows = Object.keys(TAGS).map(t => `<div class="tagrow"><span class="chip tag" style="--tag:${TAGS[t].color}">${TAGS[t].th}</span>${bar(P.pct[t], TAGS[t].color)}<b>${P.pct[t] == null ? '–' : P.pct[t] + '%'}</b></div>`).join('');
  const ex = P.top.map(t => (P.examples[t] || []).slice(-2).map(e => `<li><span class="chip tag" style="--tag:${TAGS[t].color}">${TAGS[t].th}</span> ด่าน ${e.lv}: ${strip(e.text)}</li>`).join('')).join('');
  const lessons = Object.entries(St.S.levels).filter(([, l]) => l.lesson).map(([id, l]) => `<li>ด่าน ${id}: ${esc(l.lesson)}</li>`).join('');
  openModal(`<div class="book">
    <div class="book-head"><div><span class="chip">${kind === 'mid' ? 'สรุปกลางทาง หลังช่วงที่ 2' : kind === 'final' ? 'สรุปปลายทาง ครบ 20 ด่าน' : 'สมุดผู้นำ'}</span>
      <h2>แนวโน้มการตัดสินใจในเกมนี้: ${pr.th}</h2>
      <p class="small">${esc(St.S.playerName ? 'ผอ.' + St.S.playerName : '')} · คำนวณจาก ${P.steps} การตัดสินใจ และการทำงานกับคน ${P.cmdTotal} ครั้ง · เกณฑ์: ${esc(pr.rule)}</p></div>
      <button class="btn sm" id="bk-print">พิมพ์ / บันทึก PDF</button></div>
    <div class="grid2">
      <section class="card"><h3>จุดแข็งที่ควรรักษา</h3><p>${esc(pr.strength)}</p><h3>ขอบที่ควรขยาย</h3><p>${esc(pr.edge)}</p>
        <h3>แนวทางพัฒนาตน</h3><ul class="tight">${pr.grow.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
        <p class="tiny">อ้างอิง: ${pr.refs.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>`).join(' · ')}</p></section>
      <section class="card"><h3>สี่แกน (สัดส่วนของโอกาสที่ได้เลือก)</h3>${['A', 'B', 'C', 'D'].map(axis).join('')}
        <div class="scores"><div><b>${P.knowledge ?? '–'}%</b><span>ความรู้ระเบียบ</span></div><div><b>${P.fitScore ?? '–'}%</b><span>ความสอดคล้องกับความพร้อมของบุคลากร</span></div><div class="${P.flag > 30 ? 'hi' : ''}"><b>${P.flag}%</b><span>พฤติกรรมนิ่งเฉย</span></div></div></section>
    </div>
    <section class="card"><h3>แนวการนำ 7 แนวและพฤติกรรมนิ่งเฉย</h3><p class="tiny">ร้อยละ = คะแนนที่ท่านเลือก ÷ คะแนนสูงสุดที่แนวนั้นเปิดให้เลือกในขั้นที่ท่านผ่าน (แนวหลัก 2 คะแนน แนวรอง 1 คะแนน) วิธีนี้ลดอคติที่เกิดจากจำนวนตัวเลือกของแต่ละแนวในคลังสถานการณ์ไม่เท่ากัน</p>${tagRows}</section>
    ${ex ? `<section class="card soft"><h3>ตัวอย่างการตัดสินใจของท่านที่สะท้อนแนวโน้มนี้</h3><ul class="tight">${ex}</ul></section>` : ''}
    <section class="card soft"><h3>ข้อเสนอร่วมของทุกโปรไฟล์</h3><p class="small">${esc(COMMON_ADVICE)} (<a href="${REF.robinson}" target="_blank" rel="noopener">Robinson et al., 2008</a> · <a href="${REF.h1994}" target="_blank" rel="noopener">Hallinger et al., 1994</a> · <a href="${REF.hl2014}" target="_blank" rel="noopener">Hallinger & Lee, 2014</a>)</p></section>
    ${lessons ? `<section class="card"><h3>บทเรียนที่ท่านบันทึกไว้</h3><ul class="tight">${lessons}</ul></section>` : ''}
    <section class="card"><h3>สะท้อนคิด 3 คำถาม</h3>
      <label class="field">1. ท่านเห็นแบบแผนอะไรในการตัดสินใจของตนเอง<textarea data-k="q1" rows="2">${esc(d.q1 || '')}</textarea></label>
      <label class="field">2. แบบแผนนั้นได้ผลหรือไม่ได้ผลเมื่อใด<textarea data-k="q2" rows="2">${esc(d.q2 || '')}</textarea></label>
      <label class="field">3. เดือนหน้าท่านจะลองทำอะไรในโรงเรียน (เขียนเป็นแผน PIE)</label>
      <div class="pie">
        <label class="field">P · วางแผน<textarea data-k="p" rows="3" placeholder="เป้าหมาย ใครร่วม ใช้ทรัพยากรอะไร">${esc(d.p || '')}</textarea></label>
        <label class="field">I · ลงมือ<textarea data-k="i" rows="3" placeholder="ทำอะไร เมื่อไร มอบหมายใคร ด้วยวิธีใด">${esc(d.i || '')}</textarea></label>
        <label class="field">E · ประเมิน<textarea data-k="e" rows="3" placeholder="รู้ได้อย่างไรว่าได้ผล ดูจากหลักฐานอะไร">${esc(d.e || '')}</textarea></label>
      </div></section>
    <p class="fineprint">${esc(VALIDITY_NOTE)} (<a href="${REF.peus}" target="_blank" rel="noopener">Peus et al., 2013</a> · <a href="${REF.hbg2025}" target="_blank" rel="noopener">Hallinger, Banoğlu & Gümüş, 2025</a>)</p>
    <div class="btn-row"><button class="btn primary" data-act="close">บันทึกและปิด</button></div></div>`, { wide: true, cls: 'bookmodal' });
  $('#modal-body').querySelectorAll('textarea[data-k]').forEach(t => t.addEventListener('input', () => { d[t.dataset.k] = t.value; St.save(); }));
  $('#bk-print').addEventListener('click', () => window.print());
}

// ---------------- Save ----------------
function saveModal() {
  const code = St.exportCode();
  openModal(`<h2>บันทึกความคืบหน้า</h2>
    <p>เกมบันทึกอัตโนมัติในเบราว์เซอร์นี้ทุกครั้งที่ท่านตัดสินใจ ถ้าจะย้ายไปเล่นเครื่องอื่น ล้างข้อมูลเบราว์เซอร์ หรือเปิดโหมดไม่ระบุตัวตน ให้เก็บรหัสสำรองไว้</p>
    <section class="card"><h3>รหัสสำรองของท่าน</h3>
      <textarea id="sv-code" rows="4" readonly>${esc(code)}</textarea>
      <div class="btn-row"><button class="btn primary" id="sv-copy">คัดลอกรหัส</button><button class="btn" id="sv-dl">ดาวน์โหลดไฟล์ .json</button></div></section>
    <section class="card"><h3>นำเข้ารหัสหรือไฟล์</h3>
      <textarea id="sv-in" rows="3" placeholder="วางรหัสที่ขึ้นต้นด้วย BSV1. ที่นี่"></textarea>
      <div class="btn-row"><button class="btn primary" id="sv-load">นำเข้า</button><label class="btn">เลือกไฟล์ .json<input type="file" id="sv-file" accept=".json,application/json" hidden></label></div></section>
    <section class="card soft"><h3>เริ่มใหม่ทั้งหมด</h3><p class="small">ลบความคืบหน้าในเบราว์เซอร์นี้ ย้อนกลับไม่ได้</p><button class="btn danger" id="sv-reset">ลบข้อมูลและเริ่มใหม่</button></section>`);
  $('#sv-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); toast('คัดลอกแล้ว'); } catch { $('#sv-code').select(); document.execCommand('copy'); toast('คัดลอกแล้ว'); } });
  $('#sv-dl').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(St.S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `banSuan-save-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const doImport = txt => { try { St.importCode(txt); refreshHUD(); syncWorld(); closeModal(); toast('นำเข้าความคืบหน้าแล้ว', 'good'); } catch (e) { toast('นำเข้าไม่สำเร็จ: ' + esc(e.message), 'bad'); } };
  $('#sv-load').addEventListener('click', () => doImport($('#sv-in').value));
  $('#sv-file').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(doImport); });
  $('#sv-reset').addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'กดอีกครั้งเพื่อยืนยันการลบ'; return; }
    St.resetAll(); refreshHUD(); syncWorld(); closeSheet(); showTitle();
  });
}

// ---------------- Sound ----------------
function soundModal() {
  const st = Au.getSettings();
  openModal(`<h2>เสียง</h2>
    <p class="small">เพลงและเสียงเอฟเฟกต์สังเคราะห์ขึ้นในเบราว์เซอร์ ไม่ได้ใช้ไฟล์เพลงจากที่อื่น เพลงจะเบาลงเองระหว่างอ่านสถานการณ์</p>
    <label class="switch-row"><span><b>เพลงประกอบ</b><small>ลูปมาริมบาโทนอบอุ่นของเมืองบ้านสวน</small></span><input type="checkbox" id="snd-music" ${st.music ? 'checked' : ''}></label>
    <label class="switch-row"><span><b>เสียงเอฟเฟกต์</b><small>คลิก ตอบ ได้ EXP ผ่านด่าน เลื่อนระดับ ปลดล็อก</small></span><input type="checkbox" id="snd-sfx" ${st.sfx ? 'checked' : ''}></label>
    <label class="field">ความดังรวม <input type="range" id="snd-vol" min="0" max="1" step="0.05" value="${st.vol}"></label>
    <div class="btn-row"><button class="btn" id="snd-test">ลองฟังเสียงเลื่อนระดับ</button><button class="btn primary" data-act="close">เสร็จ</button></div>`);
  $('#snd-music').addEventListener('change', e => { Au.unlock(); Au.setMusic(e.target.checked); refreshSoundIcon(); });
  $('#snd-sfx').addEventListener('change', e => { Au.setSfx(e.target.checked); refreshSoundIcon(); });
  $('#snd-vol').addEventListener('input', e => Au.setVolume(+e.target.value));
  $('#snd-test').addEventListener('click', () => Au.sfx.rankUp());
}
export function refreshSoundIcon() {
  const st = Au.getSettings();
  const b = document.querySelector('#dock [data-act=sound]');
  if (b) b.classList.toggle('muted', !st.music && !st.sfx);
}

// ---------------- ตัวละครเด้งขึ้นมาอ่านภารกิจ ----------------
function showReader(charId, line, big) {
  const r = $('#reader');
  if (!charId) return hideReader();
  const wide = window.innerWidth >= 760;
  Sc.setPortrait(charId, wide ? [150, 170] : [104, 118]);
  const pic = r.querySelector('.reader-pic');
  const cv = Sc.portraitCanvas();
  if (cv.parentElement !== pic) pic.appendChild(cv);
  r.querySelector('.who').textContent = CHARACTERS[charId].name;
  r.querySelector('.say').textContent = line || '';
  r.classList.add('inline'); r.classList.toggle('lg', wide);
  const body = $('#modal-body');
  const head = body.querySelector('.lv-head');
  if (head) head.after(r); else body.insertBefore(r, body.firstChild);
  r.hidden = false;
  if (big) { r.classList.remove('pop'); void r.offsetWidth; r.classList.add('pop'); Au.sfx.page(); }
}
function hideReader() {
  const r = $('#reader'); if (!r) return;
  r.hidden = true; Sc.setPortrait(null);
  if (r.parentElement !== document.body) document.body.appendChild(r);
}

// ---------------- หอเกียรติยศ ----------------
function grantAwards() {
  const fresh = Aw.checkAwards();
  fresh.forEach((a, k) => setTimeout(() => {
    Au.sfx.award();
    toast(`ได้รับ <b>${esc(a.th)}</b>${a.who ? ' (' + esc(Aw.whoName(a)) + ')' : ''}`, 'rank award');
  }, 600 + k * 900));
  if (fresh.length) Sc.setTrophies(Aw.earnedCount());
}
function hallModal() {
  const got = St.S.awards || {};
  const card = a => {
    const ok = !!got[a.id];
    return `<div class="award ${ok ? 'got' : ''}">
      <div class="medal">${ok ? '★' : '☆'}</div>
      <div><b>${esc(a.th)}</b>${a.who ? `<span class="small"> · ${esc(Aw.whoName(a))}</span>` : ''}
      <p class="small">${esc(a.how)}</p>${ok ? `<p class="tiny">ได้รับเมื่อ ${new Date(got[a.id]).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>` : ''}</div></div>`;
  };
  openModal(`<h2>หอเกียรติยศ ${esc(SCHOOL_NAME)}</h2>
    <p class="small">ได้รับแล้ว ${Aw.earnedCount()} จาก ${Aw.AWARDS.length} รางวัล ชื่อรางวัลแต่งขึ้นเพื่อใช้ในเกม เกณฑ์อิงพฤติกรรมการตัดสินใจ ไม่ใช่เพียงจำนวน EXP รางวัลของครูและบุคลากรสะท้อนผลจากวิธีที่ท่านทำงานกับบุคคลนั้น</p>
    ${Object.entries(Aw.GROUPS).map(([g, th]) => `<h3>${th}</h3><div class="awards">${Aw.AWARDS.filter(a => a.group === g).map(card).join('')}</div>`).join('')}
    <div class="btn-row"><button class="btn primary" data-act="share">แชร์ภาพโรงเรียน</button><button class="btn ghost" data-act="close">ปิด</button></div>`, { wide: true });
}

// ---------------- เมนูรวม ----------------
function menuModal() {
  openModal(`<h2>เมนู</h2>
    <div class="menu-grid">
      <button class="btn" data-act="cast">ทำเนียบบุคลากร</button>
      <button class="btn" data-act="share">แชร์ภาพโรงเรียน</button>
      <button class="btn" data-act="visit">เยี่ยมโรงเรียนอื่น</button>
      <button class="btn" data-act="rules">กติกาและผลที่ได้รับ</button>
      <button class="btn" data-act="intro">ชมประวัติโรงเรียน</button>
      <button class="btn" data-act="sound">ตั้งค่าเสียง</button>
      <button class="btn" data-act="save">บันทึกและรหัสสำรอง</button>
      <button class="btn" data-act="title">กลับหน้าแรก</button>
    </div>`);
}

// ---------------- ถ่ายภาพและแชร์ ----------------
function gameUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
async function makeShareCard(view = 'current', format = 'card') {
  closeSheet();
  await (document.fonts?.ready || Promise.resolve());
  const shot = new Image();
  shot.src = Sc.snapshot(view === 'wide');
  await shot.decode().catch(() => {});
  if (format === 'frame') {
    // ภาพเต็มเฟรมตามมุมที่ผู้เล่นจัดเอง พร้อมแถบข้อมูลเล็กด้านล่าง
    const fw = shot.width, fh = shot.height, band = Math.round(fh * 0.12);
    const c = document.createElement('canvas'); c.width = fw; c.height = fh + band;
    const g = c.getContext('2d');
    g.drawImage(shot, 0, 0);
    g.fillStyle = '#FFF8EE'; g.fillRect(0, fh, fw, band);
    const fs = Math.round(band * 0.3);
    g.fillStyle = '#3A2E28'; g.font = `500 ${fs}px Mitr, sans-serif`; g.textBaseline = 'middle';
    g.fillText(`${SCHOOL_NAME}${St.S.playerName ? ' · ผอ.' + St.S.playerName : ''}`, band * 0.35, fh + band * 0.36);
    g.fillStyle = '#6B5A4E'; g.font = `400 ${Math.round(fs * 0.75)}px Sarabun, sans-serif`;
    g.fillText(`${St.rankFor().th} · ${St.totalExp()} EXP · นักเรียน ${Ec.fmt(Ec.econ().students)} คน · รางวัล ${Aw.earnedCount()} · ${gameUrl().replace(/^https?:\/\//, '')}`, band * 0.35, fh + band * 0.72);
    return c;
  }
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#FFF8EE'; g.fillRect(0, 0, W, H);
  // ภาพเมือง (ครอบตัดให้เต็มพื้นที่ด้านบน)
  const ih = 820, sr = shot.width / shot.height, tr = W / ih;
  let sw = shot.width, sh = shot.height, sx = 0, sy = 0;
  if (sr > tr) { sw = shot.height * tr; sx = (shot.width - sw) / 2; } else { sh = shot.width / tr; sy = (shot.height - sh) / 2; }
  g.save(); g.beginPath(); g.roundRect(40, 40, W - 80, ih - 40, 36); g.clip();
  g.drawImage(shot, sx, sy, sw, sh, 40, 40, W - 80, ih - 40); g.restore();
  // ป้ายชื่อเกมบนภาพ
  g.fillStyle = 'rgba(255,253,248,.92)'; g.beginPath(); g.roundRect(70, 70, 470, 64, 32); g.fill();
  g.fillStyle = '#D9714F'; g.font = '500 30px Mitr, sans-serif'; g.textBaseline = 'middle'; g.fillText('เส้นทางผู้บริหาร · เมืองบ้านสวน', 96, 103);
  const r = St.rankFor(), m = Ec.meters(), aw = Aw.earnedCount();
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#3A2E28'; g.font = '500 58px Mitr, sans-serif'; g.fillText(SCHOOL_NAME, 60, 930);
  g.fillStyle = '#6B5A4E'; g.font = '400 34px Sarabun, sans-serif';
  g.fillText(`${St.S.playerName ? 'ผอ.' + St.S.playerName + ' · ' : ''}${r.th} · นักเรียน ${Ec.fmt(Ec.econ().students)} คน`, 60, 982);
  // สถิติ
  const stat = (x, big, small) => { g.fillStyle = '#FBEFE3'; g.beginPath(); g.roundRect(x, 1015, 305, 130, 24); g.fill(); g.fillStyle = '#D9714F'; g.font = '500 54px Mitr, sans-serif'; g.fillText(big, x + 28, 1085); g.fillStyle = '#6B5A4E'; g.font = '400 28px Sarabun, sans-serif'; g.fillText(small, x + 28, 1125); };
  stat(60, String(St.totalExp()), 'EXP สะสม'); stat(387, `${St.completedCount()}/20`, 'ด่านที่ผ่าน'); stat(714, String(aw), 'รางวัลในหอเกียรติยศ');
  // เก่ง ดี มีสุข
  const bars = [['เก่ง', m.keng, '#5B8DD6'], ['ดี', m.dee, '#6FAF7A'], ['มีสุข', m.suk, '#E07A9B']];
  bars.forEach(([lab, v, col], i) => {
    const x = 60 + i * 327, y = 1185;
    g.fillStyle = '#3A2E28'; g.font = '500 30px Mitr, sans-serif'; g.fillText(lab, x, y + 26);
    g.fillStyle = '#F1E6D6'; g.beginPath(); g.roundRect(x + 100, y + 6, 190, 22, 11); g.fill();
    if (v != null) { g.fillStyle = col; g.beginPath(); g.roundRect(x + 100, y + 6, Math.max(22, 190 * v / 100), 22, 11); g.fill(); }
    else { g.fillStyle = '#A89888'; g.font = '400 24px Sarabun, sans-serif'; g.fillText('ยังไม่มีข้อมูล', x + 112, y + 25); }
  });
  g.fillStyle = '#8A7A6E'; g.font = '400 26px Sarabun, sans-serif';
  g.fillText('ร่วมเล่นได้ที่ ' + gameUrl().replace(/^https?:\/\//, ''), 60, 1300);
  return c;
}
let shareOpt = { view: 'current', format: 'card' };
async function shareModal(opt) {
  if (opt) Object.assign(shareOpt, opt);
  closeModal(); closeSheet();
  // รอให้หน้าต่างปิดก่อน ภาพจะได้เป็นมุมกล้องที่ผู้เล่นกำลังมองอยู่จริง
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  Au.sfx.shutter();
  $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go');
  const c = await makeShareCard(shareOpt.view, shareOpt.format);
  const url = c.toDataURL('image/png');
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const file = new File([blob], 'ban-suan-school.png', { type: 'image/png' });
  const canFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const text = `โรงเรียนของฉันในเกมเส้นทางผู้บริหาร: ${St.rankFor().th} · ${St.totalExp()} EXP · ผ่าน ${St.completedCount()}/20 ด่าน`;
  const seg = (k, v, th) => `<button class="tab ${shareOpt[k] === v ? 'on' : ''}" data-sk="${k}" data-sv="${v}">${th}</button>`;
  openModal(`<h2>แชร์ภาพโรงเรียน</h2>
    <div class="share-opts">
      <div><span class="small">มุมภาพ</span><div class="tabs">${seg('view', 'current', 'มุมที่ท่านจัดไว้')}${seg('view', 'wide', 'มุมกว้างทั้งโรงเรียน')}</div></div>
      <div><span class="small">รูปแบบ</span><div class="tabs">${seg('format', 'card', 'การ์ดแนวตั้ง')}${seg('format', 'frame', 'ภาพเต็มเฟรม')}</div></div>
    </div>
    <img class="share-img ${shareOpt.format}" src="${url}" alt="ภาพโรงเรียนของท่านพร้อมระดับ EXP และรางวัล">
    <p class="small center">ต้องการมุมอื่น กด "จัดมุมใหม่" แล้วหมุน ซูม หรือเลื่อนเมืองตามต้องการ จากนั้นกดปุ่มกล้องที่มุมขวาล่าง</p>
    <div class="btn-row">
      ${canFile ? `<button class="btn primary" id="sh-native">แชร์ไปยังแอป (Facebook, Instagram, LINE)</button>` : ''}
      <a class="btn ${canFile ? '' : 'primary'}" id="sh-dl" href="${url}" download="ban-suan-school.png">บันทึกภาพลงเครื่อง</a>
      <button class="btn" id="sh-again">จัดมุมใหม่</button>
      <button class="btn" id="sh-fb">แชร์ลิงก์เกมทาง Facebook</button>
      <button class="btn" id="sh-line">แชร์ลิงก์เกมทาง LINE</button>
      <button class="btn ghost" id="sh-copy">คัดลอกข้อความ</button>
    </div>
    <p class="small">${canFile ? 'ปุ่มแรกเปิดเมนูแชร์ของเครื่อง เลือก Facebook, Instagram หรือ LINE ได้' : 'บนคอมพิวเตอร์ ให้บันทึกภาพลงเครื่องก่อน แล้วอัปโหลดไปยังสื่อสังคมออนไลน์'} ส่วนปุ่ม Facebook และ LINE จะแชร์ลิงก์เกม เพราะสองช่องทางนี้ไม่รับไฟล์ภาพจากเว็บโดยตรง สำหรับ Instagram ให้บันทึกภาพแล้วโพสต์จากแอป</p>`, { wide: true });
  $('#modal-body').querySelectorAll('[data-sk]').forEach(b => b.addEventListener('click', () => shareModal({ [b.dataset.sk]: b.dataset.sv })));
  $('#sh-again').addEventListener('click', () => { closeModal(); shareOpt.view = 'current'; toast('จัดมุมเมืองตามต้องการ แล้วกดปุ่มกล้องที่มุมขวาล่าง'); $('#camctl [data-act=snap]')?.classList.add('pulse'); });
  $('#sh-native')?.addEventListener('click', async () => { try { await navigator.share({ files: [file], title: 'เส้นทางผู้บริหาร เมืองบ้านสวน', text: text + ' ' + gameUrl() }); } catch {} });
  $('#sh-fb').addEventListener('click', () => window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(gameUrl()), '_blank', 'noopener'));
  $('#sh-line').addEventListener('click', () => window.open('https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(gameUrl()), '_blank', 'noopener'));
  $('#sh-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(text + ' ' + gameUrl()); toast('คัดลอกข้อความแล้ว'); } catch { toast('คัดลอกไม่สำเร็จ'); } });
}

// ---------------- งบประมาณ ร้านค้า และเควสระดมทรัพยากร ----------------
const VERDICT = {
  ok: ['ok', 'ใช้ได้ตามระเบียบ'], bad: ['bad', 'ขัดระเบียบ'], unv: ['unv', 'ยังไม่ยืนยันตัวบท'],
  short: ['unv', 'เงินไม่พอ'], nocap: ['unv', 'ยังไม่ได้รับจัดสรร'], locked: ['unv', 'ยังเปิดซื้อไม่ได้'], owned: ['ok', 'มีแล้ว'], noland: ['unv', 'ยังไม่มีพื้นที่'],
};
function walletRows() {
  const e = Ec.econ();
  const rows = [
    ['perhead', e.wallets.perhead], ['activity', e.wallets.activity], ['income', e.wallets.income],
    ['donation', Ec.donationTotal()], ['capital', Ec.balance('capital')], ['student', e.wallets.student],
  ];
  return rows.map(([k, v]) => `<div class="wallet" style="--w:${Ec.WALLETS[k].color}"><span>${Ec.WALLETS[k].th}</span><b>${Ec.fmt(v)}</b></div>`).join('');
}
function financeTabs(active) {
  const tabs = [['overview', 'ภาพรวม'], ['shop', 'ร้านค้า'], ['quests', 'ระดมทรัพยากร']];
  return `<div class="tabs">${tabs.map(([k, th]) => `<button class="tab ${k === active.split(':')[0] ? 'on' : ''}" data-act="finance" data-arg="${k}">${th}</button>`).join('')}</div>`;
}
function financeModal(tab = 'overview') {
  const e = Ec.econ();
  let body = '';
  if (tab === 'overview') {
    const dons = e.donations.map(d => `<li>${Ec.fmt(d.amount)} บาท · เพื่อ${Ec.PURPOSE_TH[d.purpose]} <span class="tiny">(${esc(d.from)})</span></li>`).join('');
    const caps = e.capital.filter(c => !c.used).map(c => `<li>${esc(Ec.ITEM[c.item].th)} · ${c.ready ? 'ได้รับจัดสรรแล้ว พร้อมใช้' : `รอการจัดสรร (เมื่อผ่านครบ ${c.readyAfter} ด่าน)`}</li>`).join('');
    body = `
      ${e.crisis ? `<div class="crisis-box"><b>โรงเรียนอยู่ในภาวะวิกฤตทางการเงิน</b><p class="small">เงินรายหัวรวมกับเงินรายได้ต่ำกว่า ${Ec.fmt(Ec.crisisLine())} บาท นักเรียนจะลดลงทุกภาคเรียน ตัวชี้วัดเก่ง ดี มีสุข ลดลง 15 คะแนน ทางออกคือทำเควสระดมทรัพยากรอย่างถูกระเบียบ และชะลอการซื้อ</p></div>` : ''}
      <div class="fin-top">
        <div><b>${Ec.fmt(e.students)}</b><span>นักเรียน (${Ec.sizeLabel()})</span></div>
        <div><b>${Ec.fmt(e.capacity)}</b><span>ความจุของอาคาร</span></div>
        <div><b>${1 + (e.land || 0)} แปลง</b><span>พื้นที่โรงเรียน (ขยายได้อีก ${Ec.LAND_MAX - (e.land || 0)})</span></div>
        <div><b>${Ec.fmt(e.lostToMisuse)}</b><span>เงินที่เสียจากการใช้ผิดประเภท</span></div>
      </div>
      <h3>เงินแต่ละประเภท (บาทในเกม)</h3>
      <div class="wallets">${walletRows()}</div>
      <p class="tiny">ทุกครั้งที่ผ่านด่านเป็นครั้งแรก โรงเรียนได้รับงบรอบภาคเรียนตามจำนวนนักเรียน และหักค่าสาธารณูปโภคกับค่าจ้างชั่วคราวจากเงินรายหัว ตัวเลขเหล่านี้กำหนดขึ้นเพื่อการเล่น ไม่ใช่อัตราจริง เงินของนักเรียน (ค่าหนังสือ อุปกรณ์ เครื่องแบบ ปัจจัยพื้นฐาน) แสดงไว้เพื่อให้เห็นว่ามีอยู่ แต่นำมาใช้ซื้อของให้โรงเรียนไม่ได้</p>
      ${dons ? `<h3>เงินบริจาคที่ระบุวัตถุประสงค์</h3><ul class="tight">${dons}</ul>` : ''}
      ${caps ? `<h3>งบลงทุน</h3><ul class="tight">${caps}</ul>` : ''}
      <h3>ความเคลื่อนไหวล่าสุด</h3>
      ${e.log.length ? `<ul class="log">${e.log.slice(0, 10).map(l => `<li>${esc(l.text)}${l.amount ? ` <b class="${l.amount < 0 ? 'neg' : 'pos'}">${l.amount > 0 ? '+' : ''}${Ec.fmt(l.amount)}</b>` : ''}</li>`).join('')}</ul>` : '<p class="small">ยังไม่มีรายการ ผ่านด่านแรกเพื่อรับงบรอบภาคเรียน</p>'}`;
  } else if (tab === 'shop' || tab.startsWith('shop:')) {
    const grp = tab.includes(':') ? tab.split(':')[1] : 'building';
    const sub = `<div class="tabs sub">${Object.entries(Ec.SHOP_GROUPS).map(([k, th]) => `<button class="tab ${k === grp ? 'on' : ''}" data-act="finance" data-arg="shop:${k}">${th}</button>`).join('')}</div>`;
    body = `<p class="small">เลือกรายการ แล้วเลือกแหล่งเงิน หากแหล่งเงินขัดระเบียบ เงินจะถูกเรียกคืนและรายการจะไม่ได้รับการจัดหา หากยังยืนยันตัวบทไม่ได้ เกมจะไม่ตัดสินและไม่หักเงิน รายการที่ไม่มีเครื่องหมาย "ครั้งเดียว" ซื้อซ้ำได้</p>${sub}
      <div class="shop">${Ec.ITEMS.filter(it => it.group === grp).map(it => {
        const owned = it.oneTime !== false && it.facility && e.owned[it.facility];
        return `<button class="shop-item ${owned ? 'owned' : ''} ${it.locked ? 'locked' : ''}" data-act="buy" data-arg="${it.id}">
          <b>${esc(it.th)}</b><span class="small">${esc(it.desc)}</span>
          <span class="tags">${it.oneTime !== false ? '<span class="chip">ครั้งเดียว</span>' : '<span class="chip">ซื้อซ้ำได้</span>'}${['keng', 'dee', 'suk'].filter(k => it[k]).map(k => `<span class="chip">${{ keng: 'เก่ง', dee: 'ดี', suk: 'มีสุข' }[k]} +${it[k]}</span>`).join('')}</span>
          <span class="price">${owned ? 'มีแล้ว' : it.locked ? 'ยังเปิดซื้อไม่ได้' : Ec.fmt(it.price) + ' บาท'}</span></button>`;
      }).join('')}</div>`;
  } else {
    const qz = quizStats();
    body = `<div class="quiz-cta"><div><b>คำถามถูกหรือผิด</b><span class="small">ตอบถูกได้ ${Ec.fmt(QUIZ_REWARD)} บาทเข้าเงินรายได้สถานศึกษา · ตอบแล้ว ${qz.done}/${QUIZ.length} ข้อ ถูก ${qz.correct} ข้อ</span></div><button class="btn primary" data-act="quiz">ตอบคำถาม</button></div>
      <p class="small">หาเงินเข้าโรงเรียนโดยไม่ผลักภาระให้ผู้ปกครอง แต่ละเควสทำได้ช่วงละ 1 ครั้ง หากตัดสินใจขัดระเบียบจะไม่ได้รับเงิน</p>
      <div class="shop">${Ec.QUESTS.map(q => {
        const a = Ec.questAvailable(q);
        const rw = q.landQuest ? `ที่ดิน 1 แปลง · ความจุ +${Ec.LAND_CAP} คน (มีแล้ว ${Ec.econ().land}/${Ec.LAND_MAX})` : q.capitalQuest ? 'งบลงทุนเป็นรายการ' : q.reward.wallet ? `สูงสุด ${Ec.fmt(q.reward.amount)} บาท` : 'ขวัญกำลังใจครู';
        return `<button class="shop-item ${a.ok ? '' : 'locked'}" data-act="quest" data-arg="${q.id}"><b>${esc(q.th)}</b>
          <span class="small">ผู้เสนอ: ${esc(CHARACTERS[q.by].name)}</span><span class="price">${a.ok ? rw : esc(a.why)}</span></button>`;
      }).join('')}</div>`;
  }
  openModal(`<h2>งบประมาณโรงเรียน</h2>${financeTabs(tab)}${body}`, { wide: true });
}
function buyModal(id) {
  const it = Ec.ITEM[id], e = Ec.econ();
  if (it.oneTime !== false && it.facility && e.owned[it.facility]) return toast('โรงเรียนมีรายการนี้แล้ว');
  if (it.locked) return openModal(`<h2>${esc(it.th)}</h2><div class="fb undetermined"><p>${esc(it.lockNote)}</p>
    <p class="small">แหล่งอ้างอิง: <a href="${Ec.SRC.capital2560}" target="_blank" rel="noopener">คู่มือการจัดตั้งงบลงทุน สพฐ. 2560</a> · <a href="${Ec.SRC.vehicle}" target="_blank" rel="noopener">สรุประเบียบรถราชการ</a></p></div>
    <div class="btn-row"><button class="btn" data-act="finance" data-arg="shop">กลับร้านค้า</button></div>`, { wide: true });
  const srcs = ['perhead', 'income', 'activity', 'donation', 'capital', 'student'];
  openModal(`<h2>${esc(it.th)}</h2><p>${esc(it.desc)} · ราคา <b>${Ec.fmt(it.price)}</b> บาท</p>
    <h3>จะใช้เงินประเภทใด</h3>
    <div class="srcs">${srcs.map(k => `<button class="src" data-src="${k}" style="--w:${Ec.WALLETS[k].color}"><b>${Ec.WALLETS[k].th}</b><span>คงเหลือ ${Ec.fmt(Ec.balance(k, k === 'capital' ? id : undefined))} บาท</span></button>`).join('')}</div>
    <div id="buy-res"></div>
    <div class="btn-row"><button class="btn ghost" data-act="finance" data-arg="shop:${it.group}">กลับร้านค้า</button></div>`, { wide: true });
  showReader('tonkla', 'ก่อนจัดซื้อ ต้องตรวจว่าเงินประเภทนี้ใช้กับรายการนี้ได้ และรายการต้องอยู่ในแผนปฏิบัติการที่คณะกรรมการสถานศึกษาเห็นชอบแล้วครับ', true);
  $('#modal-body').querySelectorAll('.src').forEach(b => b.addEventListener('click', () => {
    const r = Ec.buy(id, b.dataset.src);
    const [cls, lab] = VERDICT[r.verdict] || ['unv', ''];
    const link = r.src ? ` (<a href="${r.src}" target="_blank" rel="noopener">แหล่งอ้างอิง</a>)` : '';
    let html = `<div class="fb ${cls === 'bad' ? 'illegal' : cls === 'ok' ? 'ok' : 'undetermined'}"><div class="fb-head"><span class="chip ${cls}">${lab}</span>${r.lost ? `<span class="chip bad">เสียเงิน ${Ec.fmt(r.lost)} บาท</span>` : ''}</div><p>${esc(r.why || '')}${link}</p>`;
    if (r.note) html += `<p class="small">${esc(r.note)}</p>`;
    if (r.ok) html += `<p class="small"><b>ขั้นตอนพัสดุที่ต้องทำต่อ:</b></p><ul class="tight small">${r.method.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;
    html += '</div>';
    $('#buy-res').innerHTML = html;
    if (r.ok) { Au.sfx.levelClear(); $('#modal-body').querySelectorAll('.src').forEach(x => x.disabled = true); toast(`จัดหา "${esc(it.th)}" แล้ว`, 'good'); }
    else if (r.verdict === 'bad') { Au.sfx.bad(); $('#modal-body').querySelectorAll('.src').forEach(x => x.disabled = true); }
    else Au.sfx.cmdMiss();
    refreshHUD(); grantAwards();
    const inCrisis = Ec.econ().crisis && (r.ok || r.verdict === 'bad');
    if (inCrisis) setTimeout(() => crisisModal(), 2200);
    else if (r.ok) {
      const key = it.facility || it.id;
      const fly = document.createElement('div'); fly.className = 'btn-row';
      fly.innerHTML = `<button class="btn primary" data-act="seeNew" data-arg="${key}">${it.facility ? 'ดูสิ่งที่จัดหาใหม่ในเมือง' : it.group === 'people' ? 'ดูบุคลากรใหม่ในเมือง' : 'ดูในเมือง (ใช้ในภาคเรียนนี้)'}</button><button class="btn" data-act="finance" data-arg="shop:${it.group}">กลับร้านค้า</button>`;
      $('#buy-res').appendChild(fly);
    }
    setTimeout(() => $('#buy-res')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }));
}
function questModal(id, step = 0, answers = []) {
  const q = Ec.QUEST[id];
  if (step === 0) { const a = Ec.questAvailable(q); if (!a.ok) return toast(a.why); }
  if (step >= q.steps.length) {
    const r = Ec.finishQuest(id, answers);
    if (r.factor) Au.sfx.levelClear(); else Au.sfx.levelFail();
    refreshHUD(); grantAwards();
    return openModal(`<h2>${esc(q.th)}</h2><div class="result ${r.factor ? 'pass' : 'fail'}">${esc(r.text)}</div>
      ${answers.map((a, i) => `<div class="fb ${a.v === 'bad' ? 'illegal' : a.v === 'ok' ? 'ok' : 'undetermined'}"><p class="small">ขั้นที่ ${i + 1}</p><p>${esc(a.t)}</p><p class="small">${esc(a.why)}${a.src ? ` (<a href="${a.src}" target="_blank" rel="noopener">แหล่งอ้างอิง</a>)` : ''}</p></div>`).join('')}
      <div class="btn-row">${q.landQuest && !r.bad ? `<button class="btn primary" data-act="seeNew" data-arg="${Ec.econ().land >= 2 ? 'land2' : 'expansion'}">ดูที่ดินใหม่ในเมือง</button>` : ''}<button class="btn ${q.landQuest && !r.bad ? '' : 'primary'}" data-act="finance" data-arg="overview">ดูงบประมาณ</button><button class="btn ghost" data-act="close">กลับเมือง</button></div>`, { wide: true });
  }
  const st = q.steps[step];
  openModal(`<h2>${esc(q.th)}</h2><div class="step-prog">${q.steps.map((_, k) => `<i class="${k < step ? 'done' : k === step ? 'cur' : ''}"></i>`).join('')}</div>
    <p>${esc(st.q)}</p><div class="opts">${st.opts.map((o, k) => `<button class="opt" data-k="${k}"><span class="opt-l">${THAI_LETTERS[k]}</span><span class="opt-t">${esc(o.t)}</span></button>`).join('')}</div>
    <div class="btn-row"><button class="btn ghost" data-act="finance" data-arg="quests">ยกเลิก</button></div>`, { wide: true });
  showReader(q.by, step === 0 ? 'ขอเสนอแนวทางหาทรัพยากรให้โรงเรียนครับ/ค่ะ ขอให้ท่านพิจารณา' : 'ขั้นต่อไปครับ/ค่ะ', step === 0);
  $('#modal-body').querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
    const o = st.opts[+b.dataset.k];
    (o.v === 'bad' ? Au.sfx.bad : Au.sfx.good)();
    questModal(id, step + 1, [...answers, o]);
  }));
}
function crisisModal() {
  const e = Ec.econ();
  if (!e.crisis) return;
  openModal(`<h2>ภาวะวิกฤตทางการเงิน</h2>
    <div class="crisis-box"><p>เงินรายหัวรวมกับเงินรายได้สถานศึกษาเหลือ ${Ec.fmt(Ec.usable())} บาท ต่ำกว่าระดับที่โรงเรียนต้องใช้ดำเนินงาน (${Ec.fmt(Ec.crisisLine())} บาท)</p>
    <ul class="tight small"><li>นักเรียนจะลดลงทุกภาคเรียนจนกว่าจะพ้นวิกฤต</li><li>ตัวชี้วัดเก่ง ดี มีสุข ลดลง 15 คะแนน</li><li>ท้องฟ้าในเมืองจะหม่นลง เพื่อเตือนให้เห็นสภาพของโรงเรียน</li></ul></div>
    <p class="small">ทางออก: ทำเควสระดมทรัพยากรอย่างถูกระเบียบ ชะลอการจัดซื้อที่ไม่จำเป็น และผ่านด่านถัดไปเพื่อรับงบรอบภาคเรียน ห้ามนำเงินของนักเรียนหรือเงินที่ผูกวัตถุประสงค์มาใช้แก้ปัญหา</p>
    <div class="btn-row"><button class="btn primary" data-act="finance" data-arg="quests">ไปที่เควสระดมทรัพยากร</button><button class="btn ghost" data-act="close">ปิด</button></div>`);
  Au.sfx.levelFail();
}

// ---------------- เยี่ยมโรงเรียน ----------------
let visiting = null;
function myVisitCode() {
  const m = Ec.meters();
  return Ec.encodeVisit(Ec.visitPayload({ e: St.totalExp(), r: St.rankFor().index, a: Aw.earnedCount(), l: St.completedCount(), m: [m.keng, m.dee, m.suk] }));
}
function recentVisits() { try { return JSON.parse(localStorage.getItem('banSuanVisits') || '[]'); } catch { return []; } }
function visitModal() {
  const code = myVisitCode(), link = gameUrl() + '?visit=' + code;
  const recent = recentVisits();
  openModal(`<h2>เยี่ยมโรงเรียนอื่น</h2>
    <p class="small">เกมนี้ไม่มีเซิร์ฟเวอร์กลาง การเยี่ยมโรงเรียนจึงใช้ลิงก์หรือรหัสที่ผู้เล่นแชร์ให้กัน ผู้เยี่ยมเห็นเมือง สิ่งก่อสร้าง จำนวนนักเรียน ระดับ และรางวัลแบบอ่านอย่างเดียว ไม่เห็นคำตอบหรือบันทึกสะท้อนคิด</p>
    <section class="card"><h3>ลิงก์โรงเรียนของท่าน</h3><textarea id="vs-link" rows="2" readonly>${esc(link)}</textarea>
      <div class="btn-row"><button class="btn primary" id="vs-copy">คัดลอกลิงก์</button>${navigator.share ? '<button class="btn" id="vs-share">แชร์ลิงก์</button>' : ''}</div></section>
    <section class="card"><h3>เยี่ยมโรงเรียนของเพื่อน</h3><textarea id="vs-in" rows="2" placeholder="วางลิงก์หรือรหัสโรงเรียนของเพื่อน"></textarea>
      <div class="btn-row"><button class="btn primary" id="vs-go">ไปเยี่ยม</button></div>
      ${recent.length ? `<p class="small">เคยเยี่ยมล่าสุด</p><div class="menu-grid">${recent.map((r, i) => `<button class="btn" data-recent="${i}">ผอ.${esc(r.n || 'ไม่ระบุชื่อ')} · ${Ec.fmt(r.s)} คน</button>`).join('')}</div>` : ''}</section>`);
  $('#vs-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); toast('คัดลอกลิงก์แล้ว'); } catch { $('#vs-link').select(); toast('เลือกข้อความแล้ว กดคัดลอกจากเครื่องได้เลย'); } });
  $('#vs-share')?.addEventListener('click', async () => { try { await navigator.share({ title: 'เยี่ยมโรงเรียนของฉันในเกมเส้นทางผู้บริหาร', url: link }); } catch {} });
  $('#vs-go').addEventListener('click', () => { try { enterVisit(Ec.decodeVisit($('#vs-in').value)); } catch (e) { toast('รหัสโรงเรียนไม่ถูกต้อง', 'bad'); } });
  $('#modal-body').querySelectorAll('[data-recent]').forEach(b => b.addEventListener('click', () => enterVisit(recent[+b.dataset.recent])));
}
function enterVisit(o) {
  visiting = o;
  try { const r = recentVisits().filter(x => JSON.stringify(x) !== JSON.stringify(o)); r.unshift(o); localStorage.setItem('banSuanVisits', JSON.stringify(r.slice(0, 6))); } catch {}
  closeModal(); closeSheet();
  document.body.classList.add('visiting');
  Sc.setFacilities(o.f); Sc.setLand(o.ld || 0); Sc.setEvents(o.ev || []); lastEvKey = null; Sc.setStudentCount(o.s); Sc.setCrisis(!!o.c); Sc.setTrophies(o.a || 0); Sc.setQuestMarkers([]);
  const rk = RANKS[o.r];
  const bar = $('#visitbar');
  bar.hidden = false;
  bar.innerHTML = `<div><b>กำลังเยี่ยม${esc(SCHOOL_NAME)} ของ ผอ.${esc(o.n || 'ไม่ระบุชื่อ')}</b>
    <span class="small">${rk ? esc(rk.th) + ' · ' : ''}${Ec.fmt(o.e || 0)} EXP · ผ่าน ${o.l || 0}/20 ด่าน · นักเรียน ${Ec.fmt(o.s)} คน (${Ec.sizeLabel(o.s)}) · รางวัล ${o.a || 0}${o.c ? ' · อยู่ในภาวะวิกฤต' : ''}</span>
    ${o.m ? `<span class="small">เก่ง ${o.m[0] ?? '–'} · ดี ${o.m[1] ?? '–'} · มีสุข ${o.m[2] ?? '–'}</span>` : ''}</div>
    <button class="btn sm primary" data-act="leaveVisit">กลับโรงเรียนของฉัน</button>`;
  Sc.resetView();
  Au.sfx.quest();
}
function leaveVisit() {
  visiting = null;
  document.body.classList.remove('visiting');
  $('#visitbar').hidden = true;
  if (location.search.includes('visit=')) history.replaceState(null, '', location.pathname);
  refreshHUD(); syncWorld();
  if (!St.hasSave()) showTitle();
}

// ---------------- ทำเนียบบุคลากร ----------------
function castModal(first = false) {
  const READY_SHORT = { R1: 'ความพร้อม R1', R2: 'ความพร้อม R2', R3: 'ความพร้อม R3', R4: 'ความพร้อม R4', ST: 'ผู้มีส่วนได้เสีย' };
  const card = id => {
    const c = CHARACTERS[id], b = BIOS[id];
    return `<div class="cast-card">
      <img src="${Sc.avatarImage(id)}" alt="">
      <div><b>${esc(c.name)}</b><span class="small">${esc(c.role)}</span>
        ${c.readiness ? `<span class="chip">${READY_SHORT[c.readiness]}</span>` : ''}
        <p class="small">${esc(b.bio)}</p>
        <p class="say">“${esc(b.hello)}”</p>
        ${id !== 'player' ? `<button class="btn sm" data-meet="${id}">ไปพบในเมือง</button>` : ''}</div></div>`;
  };
  const groups = Object.entries(BIO_GROUPS).map(([g, th]) => `<h3>${th}</h3><div class="cast">${Object.keys(BIOS).filter(id => BIOS[id].group === g && id !== 'player').map(card).join('')}</div>`).join('');
  openModal(`<h2>${first ? 'ทำความรู้จักบุคลากรของโรงเรียน' : 'ทำเนียบบุคลากร'}</h2>
    <p class="small">ตัวละครทุกคนเป็นบุคคลสมมติ ระดับความพร้อม (R1–R4) อาจเปลี่ยนไปตามวิธีที่ท่านทำงานกับแต่ละคน และบางคนจะอยู่ในระดับต่างจากปกติเมื่อเกิดภาวะวิกฤต</p>
    <div class="cast me">${card('player')}</div>
    ${groups}
    <div class="btn-row"><button class="btn primary" id="cast-ok">${first ? 'รับทราบ และอ่านกติกาการเล่น' : 'ปิด'}</button></div>`, { wide: true });
  $('#cast-ok').addEventListener('click', () => { if (first) showRules(true); else closeModal(); });
  $('#modal-body').querySelectorAll('[data-meet]').forEach(b => b.addEventListener('click', () => { closeModal(); Sc.flyToChar(b.dataset.meet); openChar(b.dataset.meet); }));
}

// ---------------- ป๊อปอัปคำถามถูกหรือผิด ----------------
const QUIZ_REWARD = 8000;
const QUIZ_GAP = 75000;   // เว้นระยะระหว่างลูกโป่งคำถาม (มิลลิวินาที)
const QUIZ_HOSTS = ['prasert', 'malee', 'tonkla', 'arun', 'wilai', 'somsak', 'boonmee', 'guidance', 'pe', 'fah'];
const AREA_TH = { budget: 'งบประมาณและพัสดุ', personnel: 'งานบุคคล', general: 'การบริหารทั่วไป', academic: 'วิชาการและภาวะผู้นำ' };
function quizState() { return (St.S.quiz ||= { answered: {}, correct: 0, wrong: 0, next: Date.now() + 25000, host: null }); }
function quizStats() { const q = quizState(); return { done: Object.keys(q.answered).length, correct: q.correct }; }
function pickQuiz() {
  const q = quizState();
  let pool = QUIZ.filter(x => !(x.id in q.answered));
  if (!pool.length) { q.answered = {}; pool = QUIZ.slice(); }     // ครบทุกข้อแล้ว เริ่มรอบใหม่
  return pool[Math.floor(Math.random() * pool.length)];
}
function quizTick() {
  if (visiting || !St.S.startedAt || !St.S.seenRules) return;
  if ($('#modal').classList.contains('show') || !$('#intro').hidden) return;
  const q = quizState();
  if (q.host) { Sc.setQuizBalloon(q.host, () => quizModal(q.host)); return; }
  if (Date.now() < q.next) return;
  q.host = QUIZ_HOSTS[Math.floor(Math.random() * QUIZ_HOSTS.length)];
  St.save();
  Sc.setQuizBalloon(q.host, () => quizModal(q.host));
  Au.sfx.quest();
  toast(`${esc(CHARACTERS[q.host].name)} มีคำถามมาให้ท่าน แตะลูกโป่ง <b>?</b> ตอบถูกได้เงินเข้าโรงเรียน`);
}
function quizModal(host) {
  const st = quizState();
  host = host || st.host || QUIZ_HOSTS[0];
  const item = pickQuiz();
  openModal(`<div class="quiz">
      <span class="chip">${AREA_TH[item.area]}</span>
      <h2>ถูกหรือผิด</h2>
      <p class="quiz-q">${esc(item.q)}</p>
      <div class="tf"><button class="btn tf-btn t" data-a="1">ถูก</button><button class="btn tf-btn f" data-a="0">ผิด</button></div>
      <div id="quiz-res"></div>
      <p class="tiny">ตอบถูกได้ ${Ec.fmt(QUIZ_REWARD)} บาทเข้าเงินรายได้สถานศึกษา (บาทในเกม) ตอบผิดไม่เสียเงิน แต่จะได้อ่านคำอธิบายพร้อมแหล่งอ้างอิง</p>
    </div>`);
  showReader(host, 'ท่านผู้อำนวยการ ข้อความนี้ถูกหรือผิดครับ/คะ', true);
  $('#modal-body').querySelectorAll('.tf-btn').forEach(b => b.addEventListener('click', () => {
    const ans = b.dataset.a === '1', ok = ans === item.a;
    st.answered[item.id] = ok;
    if (ok) { st.correct++; Ec.econ().wallets.income += QUIZ_REWARD; Ec.econ().log.unshift({ t: Date.now(), text: 'รางวัลตอบคำถามถูก', amount: QUIZ_REWARD }); Ec.checkCrisis(); }
    else st.wrong++;
    st.host = null; st.next = Date.now() + QUIZ_GAP;
    Sc.setQuizBalloon(null);
    St.save(); refreshHUD(); grantAwards();
    (ok ? Au.sfx.exp : Au.sfx.bad)();
    $('#modal-body').querySelectorAll('.tf-btn').forEach(x => { x.disabled = true; x.classList.toggle('chosen', x === b); });
    $('#quiz-res').innerHTML = `<div class="fb ${ok ? 'ok' : 'illegal'}">
      <div class="fb-head"><span class="chip ${ok ? 'ok' : 'bad'}">${ok ? 'ตอบถูก' : 'ยังไม่ถูก'}</span><span class="chip">ข้อความนี้${item.a ? 'ถูก' : 'ผิด'}</span>${ok ? `<span class="chip exp">+${Ec.fmt(QUIZ_REWARD)} บาท</span>` : ''}</div>
      <p>${esc(item.why)}</p>
      <p class="small">แหล่งอ้างอิง: <a href="${item.src}" target="_blank" rel="noopener">${esc(item.srcName || 'เปิดแหล่งอ้างอิง')}</a>${item.conf === 'secondary' ? ' (แหล่งรอง)' : ''}</p></div>
      <div class="btn-row"><button class="btn primary" data-act="quiz">ข้อถัดไป</button><button class="btn ghost" data-act="close">กลับเมือง</button></div>`;
  }));
}
