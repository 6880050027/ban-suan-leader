"""Parse the scenario-bank markdown report into game data (JSON inside a JS module)."""
import re, json, sys, html

SRC = sys.argv[1]
OUT = sys.argv[2]
text = open(SRC, encoding="utf-8").read()
lines = text.split("\n")

# reference definitions  [key]: url
refs = {}
for ln in lines:
    m = re.match(r"^\[([^\]]+)\]:\s*(\S+)", ln)
    if m:
        refs[m.group(1)] = m.group(2)

def md_inline(s):
    """Escape and convert markdown links/bold to HTML."""
    out = []
    pos = 0
    pat = re.compile(r"\[([^\]]+)\]\[([^\]]+)\]|\[([^\]]+)\]\((https?://[^)\s]+)\)")
    for m in pat.finditer(s):
        out.append(html.escape(s[pos:m.start()], quote=False))
        if m.group(1) is not None:
            label, key = m.group(1), m.group(2)
            url = refs.get(key)
        else:
            label, url = m.group(3), m.group(4)
        if url:
            out.append('<a href="%s" target="_blank" rel="noopener">%s</a>' % (html.escape(url), html.escape(label, quote=False)))
        else:
            out.append(html.escape(label, quote=False))
        pos = m.end()
    out.append(html.escape(s[pos:], quote=False))
    r = "".join(out)
    r = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", r)
    return r

AREA = {"บริหารทั่วไป": "general", "งบประมาณ": "budget", "บุคคล": "personnel", "วิชาการ": "academic"}
DIFF = {"ง่าย": 1, "กลาง": 2, "ยาก": 3, "ยากที่สุด": 4}
LEGAL = {"ถูก": "ok", "ผิดระเบียบ": "illegal", "ไม่ตัดสิน": "undetermined"}
TAGS = {"วก", "พค", "ทศ", "ปบ", "รบ", "กจ", "นว", "⚠"}

levels = []
lvl = None
step = None
problems = []
i = 0
in_section4 = False
for ln in lines:
    if ln.startswith("## 4."):
        in_section4 = True
        continue
    if ln.startswith("## 5."):
        in_section4 = False
    if not in_section4:
        continue
    m = re.match(r"^#### ด่าน (\d+) (.+) \((.+?) · (.+?)\)\s*$", ln)
    if m:
        lvl = {"id": int(m.group(1)), "title": m.group(2).strip(), "area": AREA[m.group(3)],
               "areaTh": m.group(3), "difficulty": DIFF[m.group(4)], "difficultyTh": m.group(4),
               "intro": [], "realCase": "", "ambiguity": "", "commandNote": "", "warning": "", "steps": []}
        levels.append(lvl)
        step = None
        continue
    m = re.match(r"^##### ขั้นที่ (\d+) (.+)$", ln)
    if m and lvl:
        title = m.group(2).strip()
        style_only = "ขั้นเชิงสไตล์" in title
        has_unverified = "ยังยืนยันไม่ได้" in title
        clean = re.sub(r"\s*\((ขั้นเชิงสไตล์|มีข้อยังยืนยันไม่ได้)[^)]*\)\s*$", "", title)
        step = {"n": int(m.group(1)), "title": clean, "styleOnly": style_only,
                "hasUnverified": has_unverified, "note": "", "options": []}
        lvl["steps"].append(step)
        continue
    if not lvl:
        continue
    if ln.startswith("|"):
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) < 5 or cells[0] in ("ตัวเลือก",) or set(cells[0]) <= set("-: "):
            continue
        if not step:
            problems.append(("table outside step", lvl["id"], ln[:80]))
            continue
        if len(cells) > 5:  # pipe inside explanation
            cells = cells[:4] + ["|".join(cells[4:])]
        opt_txt, legal, tag, exp, expl = cells
        mm = re.match(r"^([ก-จ])\.\s*(.+)$", opt_txt)
        if not mm:
            problems.append(("bad option", lvl["id"], step["n"], opt_txt[:60]))
            continue
        tags = [t.strip() for t in tag.split("/") if t.strip()]
        for t in tags:
            if t not in TAGS:
                problems.append(("bad tag", lvl["id"], step["n"], t))
        if legal not in LEGAL:
            problems.append(("bad legal", lvl["id"], step["n"], legal))
        try:
            expv = int(exp)
        except ValueError:
            problems.append(("bad exp", lvl["id"], step["n"], exp)); expv = 0
        step["options"].append({"key": mm.group(1), "text": md_inline(mm.group(2)),
                                "legal": LEGAL.get(legal, "ok"), "tags": tags, "exp": expv,
                                "explain": md_inline(expl)})
        continue
    s = ln.strip()
    if not s or s.startswith("#"):
        continue
    if step is None:
        if s.startswith("กรณีจริงที่อิง:"):
            lvl["realCase"] = md_inline(s.split(":", 1)[1].strip())
        elif s.startswith("คำสั่งสถานการณ์:"):
            lvl["commandNote"] = md_inline(s.split(":", 1)[1].strip())
        elif s.startswith("ความกำกวมของด่าน:"):
            lvl["ambiguity"] = md_inline(s.split(":", 1)[1].strip())
        elif s.startswith("คำเตือน") or (s.startswith("ด่านนี้") and "เตือน" in s):
            lvl["warning"] = md_inline(s.split(":", 1)[-1].strip() if s.startswith("คำเตือน") else s)
        else:
            lvl["intro"].append(md_inline(s))
    else:
        step["note"] = (step["note"] + " " if step["note"] else "") + md_inline(s)

# validate
for L in levels:
    for st in L["steps"]:
        if len(st["options"]) != 5:
            problems.append(("option count", L["id"], st["n"], len(st["options"])))
        ill = sum(1 for o in st["options"] if o["legal"] == "illegal")
        if ill > 1:
            problems.append(("illegal>1", L["id"], st["n"]))
print("levels", len(levels), "steps", sum(len(L["steps"]) for L in levels),
      "options", sum(len(s["options"]) for L in levels for s in L["steps"]))
for p in problems:
    print("PROBLEM", p)
for L in levels:
    print(L["id"], L["title"], L["area"], L["difficulty"], len(L["steps"]),
          "warn" if L["warning"] else "", "intro%d" % len(L["intro"]))
open(OUT, "w", encoding="utf-8").write(
    "// สร้างอัตโนมัติจากรายงาน \"คลังสถานการณ์เกมผู้บริหาร 20 ด่าน\" — แก้เนื้อหาที่รายงานแล้วรันสคริปต์ใหม่ หรือแก้ในไฟล์นี้โดยตรง\n"
    "export const LEVELS = " + json.dumps(levels, ensure_ascii=False, indent=1) + ";\n")
