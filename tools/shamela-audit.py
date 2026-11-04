"""
فحص شغل نقل الأحاديث للشاملة: يسحب الفرع، ويفحص كل نص مطبّق، ويشغّل الاختبارات، ويجمّع الشبهات في tools/shamela/review-queue.json.
ما يعدّل المحتوى. الاستخدام: python tools/shamela-audit.py
"""
import json, collections, subprocess, sys, os
sys.stdout.reconfigure(encoding="utf-8")
R = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")).replace("\\", "/") + "/"
def git(*a): return subprocess.run(["git", "-C", R, *a], capture_output=True, text=True, encoding="utf-8").stdout.strip()
git("fetch", "-q", "origin")
behind = git("log", "HEAD..origin/riwaq-0.3", "--format=%h %s")
print("جديد من السحابة:", behind or "لا شي")
if behind and not git("status", "--short"):
    git("pull", "-q", "--ff-only", "origin", "riwaq-0.3")
d = json.load(open(R + "web/content/approved.json", encoding="utf-8"))
sh = [i for i in d["items"] if i.get("edition") == "المكتبة الشاملة" and i.get("type") in ("hadith", "sahabi")]
henc = sum(1 for i in d["items"] if i.get("edition") == "HadeethEnc.com")
print("الشاملة:", len(sh), "· باقي من الموسوعة:", henc)
bad = collections.defaultdict(list)
seen = collections.Counter(str(i.get("sourceId")) for i in sh)
for i in sh:
    s = i.get("sourceId")
    if not i.get("narrator"): bad["بلا راوي"].append(s)
    if "¬" in i["text"]: bad["حاشية داخل النص"].append(s)
    if not i.get("verified"): bad["غير موثّق"].append(s)
    if i["grade"] != "صحيح" and not i.get("gradeBy"): bad["درجة بلا قائل"].append(s)
    if not i.get("shamela", {}).get("book_id"): bad["بلا مرجع"].append(s)
    if not i.get("takhrij"): bad["بلا تخريج"].append(s)
    if seen[str(s)] > 1: bad["مكرر"].append(s)
    t = [(x["book"], str(x.get("number"))) for x in i.get("takhrij", [])]
    if len(t) != len(set(t)): bad["تخريج مكرر"].append(s)
print("مشاكل:", dict(bad) if bad else "لا شي")
t = subprocess.run(["node", "--test", "tests/logic.test.mjs", "tests/worker.test.mjs"], cwd=R, capture_output=True, text=True, encoding="utf-8").stdout
print([l for l in t.splitlines() if l.startswith("ℹ pass") or l.startswith("ℹ fail")])
outs = sorted(f for f in os.listdir(R + "tools/shamela") if f.startswith("out-"))
print("ملفات المخرج:", outs[-3:])

# ===== قائمة المراجعة: كل اللي فيه شبهة يتجمّع هنا، وما ينعرض على المستخدم إلا بعد ما نخلص =====
CLEAR = ["صحيح", "حسن", "حسن صحيح", "صحيح الإسناد", "إسناده صحيح على شرط مسلم", "صحيح على شرط مسلم", "صحيح على شرط البخاري"]
import glob, re
applied = {str(i.get("sourceId")) for i in sh}
queue = {}
for f in sorted(glob.glob(R + "tools/shamela/out-*.json")):
    for r in json.load(open(f, encoding="utf-8")):
        sid = str(r.get("sourceId")); n = os.path.basename(f)
        if r.get("status") != "found":
            queue[sid] = {"sourceId": sid, "السبب": "ما انلقى أو الراوي أو الدرجة ما طابقت", "التفصيل": str(r.get("reason", ""))[:600], "الملف": n, "مطبّق": sid in applied}
        elif not r.get("verified") and sid not in applied:
            queue[sid] = {"sourceId": sid, "السبب": "غير موثّق حرفياً بالأداة (يمتد على صفحتين أو فيه علامة صفحة)", "التفصيل": str(r.get("note", ""))[:600], "الصفحة": r.get("primary"), "الملف": n, "مطبّق": False}
for i in sh:
    sid = str(i.get("sourceId"))
    if str(i.get("grade", "")).strip() not in CLEAR:
        queue.setdefault(sid, {"sourceId": sid, "السبب": "عبارة الدرجة غير واضحة: مطبّق لكن مخفي من العرض حتى يراجعه مختص", "الدرجة": i.get("grade"), "قائلها": i.get("gradeBy"), "مطبّق": True})
# ملاحظات الوكيل: بس من الدفعات الجديدة (١٠ وما بعد)، وبس لو تشير لاختلاف حقيقي (لفظ، راوٍ، طبعة، خطأ طباعة)
KEY = re.compile(r"differ|mismatch|not named|typo|wording|variant|only in|parallel|unlike|adds|omit|الراوي|اللفظ|يختلف|ما ذكر|خطأ", re.I)
for f in sorted(glob.glob(R + "tools/shamela/out-*.json")):
    num = re.search(r"out-(\d+)", f)
    if not num or int(num[1]) < 10: continue
    for r in json.load(open(f, encoding="utf-8")):
        sid = str(r.get("sourceId"))
        if r.get("status") == "found" and r.get("note") and sid in applied and sid not in queue and KEY.search(str(r["note"])):
            queue[sid] = {"sourceId": sid, "السبب": "الوكيل دوّن ملاحظة: اللفظ أو الراوي أو الطبعة تختلف عن الموسوعة", "التفصيل": str(r["note"])[:600], "مطبّق": True}
q = sorted(queue.values(), key=lambda x: (x["مطبّق"], x["sourceId"]))
json.dump({"_readme": "قائمة المراجعة: كل نص فيه شبهة. ما انعرض شي منها على صاحب المشروع، تنتظر نهاية النقل. مطبّق=true يعني انكتب في المحتوى (والدرجة غير الواضحة مخفية من العرض)، وfalse يعني بقي من الموسوعة.", "count": len(q), "items": q},
          open(R + "tools/shamela/review-queue.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("قائمة المراجعة:", len(q), "· مطبّق منها:", sum(1 for x in q if x["مطبّق"]))
