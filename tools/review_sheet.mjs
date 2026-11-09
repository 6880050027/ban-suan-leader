// สร้างเอกสารตรวจทานด่าน (HTML) จากไฟล์ข้อมูลด่าน: node tools/review_sheet.mjs 53 62 > review.html
import { LEVELS5 } from '../js/data/levels5.js';
const [lo, hi] = process.argv.slice(2).map(Number);
const strip = s => String(s).replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g, '$2 [$1]');
const esc = s => strip(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const V = { ok: 'ไม่ขัดระเบียบ', illegal: 'ขัดระเบียบ', undetermined: 'ยังไม่ตัดสิน' };
let h = `<!doctype html><meta charset="utf-8"><title>ตรวจทานด่าน ${lo}–${hi}</title><style>body{font-family:'Sarabun',sans-serif;max-width:900px;margin:2.5cm auto;line-height:1.6;color:#222}h2{border-top:2px solid #ccc;padding-top:1em}table{border-collapse:collapse;width:100%;font-size:.92em}td,th{border:1px solid #ddd;padding:4px 6px;vertical-align:top}.src{background:#f6f3ea;padding:8px;font-size:.9em}.k{white-space:nowrap}</style><h1>ด่าน ${lo}–${hi} สำหรับตรวจทาน</h1><p>EXP 30 = ทางที่ดีที่สุด · ✱ = ต้องสืบข้อมูลก่อนจึงได้เต็ม · ขั้น ★ = เปิดตามขั้นภาวะผู้นำ</p>`;
for (const L of LEVELS5.filter(l => l.id >= lo && l.id <= hi)) {
  h += `<h2>ด่าน ${L.id} · ${esc(L.title)} <small>(${L.areaTh})</small></h2>${L.intro.map(p => `<p>${esc(p)}</p>`).join('')}<p class="src"><b>ฐานอ้างอิง:</b> ${esc(L.realCase)}</p>`;
  L.steps.forEach((st, i) => {
    h += `<h3>ขั้นในคลัง ${i + 1}: ${esc(st.title)}${st.timer ? ` (จับเวลา ${st.timer} วินาที)` : ''}${st.styleOnly ? ' (สะท้อนแนวการนำ)' : ''}</h3>${st.note ? `<p><i>${esc(st.note)}</i></p>` : ''}`;
    if (st.clues) h += `<ul>${st.clues.map(c => `<li><b>${esc(c.label)}</b>: ${esc(c.text)}</li>`).join('')}</ul>`;
    h += `<table><tr><th>ข้อ</th><th>ตัวเลือก</th><th>ผล</th><th>คำอธิบาย</th></tr>${st.options.map(o => `<tr><td class="k">${o.key}${o.minStage ? ' ★' + o.minStage : ''}</td><td>${esc(o.text)}</td><td class="k">${o.exp}${o.evidence ? '✱' : ''} · ${V[o.legal]}<br>${o.tags.join(' ')}</td><td>${esc(o.explain)}</td></tr>`).join('')}</table>`;
  });
}
console.log(h);
