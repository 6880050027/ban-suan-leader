// เพลงประกอบและเสียงเอฟเฟกต์ สังเคราะห์ด้วย Web Audio API ทั้งหมด (ไม่ใช้ไฟล์เสียงภายนอก จึงไม่มีปัญหาลิขสิทธิ์)
const KEY = 'banSuanAudio.v1';
let settings = { music: true, sfx: true, vol: 0.7 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

let ctx = null, master, musicBus, sfxBus, reverb;
let started = false, timer = null, nextTime = 0, step = 0, duck = 1;

function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} }
export function getSettings() { return { ...settings }; }

function makeReverb() {
  const len = Math.floor(ctx.sampleRate * 1.6);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = ctx.createConvolver(); conv.buffer = buf;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  conv.connect(wet); wet.connect(master);
  return conv;
}

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = settings.vol;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
  master.connect(comp); comp.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = settings.music ? 0.32 : 0;
  sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx ? 0.9 : 0;
  musicBus.connect(master); sfxBus.connect(master);
  reverb = makeReverb();
  musicBus.connect(reverb);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
  return true;
}

// เรียกเมื่อผู้ใช้แตะครั้งแรก (เบราว์เซอร์ไม่ให้เล่นเสียงก่อนมีการโต้ตอบ)
export function unlock() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (!started) { started = true; startMusic(); }
}

export function setMusic(on) {
  settings.music = on; saveSettings();
  if (!ensure()) return;
  musicBus.gain.setTargetAtTime(on ? 0.32 * duck : 0, ctx.currentTime, 0.3);
}
export function setSfx(on) {
  settings.sfx = on; saveSettings();
  if (!ensure()) return;
  sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
}
export function setVolume(v) {
  settings.vol = v; saveSettings();
  if (!ensure()) return;
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}
// ลดเสียงเพลงลงเวลาอ่านสถานการณ์ เพื่อให้มีสมาธิ
export function setDuck(on) {
  duck = on ? 0.45 : 1;
  if (!ctx || !settings.music) return;
  musicBus.gain.setTargetAtTime(0.32 * duck, ctx.currentTime, 0.6);
}

// ---------- เครื่องดนตรีสังเคราะห์ ----------
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function marimba(t, midi, vel = 0.5, bus = musicBus, dur = 0.9) {
  const f = mtof(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  g.connect(bus);
  const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4.01;
  const g2 = ctx.createGain(); g2.gain.setValueAtTime(vel * 0.25, t); g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
  o1.connect(g); o2.connect(g2); g2.connect(bus);
  o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + 0.2);
}
function pad(t, midis, dur, vel = 0.07) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.9);
  g.gain.setValueAtTime(vel, t + dur - 0.6);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.4);
  lp.connect(g); g.connect(musicBus);
  for (const m of midis) for (const det of [-6, 6]) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(t + dur + 0.5);
  }
}
function bass(t, midi, dur = 0.5, vel = 0.22) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
}
function shaker(t, vel = 0.03) {
  const len = ctx.sampleRate * 0.06;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
  const g = ctx.createGain(); g.gain.value = vel;
  s.connect(hp); hp.connect(g); g.connect(musicBus); s.start(t);
}

// ---------- เพลงประกอบ: ลูปอบอุ่นแบบเมืองเล็ก จังหวะสบาย ----------
// คอร์ด Cmaj7 – Am7 – Fmaj7 – G6 (คอร์ดละ 2 ห้อง) ทำนองสุ่มจากสเกลเพนทาโทนิก จึงไม่ซ้ำทุกรอบ
const BPM = 84;
const CHORDS = [
  { root: 48, pad: [60, 64, 67, 71] },
  { root: 45, pad: [57, 60, 64, 67] },
  { root: 41, pad: [57, 60, 64, 65] },
  { root: 43, pad: [59, 62, 64, 67] },
];
const PENTA = [72, 74, 76, 79, 81, 84];
let melodyIdx = 2;

function startMusic() {
  nextTime = ctx.currentTime + 0.2; step = 0;
  timer = setInterval(schedule, 60);
}
function schedule() {
  const eighth = 60 / BPM / 2;
  while (nextTime < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 8);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const pos = step % 8;
    if (step % 16 === 0) pad(nextTime, chord.pad, eighth * 16);
    if (pos === 0) bass(nextTime, chord.root, eighth * 3);
    if (pos === 4) bass(nextTime, chord.root + 7, eighth * 2, 0.15);
    if (pos % 2 === 1) shaker(nextTime, pos === 3 || pos === 7 ? 0.035 : 0.02);
    // ทำนอง: เดินทีละขั้นในสเกล มีช่วงเงียบให้หายใจ
    const phrase = Math.floor(step / 32) % 2;
    const play = phrase === 0 ? [0, 2, 3, 5, 6].includes(pos) : [0, 3, 4].includes(pos);
    if (play && Math.random() < 0.82) {
      melodyIdx = Math.max(0, Math.min(PENTA.length - 1, melodyIdx + [-1, -1, 0, 1, 1, 2, -2][Math.floor(Math.random() * 7)]));
      marimba(nextTime, PENTA[melodyIdx], 0.16 + Math.random() * 0.06);
      if (pos === 0 && Math.random() < 0.4) marimba(nextTime, PENTA[melodyIdx] - 12, 0.08);
    }
    nextTime += eighth; step++;
  }
}

