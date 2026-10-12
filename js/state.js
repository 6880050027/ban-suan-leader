// สถานะเกม การบันทึก และการคำนวณคะแนน/โปรไฟล์
import { LEVELS } from './data/levels.js';
import { TIERS, COMMAND_TASKS, FIT_BY_READINESS, PASS_RATIO, COMMAND_EXP, RANKS, CHARACTERS, PROFILES } from './data/world.js';

const KEY = 'banSuanLeaderSave.v1';
export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map(l => [l.id, l]));

function freshState(name = '') {
  const chars = {};
  for (const id of Object.keys(CHARACTERS)) chars[id] = { credits: 0, morale: 70, log: [] };
  return {
    v: 1, playerName: name, startedAt: Date.now(), updatedAt: Date.now(),
    levels: {},           // id -> { status, bestExp, record, attempt, reflectionBefore, lesson }
    chars,
    debrief: {},          // mid / final -> {q1,q2,q3,p,i,e}
    seenRules: false,
  };
}

export let S = freshState();

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    S = migrate(JSON.parse(raw));
    return true;
  } catch { return false; }
}
export function save() {
  S.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch { return false; }
}
export function newGame(name) { S = freshState(name); save(); }
export function resetAll() { try { localStorage.removeItem(KEY); } catch {} S = freshState(); }

function migrate(o) {
  const base = freshState(o.playerName || '');
  const out = Object.assign(base, o);
  for (const id of Object.keys(CHARACTERS)) if (!out.chars[id]) out.chars[id] = { credits: 0, morale: 70, log: [] };
  return out;
}

// ---- รหัสสำรอง (export/import) ----
export function exportCode() {
  const json = JSON.stringify(S);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return 'BSV1.' + btoa(bin);
}
export function importCode(code) {
  code = (code || '').trim();
  let json;
  if (code.startsWith('{')) json = code; // ไฟล์ .json
  else {
    const b64 = code.replace(/^BSV1\./, '').replace(/\s+/g, '');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    json = new TextDecoder().decode(bytes);
  }
  const o = JSON.parse(json);
  if (!o || o.v !== 1 || typeof o.levels !== 'object') throw new Error('รูปแบบรหัสไม่ถูกต้อง');
  S = migrate(o);
  save();
}

// ---- ด่าน ----
export function tierOf(id) { return TIERS.find(t => t.levels.includes(id)); }
export function levelDone(id) { const st = S.levels[id]?.status; return st === 'passed' || st === 'skipped'; }
export function tierOpen(tierId) {
  if (tierId === 1) return true;
  const prev = TIERS.find(t => t.id === tierId - 1);
  return prev.levels.every(levelDone);
}
export function levelOpen(id) { return tierOpen(tierOf(id).id); }
export function maxExp(id) {
  const L = LEVEL_BY_ID[id];
  return L.steps.length * 30 + (COMMAND_TASKS[id]?.length || 0) * COMMAND_EXP.fit;
}
export function totalExp() {
  return Object.values(S.levels).reduce((a, l) => a + (l.bestExp || 0), 0);
}
export function rankFor(exp = totalExp()) {
  let r = RANKS[0], i = 0;
  RANKS.forEach((x, k) => { if (exp >= x.min) { r = x; i = k; } });
  const next = RANKS[i + 1];
  return { ...r, index: i, next };
}
export function lv(id) { return (S.levels[id] ||= { status: 'open', bestExp: 0 }); }

// readiness ของตัวละครในด่านนี้ (รวมการเติบโต)
export function taskReadiness(task) {
  let r = task.r;
  if (task.grow && (S.chars[task.c]?.credits || 0) >= task.grow.credits) r = task.grow.to;
  return r;
}
export function taskFit(task) {
  const r = taskReadiness(task);
  if (task.fit && r === task.r) return task.fit;
  return FIT_BY_READINESS[r];
}

export function startAttempt(id) {
  const l = lv(id);
  l.status = l.status === 'passed' ? 'passed' : 'inprogress';
  l.attempt = { step: 0, commands: {}, answers: [], order: shuffleOrders(id), phase: 'brief' };
  save();
  return l.attempt;
}
function shuffleOrders(id) {
  return LEVEL_BY_ID[id].steps.map(() => {
    const a = [0, 1, 2, 3, 4];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  });
}

