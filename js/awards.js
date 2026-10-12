// หอเกียรติยศ: รางวัลในเกม (ชื่อรางวัลแต่งขึ้น ไม่ใช่รางวัลจริงของหน่วยงานใด)
// เกณฑ์อิงพฤติกรรมการตัดสินใจในเกม เพื่อให้รางวัลสะท้อนสิ่งที่ผู้เล่นทำจริง ไม่ใช่เพียงจำนวน EXP
import * as St from './state.js';
import { CHARACTERS } from './data/world.js';
import * as Ec from './economy.js';

function stats() {
  const P = St.computeProfile();
  const m = Ec.meters();
  const lv = St.S.levels;
  const passed = id => lv[id]?.status === 'passed';
  const played = id => !!lv[id]?.record;
  let regOpp = 0;
  for (const [id, l] of Object.entries(lv)) {
    if (!l.record) continue;
    St.LEVEL_BY_ID[+id].steps.forEach(st => { if (st.options.some(o => o.legal === 'illegal')) regOpp++; });
  }
  const cmdFitTo = c => Object.values(lv).reduce((n, l) => n + (l.record?.commands?.[c]?.result === 'fit' ? 1 : 0), 0);
  const lessons = Object.values(lv).filter(l => l.lesson).length;
  const passedCount = Object.values(lv).filter(l => l.status === 'passed').length;
  const areaRatio = a => P.byArea[a]?.max ? P.byArea[a].exp / P.byArea[a].max : 0;
  const ch = id => St.S.chars[id] || { credits: 0, morale: 0 };
  return { P, m, passed, played, regOpp, cmdFitTo, lessons, passedCount, areaRatio, ch, done: St.completedCount() };
}

