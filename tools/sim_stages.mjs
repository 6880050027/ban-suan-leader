globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
const St = await import('../js/state.js');
const W = await import('../js/data/world.js');
const pts=(o,t)=>o.tags[0]===t?2:(o.tags.includes(t)?1:0);
function run(pref){
  St.newGame('x');
  for (let id=1; id<=50; id++){ const L=St.LEVEL_BY_ID[id]; St.startAttempt(id);
    for (const t of (W.COMMAND_TASKS[id]||[])) St.judgeCommand(id,t.c,St.taskFit(t));
    L.steps.forEach((s,i)=>{ let bi=0,bv=-1e9; s.options.forEach((o,k)=>{ if(o.minStage) return; const v=(o.legal==='illegal'?-50:o.exp*0.3)+pref.reduce((a,t)=>a+pts(o,t)*10,0)-(o.tags.includes('⚠')?30:0); if(v>bv){bv=v;bi=k;} }); St.answer(id,i,bi); });
    St.finishLevel(id); }
  const P=St.computeProfile(); const o={}; for(const t of ['วก','พค','ทศ','ปบ','รบ','กจ','นว','⚠']) o[t]=P.pct[t]; o.fit=P.fitScore; return o;
}
// ขั้นสูงสุดที่ถึงได้ตามเกณฑ์สัดส่วนแนวการนำและความสอดคล้องการสั่งงาน (ไม่นับด่านประเมิน)
function reach(p){ let s=0; for (const sg of W.STAGES.slice(1)) { const n=sg.need; if (Object.entries(n.tags).every(([t,m])=>(p[t]??0)>=m) && (!n.fit || p.fit>=n.fit)) s=sg.id; else break; } return s; }
const R = { expOnly: run([]), allLead: run(['วก','พค','ทศ','ปบ','นว','กจ']) };
for (const [k,v] of Object.entries(R)) console.log(k, JSON.stringify(v), 'stage', reach(v));
import assert from 'node:assert/strict';
assert.equal(reach(R.expOnly), 1, 'ผู้เล่นที่ตาม EXP อย่างเดียวควรถึงขั้น 1');
assert.equal(reach(R.allLead), 3, 'ผู้เล่นที่ใช้แนวการนำหลากหลายควรถึงขั้น 3');