const ORDER = ['direct', 'coach', 'support', 'delegate'];
export function judgeCommand(id, charId, cmd) {
  const task = (COMMAND_TASKS[id] || []).find(t => t.c === charId);
  if (!task) return null;
  const fit = taskFit(task);
  const readiness = taskReadiness(task);
  let result;
  if (cmd === fit) result = 'fit';
  else if (fit === 'consult' || cmd === 'consult') {
    // ปรึกษากับผู้ใต้บังคับบัญชาระดับ R3 ถือว่าใกล้เคียงสนับสนุน
    result = (cmd === 'consult' && fit === 'support') ? 'near' : 'miss';
  } else {
    const d = Math.abs(ORDER.indexOf(cmd) - ORDER.indexOf(fit));
    result = d === 1 ? 'near' : 'miss';
  }
  const direction = fit === 'consult' ? 'stake' : (ORDER.indexOf(cmd) < ORDER.indexOf(fit) ? 'over' : 'under');
  const att = lv(id).attempt;
  if (att && !att.commands[charId]) {
    att.commands[charId] = { cmd, fit, readiness, result };
    const ch = S.chars[charId];
    if (result === 'fit') { ch.morale = Math.min(100, ch.morale + 8); if (readiness === 'R1' || readiness === 'R2') ch.credits++; }
    else if (result === 'miss') ch.morale = Math.max(10, ch.morale - 10);
    else ch.morale = Math.max(10, ch.morale - 3);
    save();
  }
  return { task, fit, readiness, result, direction, first: att?.commands[charId]?.cmd === cmd };
}

export function answer(id, stepIdx, optIdx) {
  const att = lv(id).attempt;
  const opt = LEVEL_BY_ID[id].steps[stepIdx].options[optIdx];
  let a = att.answers[stepIdx];
  if (!a) {
    a = att.answers[stepIdx] = { first: optIdx, final: optIdx, retried: false, exp: opt.legal === 'illegal' ? 0 : opt.exp };
  } else if (!a.retried && LEVEL_BY_ID[id].steps[stepIdx].options[a.first].legal === 'illegal') {
    a.final = optIdx; a.retried = true;
    a.exp = opt.legal === 'illegal' ? 0 : Math.floor(opt.exp / 2);
  }
  save();
  return a;
}

export function attemptExp(id) {
  const att = lv(id).attempt;
  if (!att) return 0;
  const steps = att.answers.reduce((s, a) => s + (a?.exp || 0), 0);
  const cmds = Object.values(att.commands).reduce((s, c) => s + COMMAND_EXP[c.result], 0);
  return steps + cmds;
}

export function finishLevel(id, lesson = '') {
  const l = lv(id);
  const exp = attemptExp(id);
  const max = maxExp(id);
  const passed = exp >= Math.ceil(max * PASS_RATIO);
  l.record = { answers: l.attempt.answers.map(a => ({ first: a.first, final: a.final, retried: a.retried, exp: a.exp })), commands: l.attempt.commands, exp, at: Date.now() };
  l.bestExp = Math.max(l.bestExp || 0, exp);
  if (passed) l.status = 'passed'; else if (l.status !== 'passed') l.status = 'failed';
  if (lesson) l.lesson = lesson;
  l.attempt = null;
  save();
  return { exp, max, passed };
}
export function skipLevel(id) {
  const l = lv(id);
  l.status = l.status === 'passed' ? 'passed' : 'skipped';
  l.attempt = null; save();
}

export function addLog(charId, text) {
  const c = S.chars[charId]; if (!c) return;
  c.log.unshift({ t: Date.now(), text });
  if (c.log.length > 30) c.log.length = 30;
}

// ---- โปรไฟล์ (คะแนนเป็นสัดส่วนของโอกาส ตามส่วนที่ 5 ของรายงาน) ----
const STYLE_TAGS = ['วก', 'พค', 'ทศ', 'ปบ', 'รบ', 'กจ', 'นว', '⚠'];
function pts(opt, tag) { return opt.tags[0] === tag ? 2 : (opt.tags.includes(tag) ? 1 : 0); }

