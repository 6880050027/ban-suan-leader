// หน้าจอ ภารกิจ การสั่งงานตัวละคร สมุดผู้นำ และการบันทึก
import { LEVELS } from './data/levels.js';
import {
  AREAS, TIERS, TAGS, COMMANDS, READINESS_TH, CHARACTERS, COMMAND_TASKS, COMMAND_REACTIONS,
  PASS_RATIO, RANKS, COMMON_ADVICE, VALIDITY_NOTE, TEACHER_VIEW, SCHOOL_NAME, AREA_OFFICE, REF, COMMAND_EXP,
} from './data/world.js';
import * as St from './state.js';
import * as Sc from './scene.js';
import * as Au from './audio.js';
import * as Aw from './awards.js';

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
  refreshSoundIcon();
  refreshHUD();
  if (St.hasSave()) { St.load(); refreshHUD(); syncWorld(); }
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
  skip: arg => { const t = St.tierOf(+arg).id; const before = t < 4 && St.tierOpen(t + 1); St.skipLevel(+arg); closeModal(); afterLevelChange(+arg, 0, before); toast(`ข้ามด่าน ${arg} แล้ว ด่านนี้ยังนับเป็นการผ่านเพื่อปลดล็อก และไม่กระทบสิทธิรับโปรไฟล์`); },
  fly: arg => { Sc.flyToChar(arg); openChar(arg); },
  title: () => showTitle(),
  sound: () => soundModal(),
  hall: () => hallModal(),
  share: () => shareModal(),
  menu: () => menuModal(),
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
  const m = St.schoolMeters();
  for (const k of ['keng', 'dee', 'suk']) {
    const v = m[k];
    $(`#m-${k} .bar i`).style.width = (v ?? 0) + '%';
    $(`#m-${k} b`).textContent = v == null ? '–' : v;
  }
  $('#hud-progress').textContent = `${St.completedCount()}/20 ด่าน`;
  Sc.setPlayerScale(r.scale);
  Sc.setTrophies(Aw.earnedCount());
  for (const id of Object.keys(CHARACTERS)) if (CHARACTERS[id].readiness && id !== 'player') Sc.setMood(id, St.S.chars[id].morale);
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
  const go = () => { St.newGame($('#ng-name').value.trim()); refreshHUD(); syncWorld(); closeModal(); playIntro(() => showRules(true)); };
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
          <li>สรุปบทเรียนท้ายด่าน ด่านจะผ่านเมื่อได้ EXP ไม่น้อยกว่าร้อยละ ${Math.round(PASS_RATIO * 100)} และเมื่อผ่านครบ 5 ด่าน ช่วงถัดไปจะเปิดให้เล่น</li>
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
  const map = { open: 'พร้อมเล่น', inprogress: 'กำลังเล่น', passed: 'ผ่านแล้ว', failed: 'ยังไม่ผ่าน', skipped: 'ข้ามแล้ว', locked: 'ล็อก' };
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
          <div class="q-meta"><span class="area-dot"></span>${A.th} · <span class="dots" title="ความยาก">${DIFF_DOTS(L.difficulty)}</span> ${L.difficultyTh} · ${L.steps.length} ขั้น · ${best}</div></div>
        <div class="q-side">${statusChip(id)}${btn}</div></div>`;
    }).join('');
    return `<section class="tier ${open ? '' : 'locked'}"><h3>${t.th} ${open ? '' : '<span class="chip">ผ่านช่วงก่อนหน้าให้ครบเพื่อปลดล็อก</span>'}</h3>${rows}</section>`;
  }).join('');
  openModal(`<h2>ภารกิจ 20 ด่าน</h2>
    <p class="small">งาน 4 ด้านวนสลับกัน ด้านละ 5 ด่าน ภายในช่วงเดียวกันเลือกเล่นด่านไหนก่อนก็ได้</p>
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
  const pre = St.lv(L.id).reflectionBefore;
  activeLevel = null; syncWorld(); refreshHUD();
  const afterRank = St.rankFor();
  (res.passed ? Au.sfx.levelClear : Au.sfx.levelFail)();
  openModal(`<div class="lv-head" style="--area:${AREAS[L.area].color}"><span class="chip area">${AREAS[L.area].th}</span><h2>สรุปด่าน ${L.id} · ${esc(L.title)}</h2></div>
    <div class="kolb"><span>ประสบการณ์ตรง</span><span class="on">สังเกตและสะท้อนคิด</span><span class="on">สร้างความคิดรวบยอด</span><span class="on">ทดลองปฏิบัติ</span></div>
    <div class="result ${res.passed ? 'pass' : 'fail'}"><b>${res.exp}</b> / ${res.max} EXP · ${res.passed ? 'ผ่านด่าน' : `ยังไม่ผ่าน (ต้องได้ ${Math.ceil(res.max * PASS_RATIO)})`}</div>
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
    body = `<p class="small">${esc(c.role)}</p>
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
  if (id.startsWith('student')) return toast('นักเรียนกำลังทำกิจกรรมในสนาม ทุกการตัดสินใจของท่านส่งผลถึงนักเรียนในท้ายที่สุด');
  Sc.flyToChar(id); openChar(id);
}
export function onBuildingClick(id) {
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
      <button class="btn" data-act="rules">กติกาและผลที่ได้รับ</button>
      <button class="btn" data-act="intro">ชมประวัติโรงเรียน</button>
      <button class="btn" data-act="sound">ตั้งค่าเสียง</button>
      <button class="btn" data-act="save">บันทึกและรหัสสำรอง</button>
      <button class="btn" data-act="title">กลับหน้าแรก</button>
    </div>`);
}

// ---------------- ถ่ายภาพและแชร์ ----------------
function gameUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
async function makeShareCard() {
  closeSheet();
  await (document.fonts?.ready || Promise.resolve());
  const shot = new Image();
  shot.src = Sc.snapshot(true);
  await shot.decode().catch(() => {});
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
  const r = St.rankFor(), m = St.schoolMeters(), aw = Aw.earnedCount();
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#3A2E28'; g.font = '500 58px Mitr, sans-serif'; g.fillText(SCHOOL_NAME, 60, 930);
  g.fillStyle = '#6B5A4E'; g.font = '400 34px Sarabun, sans-serif';
  g.fillText(`${St.S.playerName ? 'ผอ.' + St.S.playerName + ' · ' : ''}${r.th}`, 60, 982);
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
async function shareModal() {
  closeModal();
  Au.sfx.shutter();
  $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go');
  const c = await makeShareCard();
  const url = c.toDataURL('image/png');
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const file = new File([blob], 'ban-suan-school.png', { type: 'image/png' });
  const canFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const text = `โรงเรียนของฉันในเกมเส้นทางผู้บริหาร: ${St.rankFor().th} · ${St.totalExp()} EXP · ผ่าน ${St.completedCount()}/20 ด่าน`;
  openModal(`<h2>แชร์ภาพโรงเรียน</h2>
    <img class="share-img" src="${url}" alt="ภาพโรงเรียนของท่านพร้อมระดับ EXP และรางวัล">
    <div class="btn-row">
      ${canFile ? `<button class="btn primary" id="sh-native">แชร์ไปยังแอป (Facebook, Instagram, LINE)</button>` : ''}
      <a class="btn ${canFile ? '' : 'primary'}" id="sh-dl" href="${url}" download="ban-suan-school.png">บันทึกภาพลงเครื่อง</a>
      <button class="btn" id="sh-fb">แชร์ลิงก์เกมทาง Facebook</button>
      <button class="btn" id="sh-line">แชร์ลิงก์เกมทาง LINE</button>
      <button class="btn ghost" id="sh-copy">คัดลอกข้อความ</button>
    </div>
    <p class="small">${canFile ? 'ปุ่มแรกเปิดเมนูแชร์ของเครื่อง เลือก Facebook, Instagram หรือ LINE ได้' : 'บนคอมพิวเตอร์ ให้บันทึกภาพลงเครื่องก่อน แล้วอัปโหลดไปยังสื่อสังคมออนไลน์'} ส่วนปุ่ม Facebook และ LINE จะแชร์ลิงก์เกม เพราะสองช่องทางนี้ไม่รับไฟล์ภาพจากเว็บโดยตรง สำหรับ Instagram ให้บันทึกภาพแล้วโพสต์จากแอป</p>`, { wide: true });
  $('#sh-native')?.addEventListener('click', async () => { try { await navigator.share({ files: [file], title: 'เส้นทางผู้บริหาร เมืองบ้านสวน', text: text + ' ' + gameUrl() }); } catch {} });
  $('#sh-fb').addEventListener('click', () => window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(gameUrl()), '_blank', 'noopener'));
  $('#sh-line').addEventListener('click', () => window.open('https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(gameUrl()), '_blank', 'noopener'));
  $('#sh-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(text + ' ' + gameUrl()); toast('คัดลอกข้อความแล้ว'); } catch { toast('คัดลอกไม่สำเร็จ'); } });
}
