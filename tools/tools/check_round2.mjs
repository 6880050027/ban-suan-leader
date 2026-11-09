// ตรวจรอบ 2: ผลพิจารณางบลงทุน และข้อมูลคณะที่มาเยือน
globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
import assert from 'node:assert/strict';
const St = await import('../js/state.js');
const Ec = await import('../js/economy.js');
const { GUESTS } = await import('../js/data/guests.js');
St.newGame('x');
const e = Ec.econ();
// อาคารเรียน: นักเรียนไม่ถึง 85% ของความจุ → ไม่ผ่านแม้หลักฐานครบ
e.students = 640; e.capacity = 900;
assert.match(Ec.capitalReview({ item: 'newbldg', ev: 'strong' }, 0.99), /ร้อยละ 85/);
e.students = 880;
assert.equal(Ec.capitalReview({ item: 'newbldg', ev: 'strong' }, 0.99), null);
assert.ok(Ec.capitalReview({ item: 'newbldg', ev: 'strong' }, 0.1), 'งบจำกัด 15%');
assert.ok(Ec.capitalReview({ item: 'newbldg', ev: 'weak' }, 0.4), 'หลักฐานอ่อน 50%');
assert.ok(Ec.capitalReview({ item: 'dome', ev: 'none' }, 0.99));
// ความจุรวมเมื่อสร้างอาคารเรียนครบ ต้องรองรับราว 2,500 คน
const cap = 900 + Ec.ITEMS.filter(i => i.capacity).reduce((s, i) => s + i.capacity, 0);
assert.ok(cap >= 2500, 'ความจุรวม ' + cap);
assert.ok(Math.max(...Ec.ITEMS.filter(i => i.needLand).map(i => i.needLand)) <= Ec.LAND_MAX);
// คณะที่มาเยือน: ทุกจุดมีคำถาม ตัวเลือกครบ และมีตัวเลือกที่ถูกอย่างน้อยหนึ่งข้อ
for (const g of GUESTS) {
  for (const it of [g.prep, g.close, ...g.stops]) { assert.ok(it.q && it.opts.length >= 2, g.id + ' ' + it.q); assert.ok(it.opts.some(o => o.v === 'ok')); for (const o of it.opts) assert.ok(['ok', 'warn', 'bad'].includes(o.v) && o.why); }
  assert.ok(g.stops.filter(s => !s.need).length >= g.pickN, g.id + ' ต้องมีจุดที่ไม่ต้องซื้อของอย่างน้อย pickN จุด');
  assert.ok(g.stops.every(s => [0, 1, 2].includes(s.fit)));
}
console.log('round2 ok · ความจุสูงสุด', cap);