export function computeProfile() {
  const got = {}, opp = {};
  STYLE_TAGS.forEach(t => { got[t] = 0; opp[t] = 0; });
  let legalOpp = 0, legalOk = 0, steps = 0;
  const cmdCount = { direct: 0, coach: 0, support: 0, delegate: 0, consult: 0 };
  let cmdFit = 0, cmdTotal = 0, delegateUnready = 0;
  const byArea = {};
  const examples = {}; // tag -> [{lv, text}]
  for (const [idStr, l] of Object.entries(S.levels)) {
    if (!l.record) continue;
    const L = LEVEL_BY_ID[+idStr];
    (byArea[L.area] ||= { exp: 0, max: 0 });
    byArea[L.area].exp += l.record.exp; byArea[L.area].max += maxExp(+idStr);
    L.steps.forEach((st, i) => {
      const a = l.record.answers[i]; if (!a) return;
      steps++;
      const chosen = st.options[a.first];
      for (const t of STYLE_TAGS) {
        opp[t] += Math.max(...st.options.map(o => pts(o, t)));
        got[t] += pts(chosen, t);
      }
      if (st.options.some(o => o.legal === 'illegal')) { legalOpp++; if (chosen.legal !== 'illegal') legalOk++; }
      const t0 = chosen.tags[0];
      (examples[t0] ||= []).push({ lv: L.id, title: L.title, text: chosen.text });
    });
    for (const c of Object.values(l.record.commands || {})) {
      cmdTotal++; cmdCount[c.cmd]++;
      if (c.result === 'fit') cmdFit++;
      if (c.cmd === 'delegate' && (c.readiness === 'R1' || c.readiness === 'R2')) delegateUnready++;
    }
  }
  const pct = {};
  STYLE_TAGS.forEach(t => pct[t] = opp[t] ? Math.round(100 * got[t] / opp[t]) : null);
  const p = t => pct[t] ?? 0;
  const subCmd = cmdCount.direct + cmdCount.coach + cmdCount.support + cmdCount.delegate;
  const directShare = subCmd ? Math.round(100 * cmdCount.direct / subCmd) : 0;
  const shareSD = (cmdCount.support + cmdCount.delegate + cmdCount.consult);
  const distCmd = cmdTotal ? Math.round(100 * shareSD / cmdTotal) : 0;
  const axes = {
    A: { left: 'มุ่งวิชาการ', right: 'มุ่งบริหารจัดการ', l: Math.round((p('วก') + p('พค')) / 2), r: p('รบ') },
    B: { left: 'กระจายภาวะผู้นำ', right: 'สั่งการโดยตรง', l: Math.round((p('กจ') + distCmd) / 2), r: directShare },
    C: { left: 'เปลี่ยนสภาพ (Transformational)', right: 'แลกเปลี่ยน (Transactional)', l: Math.round((p('ปบ') + p('ทศ')) / 2), r: p('รบ'), separate: true },
    D: { left: 'นวัตกรรม', right: 'ยึดระเบียบ', l: p('นว'), r: p('รบ') },
  };
  const knowledge = legalOpp ? Math.round(100 * legalOk / legalOpp) : null;
  const fitScore = cmdTotal ? Math.round(100 * cmdFit / cmdTotal) : null;
  const flag = p('⚠');

  // เลือกโปรไฟล์ (เกณฑ์ตั้งต้นจากรายงาน ต้องปรับหลังทดลองนำร่อง)
  let key = 'mixed';
  const mainTags = ['วก', 'พค', 'ทศ', 'ปบ', 'รบ', 'กจ', 'นว'];
  if (flag > 30 || delegateUnready >= 2) key = 'passive';
  else if (p('วก') >= 50 && p('พค') >= 50 && p('กจ') >= 50) key = 'collabInstr';
  else if (mainTags.every(t => p(t) >= 40) && flag < 15) key = 'balanced';
  else if ((p('ทศ') + p('ปบ') + p('นว')) / 3 > 50 && p('รบ') < 40 && (fitScore ?? 100) < 50) key = 'transformNoFollow';
  else if (directShare > 60 && p('กจ') < 40) key = 'directive';
  else if (p('รบ') > 60 && p('วก') < 40 && p('พค') < 40) key = 'systems';
  const top = mainTags.filter(t => pct[t] != null).sort((a, b) => p(b) - p(a)).slice(0, 2);
  const keng = byArea.academic?.max ? Math.round(100 * byArea.academic.exp / byArea.academic.max) : null;
  return { pct, got, opp, axes, knowledge, fitScore, flag, cmdCount, cmdTotal, directShare, delegateUnready, steps, key, profile: PROFILES[key], top, byArea, examples };
}

// ตัวชี้วัด "เก่ง ดี มีสุข" ของโรงเรียน (ตัวชี้วัดในเกม ไม่ใช่การวัดจริง)
export function schoolMeters() {
  const P = computeProfile();
  if (!P.steps) return { keng: null, dee: null, suk: null, P };
  const ratio = a => P.byArea[a]?.max ? 100 * P.byArea[a].exp / P.byArea[a].max : null;
  const avg = (...xs) => { const v = xs.filter(x => x != null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
  const pc = t => P.pct[t];
  const keng = ratio('academic') == null ? null : avg(ratio('academic'), pc('วก'), pc('พค'));
  const dee = avg(P.knowledge, ratio('general'), ratio('budget'), ratio('personnel'));
  const morale = Math.round(Object.entries(S.chars).filter(([id]) => CHARACTERS[id].readiness && CHARACTERS[id].readiness !== 'ST').reduce((s, [, c], _, arr) => s + c.morale / arr.length, 0));
  const suk = avg(P.fitScore, morale, pc('ปบ'), pc('⚠') != null ? 100 - pc('⚠') : null);
  return { keng, dee, suk, P };
}

export function completedCount() { return Object.values(S.levels).filter(l => l.status === 'passed' || l.status === 'skipped').length; }
