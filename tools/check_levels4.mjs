// ตรวจโครงสร้างด่าน 51 ขึ้นไป: goto อยู่ในช่วง, evidence มีใน clues, timeout ถูกช่วง, ทุกเส้นทางยาวเท่า pathLen
import { LEVELS4 } from '../js/data/levels4.js';
import assert from 'node:assert/strict';
for (const L of LEVELS4) {
  const n = L.steps.length;
  L.steps.forEach((st, i) => {
    const ids = (st.clues || []).map(c => c.id);
    if (st.timer) assert.ok(st.timeout >= 0 && st.timeout < st.options.length, `${L.id}/${i} timeout`);
    st.options.forEach((o, k) => {
      if (o.goto !== undefined && o.goto !== 'end') assert.ok(o.goto > i && o.goto < n, `${L.id}/${i}/${k} goto ${o.goto}`);
      if (o.evidence) assert.ok(ids.includes(o.evidence), `${L.id}/${i}/${k} evidence`);
      assert.ok(['ok', 'illegal', 'undetermined'].includes(o.legal), `${L.id}/${i}/${k} legal`);
      assert.ok(o.tags?.length && typeof o.exp === 'number' && o.explain, `${L.id}/${i}/${k} fields`);
    });
    // ทุกขั้นต้องมีตัวเลือกที่ไม่ล็อกอย่างน้อย 1 ข้อที่ได้ 30 หรือเป็นขั้นที่ใครก็ได้คะแนนเต็ม 25 ขึ้นไป
    assert.ok(st.options.some(o => !o.minStage && o.exp >= 25), `${L.id}/${i} reachable max`);
  });
  const lens = new Set();
  const walk = (i, d) => { const st = L.steps[i]; const nexts = new Set(st.options.map(o => o.goto === 'end' ? null : (o.goto ?? (i + 1 < n ? i + 1 : null)))); for (const x of nexts) x == null ? lens.add(d) : walk(x, d + 1); };
  walk(0, 1);
  assert.deepEqual([...lens], [L.pathLen], `${L.id} path lengths ${[...lens]}`);
  console.log(`ด่าน ${L.id} ผ่าน: ${n} ขั้นในคลัง เดินจริง ${L.pathLen} ขั้น`);
}
