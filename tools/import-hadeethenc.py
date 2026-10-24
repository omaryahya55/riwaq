"""
رواق: استيراد المحتوى من موسوعة الأحاديث النبوية (HadeethEnc.com). بديل جاهز لـ sunnah.com.

سياسة الاستخدام الرسمية (github.com/IslamHouse-API، قرأناها 2026-10-24):
  "ما تحتاج إذن مسبق إذا التزمت بالشروط": بدون تعديل أو إضافة أو حذف في النص،
  وذكر المصدر بوضوح (HadeethEnc.com)، والاستخدام التجاري وغير التجاري مسموح.

وش يسوي:
  - حديث اليوم: من فئات الأخلاق والآداب والفضائل، والصحيح بس، ومن البخاري أو مسلم أو المتفق عليه بس
  - أذكار الصباح والمساء: الفئة ٣٠١
  - صحابي اليوم: أحاديث فضل الصحابة (الفئتين ١٠١ و ٢٧٦)، والصحيح بس
  - النص ينحفظ حرفياً كما رجع من المصدر. ما نعدل ولا حرف
  - طلب واحد بالثانية تقريباً

الاستخدام:
    python tools/import-hadeethenc.py [ملف الإخراج]
    الافتراضي: web/content/candidates/hadeethenc.json (مرشح، ما ينعرض لين يعتمده صاحب المشروع)
"""
import json
import os
import sys
import time
import urllib.request
from datetime import date

API = "https://hadeethenc.com/api/v1"
UA = "Riwaq/0.1 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "web", "content", "candidates", "hadeethenc.json")

HADITH_CATS = ["282", "267", "277", "273", "278"]   # الأخلاق الحميدة، الآداب، فضائل الأعمال، بر الوالدين، فضائل الذكر
ADHKAR_CATS = ["301"]                                 # أذكار الصباح والمساء
SAHABI_CATS = ["101", "276"]                          # فضل الصحابة، فضائل الصحابة
SAHIHAYN = ("متفق عليه", "رواه البخاري", "رواه مسلم")

MAX_LEN = {"hadith": 260, "sahabi": 320, "adhkar": 520}  # يناسب مساحة الشاشة


def get(path):
    req = urllib.request.Request(API + path, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(5)


def ids_in(cat):
    out, page = [], 1
    while True:
        d = get(f"/hadeeths/list/?language=ar&category_id={cat}&page={page}&per_page=100")
        out += [h["id"] for h in d.get("data", [])]
        meta = d.get("meta", {})
        if int(meta.get("current_page", 1)) >= int(meta.get("last_page", 1)):
            return out
        page += 1
        time.sleep(1)


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # طرفية ويندوز ما تطبع ✓ بدونها
    plan = [("hadith", HADITH_CATS), ("adhkar", ADHKAR_CATS), ("sahabi", SAHABI_CATS)]
    seen, items = set(), []
    for kind, cats in plan:
        for cat in cats:
            for hid in ids_in(cat):
                if hid in seen:
                    continue
                seen.add(hid)
                time.sleep(1)
                h = get(f"/hadeeths/one/?language=ar&id={hid}")
                text = (h.get("hadeeth") or "").strip()
                grade = (h.get("grade") or "").strip()
                attribution = (h.get("attribution") or "").strip()
                if not text or not grade.startswith("صحيح"):
                    continue
                if kind == "hadith" and not attribution.startswith(SAHIHAYN):
                    continue
                if len(text) > MAX_LEN[kind]:
                    continue
                items.append({
                    "type": kind,
                    "text": text,                       # حرفياً من المصدر
                    "attribution": attribution,         # مثل: متفق عليه
                    "grade": grade,                     # مثل: صحيح
                    "reference": (h.get("reference") or "").strip(),
                    "source": f"{attribution} · {grade}",
                    "edition": "HadeethEnc.com",
                    "verifyUrl": f"https://hadeethenc.com/ar/browse/hadith/{hid}",
                    "sourceId": hid,
                    "approved": True,
                    "fetchedAt": date.today().isoformat()
                })
                print(f"✓ {kind} {hid}", flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    content = {
        "_readme": "منقول حرفياً من موسوعة الأحاديث النبوية HadeethEnc.com حسب سياسة الاستخدام: بدون تعديل، مع ذكر المصدر. لا تعدّل أي نص هنا.",
        "source": "HadeethEnc.com",
        "fetchedAt": date.today().isoformat(),
        "items": items
    }
    json.dump(content, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    counts = {k: sum(1 for x in items if x["type"] == k) for k in MAX_LEN}
    print("انحفظ:", counts, "→", OUT)


if __name__ == "__main__":
    main()
