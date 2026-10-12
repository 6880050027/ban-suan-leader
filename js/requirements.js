// เกณฑ์ความพร้อมของโรงเรียนประจำด่าน
// ด่านจะนับว่า "ผ่าน" เมื่อ (1) ได้ EXP ถึงเกณฑ์ และ (2) โรงเรียนมีความพร้อมตามเกณฑ์ของด่านนั้น
// ถ้าได้ EXP ถึงแล้วแต่โรงเรียนยังไม่พร้อม ด่านจะอยู่ในสถานะ "รอเกณฑ์โรงเรียน" และช่วงถัดไปยังไม่เปิด
// เมื่อจัดหาหรือแก้ไขจนครบ เกมจะเปลี่ยนเป็น "ผ่านแล้ว" ให้เอง
// เกณฑ์เหล่านี้กำหนดขึ้นเพื่อการเล่น โยงกับเนื้อเรื่องของแต่ละด่าน ไม่ใช่เกณฑ์ทางราชการ
import * as St from './state.js';
import * as Ec from './economy.js';

const M = { keng: 'เก่ง', dee: 'ดี', suk: 'มีสุข' };

// ชนิดเกณฑ์: item (จัดหาอย่างถูกระเบียบแล้ว), any (อย่างน้อยหนึ่งรายการ), meter, students, nocrisis, reserve, land
export const REQS = {
  1: [{ t: 'nocrisis' }],
  2: [{ t: 'item', id: 'water' }],
  3: [{ t: 'meter', k: 'suk', min: 45 }],
  4: [{ t: 'meter', k: 'keng', min: 45 }],
  5: [{ t: 'meter', k: 'dee', min: 45 }],
  6: [{ t: 'item', id: 'uniform' }, { t: 'nocrisis' }],
  7: [{ t: 'meter', k: 'suk', min: 50 }, { t: 'students', min: 620 }],
  8: [{ t: 'any', ids: ['library', 'ict'] }, { t: 'meter', k: 'keng', min: 50 }],
  9: [{ t: 'item', id: 'nurse' }, { t: 'meter', k: 'dee', min: 50 }],
  10: [{ t: 'nocrisis' }, { t: 'reserve', min: 100000 }],
  11: [{ t: 'item', id: 'scilab' }, { t: 'students', min: 650 }],
  12: [{ t: 'land', min: 1 }, { t: 'students', min: 700 }, { t: 'meter', k: 'keng', min: 55 }],
  13: [{ t: 'item', id: 'toiletReno' }, { t: 'meter', k: 'suk', min: 55 }],
  14: [{ t: 'item', id: 'sports' }, { t: 'nocrisis' }],
  15: [{ t: 'item', id: 'cctv' }, { t: 'meter', k: 'suk', min: 60 }, { t: 'meter', k: 'dee', min: 55 }],
  16: [{ t: 'item', id: 'ict' }, { t: 'meter', k: 'keng', min: 60 }],
  17: [{ t: 'item', id: 'electric' }, { t: 'meter', k: 'dee', min: 60 }],
  18: [{ t: 'nocrisis' }, { t: 'reserve', min: 150000 }],
  19: [{ t: 'meter', k: 'suk', min: 60 }, { t: 'meter', k: 'dee', min: 60 }],
  20: [{ t: 'land', min: 2 }, { t: 'students', min: 750 }, { t: 'meter', k: 'keng', min: 65 }],
};
// เหตุผลสั้น ๆ ที่โยงเกณฑ์กับเรื่องในด่าน
export const WHY = {
  1: 'เปิดภาคเรียนได้ต้องมีการเงินที่ยังไม่อยู่ในภาวะวิกฤต',
  2: 'หลังท่อแตก โรงเรียนต้องมีระบบน้ำดื่มสะอาดให้นักเรียน',
  3: 'เรื่องย้ายครูกระทบใจคนทั้งโรงเรียน บรรยากาศต้องไม่ตกต่ำ',
  4: 'การแก้ปัญหาผลการเรียนต้องสะท้อนในคุณภาพวิชาการ',
  5: 'เรื่องวินัยต้องจบด้วยระบบดูแลที่ชุมชนยอมรับ',
  6: 'เงินค่าเครื่องแบบต้องถึงมือนักเรียนตามสิทธิ',
  7: 'รอบเลื่อนเงินเดือนผ่านไปได้ดีเมื่อครูยังมีขวัญกำลังใจ',
  8: 'โครงการวิชาการต้องมีแหล่งเรียนรู้รองรับ',
  9: 'กิจกรรมค้างคืนต้องมีระบบปฐมพยาบาลในโรงเรียน',
  10: 'ปิดเรื่องหนี้สมาคมแล้ว โรงเรียนต้องมีเงินรายได้สำรอง',
  11: 'เมื่อครูฟิสิกส์ลาออก ห้องปฏิบัติการต้องพร้อมให้ครูใหม่สอนต่อ',
  12: 'จะรับเด็กในเขตได้ครบ โรงเรียนต้องมีพื้นที่และนักเรียนตามแผน',
  13: 'หลังเหตุป่วยหมู่ สุขาภิบาลในโรงเรียนต้องได้รับการปรับปรุง',
  14: 'ปฏิเสธสเปกที่ไม่โปร่งใสแล้ว นักเรียนยังต้องมีอุปกรณ์กีฬา',
  15: 'หลังเหตุความรุนแรง ต้องมีระบบเฝ้าระวังและบรรยากาศที่ปลอดภัย',
  16: 'ระบบสอบต้องมีห้องคอมพิวเตอร์และคุณภาพวิชาการรองรับ',
  17: 'ระบบไฟส่องสว่างและการเฝ้าระวังเป็นส่วนหนึ่งของแผนความปลอดภัย',
  18: 'หลังตรวจบัญชีเงินยืม โรงเรียนต้องมีเงินสำรองและไม่อยู่ในวิกฤต',
  19: 'การดูแลนักเรียนกลุ่มเสี่ยงต้องอาศัยความไว้วางใจในโรงเรียน',
  20: 'เป้าหมายระดับเขตต้องมีพื้นที่ นักเรียน และคุณภาพวิชาการรองรับ',
};