// ---------- เสียงเอฟเฟกต์ ----------
function blip(freq, t, { type = 'sine', dur = 0.12, vel = 0.25, slide = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
function ready() { if (!settings.sfx) return false; unlock(); return !!ctx; }

export const sfx = {
  // แตะปุ่มทั่วไป: เสียงป๊อกนุ่ม ๆ
  click() { if (!ready()) return; blip(660, ctx.currentTime, { dur: 0.06, vel: 0.12, slide: 0.7 }); },
  // เลือกตัวเลือก
  select() { if (!ready()) return; const t = ctx.currentTime; blip(520, t, { dur: 0.08, vel: 0.16 }); blip(780, t + 0.05, { dur: 0.1, vel: 0.12 }); },
  // ตัวเลือกไม่ขัดระเบียบ: กริ่งสองโน้ตขึ้น
  good() { if (!ready()) return; const t = ctx.currentTime; marimba(t, 76, 0.32, sfxBus, 0.5); marimba(t + 0.09, 83, 0.32, sfxBus, 0.7); },
  // ขัดระเบียบ: เสียงต่ำลง ไม่ดุ
  bad() { if (!ready()) return; const t = ctx.currentTime; blip(330, t, { type: 'triangle', dur: 0.22, vel: 0.22, slide: 0.75 }); blip(247, t + 0.14, { type: 'triangle', dur: 0.32, vel: 0.2, slide: 0.8 }); },
  // ได้ EXP
  exp() { if (!ready()) return; const t = ctx.currentTime; [88, 91, 96].forEach((m, i) => marimba(t + i * 0.05, m, 0.14, sfxBus, 0.35)); },
  // เปิดหน้าต่าง/แผงตัวละคร
  open() { if (!ready()) return; blip(440, ctx.currentTime, { dur: 0.16, vel: 0.08, slide: 1.5 }); },
  close() { if (!ready()) return; blip(560, ctx.currentTime, { dur: 0.12, vel: 0.06, slide: 0.6 }); },
  // คำสั่งเข้ากับความพร้อม / ไม่เข้ากัน
  cmdFit() { if (!ready()) return; const t = ctx.currentTime; [72, 76, 79].forEach((m, i) => marimba(t + i * 0.07, m, 0.26, sfxBus, 0.6)); },
  cmdMiss() { if (!ready()) return; const t = ctx.currentTime; marimba(t, 67, 0.22, sfxBus, 0.5); marimba(t + 0.12, 66, 0.2, sfxBus, 0.6); },
  // ผ่านด่าน
  levelClear() { if (!ready()) return; const t = ctx.currentTime; [72, 76, 79, 84].forEach((m, i) => marimba(t + i * 0.1, m, 0.3, sfxBus, 0.8)); marimba(t + 0.4, 88, 0.22, sfxBus, 1.4); },
  levelFail() { if (!ready()) return; const t = ctx.currentTime; [72, 71, 67].forEach((m, i) => marimba(t + i * 0.16, m, 0.22, sfxBus, 0.7)); },
  // เลื่อนระดับ: แฟนแฟร์สั้น
  rankUp() {
    if (!ready()) return; const t = ctx.currentTime;
    [60, 64, 67, 72].forEach((m, i) => { marimba(t + i * 0.09, m + 12, 0.3, sfxBus, 0.9); blip(mtof(m), t + i * 0.09, { type: 'triangle', dur: 0.4, vel: 0.08 }); });
    [72, 76, 79].forEach(m => marimba(t + 0.45, m + 12, 0.22, sfxBus, 1.6));
  },
  // ปลดล็อกช่วงใหม่: เสียงกุญแจกริ๊งแล้วไล่ขึ้น
  unlock() {
    if (!ready()) return; const t = ctx.currentTime;
    blip(1800, t, { type: 'square', dur: 0.03, vel: 0.05 }); blip(2400, t + 0.04, { type: 'square', dur: 0.03, vel: 0.05 });
    [79, 84, 88, 91, 96].forEach((m, i) => marimba(t + 0.1 + i * 0.06, m, 0.2, sfxBus, 0.9));
  },
  // เปิดหน้าเอกสาร (ฉากเปิด/อ่านภารกิจ): เสียงกระดาษพลิกเบา ๆ
  page() {
    if (!ready()) return; const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.18);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.12;
    src.connect(bp); bp.connect(g); g.connect(sfxBus); src.start(t);
  },
  // ได้รับรางวัล: กริ่งระยิบระยับ
  award() { if (!ready()) return; const t = ctx.currentTime; [84, 88, 91, 96, 100].forEach((m, i) => marimba(t + i * 0.07, m, 0.22, sfxBus, 1.1)); },
  // ถ่ายภาพ: เสียงชัตเตอร์
  shutter() { if (!ready()) return; const t = ctx.currentTime; blip(1200, t, { type: 'square', dur: 0.03, vel: 0.08 }); blip(700, t + 0.05, { type: 'square', dur: 0.05, vel: 0.06 }); },
  // แจ้งเตือนเควสใหม่
  quest() { if (!ready()) return; const t = ctx.currentTime; marimba(t, 84, 0.2, sfxBus, 0.4); marimba(t + 0.12, 91, 0.2, sfxBus, 0.6); },
};