export const AWARDS = [
  // ---- รางวัลผู้บริหาร ----
  { id: 'firstStep', group: 'admin', th: 'เข็มผู้บริหารก้าวแรก', how: 'ผ่านด่านแรกของเกม', test: s => s.passedCount >= 1 },
  { id: 'governance', group: 'admin', th: 'รางวัลผู้บริหารธรรมาภิบาล', how: 'เลือกตัวเลือกที่ไม่ขัดระเบียบตั้งแต่ครั้งแรกไม่น้อยกว่าร้อยละ 90 จากขั้นที่มีประเด็นระเบียบอย่างน้อย 10 ขั้น', test: s => s.regOpp >= 10 && (s.P.knowledge ?? 0) >= 90 },
  { id: 'peopleReader', group: 'admin', th: 'รางวัลผู้บริหารผู้เข้าใจบุคลากร', how: 'เลือกวิธีทำงานที่สอดคล้องกับความพร้อมของบุคลากรไม่น้อยกว่าร้อยละ 80 จากอย่างน้อย 10 ครั้ง', test: s => s.P.cmdTotal >= 10 && (s.P.fitScore ?? 0) >= 80 },
  { id: 'learningLeader', group: 'admin', th: 'รางวัลผู้นำการเรียนรู้', how: 'ผ่านด่านวิชาการอย่างน้อย 3 ด่าน โดยเลือกแนวมุ่งการเรียนการสอนและแนวพัฒนาครูไม่น้อยกว่าร้อยละ 60', test: s => [4, 8, 12, 16, 20].filter(s.passed).length >= 3 && (s.P.pct['วก'] ?? 0) >= 60 && (s.P.pct['พค'] ?? 0) >= 60 },
  { id: 'noPassive', group: 'admin', th: 'รางวัลผู้บริหารไม่นิ่งดูดาย', how: 'ผ่านอย่างน้อย 10 ด่าน โดยไม่เลือกตัวเลือกแนวนิ่งเฉยหรือหลีกเลี่ยงเลย', test: s => s.passedCount >= 10 && s.P.flag === 0 },
  { id: 'crisis', group: 'admin', th: 'รางวัลผู้นำฝ่าวิกฤต', how: 'ผ่านช่วงที่ 4 ครบ โดยเล่นจริงอย่างน้อย 3 ด่าน', test: s => [16, 17, 18, 19, 20].every(id => St.levelDone(id)) && [16, 17, 18, 19, 20].filter(s.passed).length >= 3 },
  { id: 'reflective', group: 'admin', th: 'รางวัลนักสะท้อนคิด', how: 'บันทึกบทเรียนที่จะนำไปใช้ในโรงเรียนของตนเองท้ายด่านอย่างน้อย 10 ด่าน', test: s => s.lessons >= 10 },
  { id: 'allRound', group: 'admin', th: 'รางวัลผู้บริหารรอบด้าน', how: 'ผ่านครบ 20 ด่าน และได้ EXP ไม่น้อยกว่าร้อยละ 70 ในงานทั้ง 4 ด้าน', test: s => s.done === 20 && ['academic', 'personnel', 'budget', 'general'].every(a => s.areaRatio(a) >= 0.7) },
  { id: 'quizMaster', group: 'admin', th: 'รางวัลผู้บริหารรอบรู้ระเบียบ', how: 'ตอบคำถามถูกหรือผิดถูกต้องอย่างน้อย 20 ข้อ', test: () => (St.S.quiz?.correct || 0) >= 20 },
  { id: 'complete', group: 'admin', th: 'เกียรติบัตรผู้สำเร็จเส้นทางผู้บริหาร', how: 'ผ่านครบ 20 ด่าน', test: s => s.done === 20 },
  // ---- รางวัลครูและบุคลากร (สะท้อนผลจากวิธีที่ท่านทำงานกับบุคคลนั้น) ----
  { id: 'tonkla', group: 'staff', who: 'tonkla', th: 'รางวัลครูรุ่นใหม่ก้าวหน้า', how: 'ครูต้นกล้าได้รับการสั่งการหรือสอนงานที่เหมาะกับความพร้อมอย่างน้อย 2 ครั้ง', test: s => s.ch('tonkla').credits >= 2 },
  { id: 'malee', group: 'staff', who: 'malee', th: 'รางวัลรองผู้อำนวยการผู้เติบโต', how: 'รองฯ มาลีได้รับการสอนงานที่เหมาะกับความพร้อมอย่างน้อย 2 ครั้ง', test: s => s.ch('malee').credits >= 2 },
  { id: 'prasert', group: 'staff', who: 'prasert', th: 'รางวัลรองผู้อำนวยการผู้ได้รับความไว้วางใจ', how: 'มอบหมายงานแก่รองฯ ประเสริฐอย่างเหมาะสมอย่างน้อย 2 ครั้ง', test: s => s.cmdFitTo('prasert') >= 2 },
  { id: 'wilai', group: 'staff', who: 'wilai', th: 'รางวัลครูผู้กลับมามีพลัง', how: 'ขวัญกำลังใจของครูวิไลไม่น้อยกว่า 85', test: s => s.ch('wilai').morale >= 85 },
  { id: 'somsak', group: 'staff', who: 'somsak', th: 'รางวัลครูผู้ดูแลนักเรียนเชิงบวก', how: 'ครูสมศักดิ์ได้รับการสอนงานที่เหมาะสม และผ่านด่าน 15', test: s => s.ch('somsak').credits >= 1 && s.passed(15) },
  { id: 'arun', group: 'staff', who: 'arun', th: 'รางวัลครูแกนนำการเรียนรู้', how: 'มอบหมายให้ครูอรุณนำการพัฒนาอย่างเหมาะสมในด่าน 20 และผ่านด่าน', test: s => s.passed(20) && St.S.levels[20]?.record?.commands?.arun?.result === 'fit' },
  { id: 'boonmee', group: 'staff', who: 'boonmee', th: 'รางวัลบุคลากรสนับสนุนดีเด่น', how: 'ขวัญกำลังใจของลุงบุญมีไม่น้อยกว่า 85', test: s => s.ch('boonmee').morale >= 85 },
  // ---- รางวัลโรงเรียน ----
  { id: 'safeSchool', group: 'school', th: 'รางวัลโรงเรียนปลอดภัย', how: 'ผ่านด่านงานบริหารทั่วไปครบทุกด่านที่เล่น และได้ EXP ด้านนี้ไม่น้อยกว่าร้อยละ 75', test: s => [1, 5, 9, 13, 17].every(id => St.levelDone(id)) && s.areaRatio('general') >= 0.75 },
  { id: 'trusted', group: 'school', th: 'รางวัลโรงเรียนที่ชุมชนไว้วางใจ', how: 'มีนักเรียนตั้งแต่ 1,000 คนขึ้นไป', test: () => Ec.econ().students >= 1000 },
  { id: 'cleanMoney', group: 'school', th: 'รางวัลการบริหารงบประมาณโปร่งใส', how: 'จัดหาสิ่งต่าง ๆ ให้โรงเรียนอย่างถูกระเบียบอย่างน้อย 3 รายการ โดยไม่เคยใช้เงินผิดประเภท', test: () => Ec.econ().bought.filter(b => b.verdict === 'ok').length >= 3 && Ec.econ().lostToMisuse === 0 },
  { id: 'kds', group: 'school', th: 'รางวัลโรงเรียนเก่ง ดี มีสุข', how: 'ตัวชี้วัดเก่ง ดี และมีสุข ไม่น้อยกว่า 75 ทั้งสามด้าน', test: s => (s.m.keng ?? 0) >= 75 && (s.m.dee ?? 0) >= 75 && (s.m.suk ?? 0) >= 75 },
];
export const GROUPS = { admin: 'รางวัลผู้บริหาร', staff: 'รางวัลครูและบุคลากร', school: 'รางวัลโรงเรียน' };

// ตรวจรางวัลใหม่ คืนรายการที่เพิ่งได้รับ
export function checkAwards() {
  const s = stats();
  St.S.awards ||= {};
  const fresh = [];
  for (const a of AWARDS) {
    if (St.S.awards[a.id]) continue;
    let ok = false; try { ok = a.test(s); } catch { ok = false; }
    if (ok) { St.S.awards[a.id] = Date.now(); fresh.push(a); }
  }
  if (fresh.length) St.save();
  return fresh;
}
export function earnedCount() { return Object.keys(St.S.awards || {}).length; }
export function whoName(a) { return a.who ? CHARACTERS[a.who].name : ''; }