function hasItem(id) {
  const e = Ec.econ(), it = Ec.ITEM[id];
  if (it.facility && e.owned[it.facility]) return true;
  return e.bought.some(b => b.id === id && b.verdict === 'ok');
}
export function checkOne(r) {
  const e = Ec.econ();
  switch (r.t) {
    case 'item': return { ok: hasItem(r.id), th: `มี "${Ec.ITEM[r.id].th}"`, now: hasItem(r.id) ? 'มีแล้ว' : 'ยังไม่มี', go: { shop: Ec.ITEM[r.id].group, item: r.id } };
    case 'any': { const got = r.ids.filter(hasItem); return { ok: got.length > 0, th: `มี ${r.ids.map(i => `"${Ec.ITEM[i].th}"`).join(' หรือ ')}`, now: got.length ? 'มีแล้ว' : 'ยังไม่มี', go: { shop: Ec.ITEM[r.ids[0]].group, item: r.ids[0] } }; }
    case 'meter': { const v = Ec.meters()[r.k]; return { ok: v != null && v >= r.min, th: `ตัวชี้วัด${M[r.k]} ตั้งแต่ ${r.min}`, now: v == null ? 'ยังไม่มีข้อมูล' : `ตอนนี้ ${v}`, go: { meter: r.k } }; }
    case 'students': return { ok: e.students >= r.min, th: `นักเรียนตั้งแต่ ${Ec.fmt(r.min)} คน`, now: `ตอนนี้ ${Ec.fmt(e.students)} คน`, go: { students: true } };
    case 'nocrisis': return { ok: !e.crisis, th: 'ไม่อยู่ในภาวะวิกฤตทางการเงิน', now: e.crisis ? 'อยู่ในภาวะวิกฤต' : 'ปกติ', go: { crisis: true } };
    case 'reserve': return { ok: e.wallets.income >= r.min, th: `เงินรายได้สถานศึกษาคงเหลือตั้งแต่ ${Ec.fmt(r.min)} บาท`, now: `ตอนนี้ ${Ec.fmt(e.wallets.income)} บาท`, go: { quest: true } };
    case 'land': return { ok: (e.land || 0) >= r.min, th: `พื้นที่โรงเรียนขยายแล้ว ${r.min} แปลง`, now: `ตอนนี้ ${e.land || 0} แปลง`, go: { quest: 'land' } };
  }
  return { ok: true, th: '', now: '' };
}
export function check(id) {
  const rows = (REQS[id] || []).map(checkOne);
  return { ok: rows.every(r => r.ok), rows };
}
// เรียกหลังผ่านด่านด้วย EXP: ตัดสินว่าผ่านจริงหรือรอเกณฑ์โรงเรียน
export function gate(id) {
  const l = St.lv(id);
  if (l.status !== 'passedExp' && l.status !== 'pending') return null;
  const c = check(id);
  l.status = c.ok ? 'passed' : 'pending';
  St.save();
  return c;
}
// ตรวจทุกด่านที่รอเกณฑ์ คืนรายการด่านที่เพิ่งผ่าน
export function promote() {
  const done = [];
  for (const [id, l] of Object.entries(St.S.levels)) {
    if (l.status !== 'pending' && l.status !== 'passedExp') continue;
    if (check(+id).ok) { l.status = 'passed'; done.push(+id); }
    else if (l.status === 'passedExp') l.status = 'pending';
  }
  if (done.length) St.save();
  return done;
}
export function pendingLevels() { return Object.entries(St.S.levels).filter(([, l]) => l.status === 'pending').map(([id]) => +id); }
