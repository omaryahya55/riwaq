"""
رواق: استيراد المحتوى من موسوعة الأحاديث النبوية (HadeethEnc.com). بديل جاهز لـ sunnah.com.

سياسة الاستخدام الرسمية (github.com/IslamHouse-API، قرأناها 2026-10-24):
  "ما تحتاج إذن مسبق إذا التزمت بالشروط": بدون تعديل أو إضافة أو حذف في النص،
  وذكر المصدر بوضوح (HadeethEnc.com)، والاستخدام التجاري وغير التجاري مسموح.

وش يسوي:
  - حديث اليوم: كل أبواب الأخلاق والآداب والفضائل والرقائق، والصحيح المرفوع بس
  - أحاديث لها وقت (الأكل، الصلاة، النوم، الصيام، الجمعة...): تاخذ "context" وتطلع في وقتها
  - الأذكار: من حصن المسلم (tools/import-hisn.py)، وهذا السكربت ما يلمسها
  - صحابي اليوم: أحاديث فضل الصحابة (الفئتين ١٠١ و ٢٧٦)، والصحيح بس
  - النص ينحفظ حرفياً كما رجع من المصدر. ما نعدل ولا حرف
  - طلب واحد بالثانية تقريباً

الاستخدام:
    python tools/import-hadeethenc.py [ملف الإخراج]
    الافتراضي: web/content/approved.json (المصدر معتمد من صاحب المشروع 2026-10-24)
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
OUT = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else os.path.join(HERE, "..", "web", "content", "approved.json")  # اعتمده صاحب المشروع 2026-10-24

# أحاديث مرتبطة بوقت: تطلع في وقتها (آداب الأكل وقت الغدا والعشا، فضل الصلاة قبل الإقامة...)
CONTEXT_CATS = {
    "290": "meal",       # آداب الأكل والشرب
    "458": "adhan",      # الأذان والإقامة
    "457": "prayer",     # فضل الصلاة
    "469": "prayer",     # فضل صلاة الجماعة
    "441": "prayer",     # فضل الوضوء
    "293": "sleep",      # آداب النوم والاستيقاظ
    "484": "sleep",      # قيام الليل
    "513": "fasting",    # فضل الصيام
    "524": "fasting",    # صيام التطوع
    "526": "lastTen",    # العشر الأواخر من رمضان
    "533": "dhulhijjah", # العشر من ذي الحجة
    "477": "friday",     # فضل يوم الجمعة
}
# الباقي: حديث اليوم. كل أبواب الفضائل والآداب والرقائق (كلها فاضلة ومهمة)
HADITH_CATS = ["282", "267", "277", "273", "278", "270", "271", "272", "274", "279", "280", "281",
               "284", "286", "287", "291", "295", "296", "297", "298", "12", "314", "316", "321", "322"]
SAHABI_CATS = ["101", "276"]                          # فضل الصحابة، فضائل الصحابة
# أذكار الصباح والمساء وباقي الأذكار: من حصن المسلم كامل (tools/import-hisn.py)

# "سنّة نعيشها": أبواب الآداب العملية اللي يطبقها الواحد في يومه
SUNNAH_CATS = ["286", "287", "290", "293", "295", "296", "297", "298", "436", "443"]
# السلام والاستئذان، والكلام، والأكل والشرب، والنوم، والزيارة، والعطاس، وعيادة المريض، واللباس، وسنن الفطرة، وسنن الوضوء

MAX_LEN = {"hadith": 450, "sahabi": 450}  # الشاشة تصغّر الخط للطويل، وفوق كذا ما يدخل


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


def sunnah_ids():
    out = set()
    for c in SUNNAH_CATS:
        out |= {str(i) for i in ids_in(c)}
        time.sleep(1)
    return out


def tag(items, sids):
    for x in items:
        if x.get("type") == "hadith" and str(x.get("sourceId")) in sids:
            x["tags"] = sorted(set(x.get("tags", [])) | {"sunnah"})
        elif "tags" in x and "sunnah" in x["tags"] and str(x.get("sourceId")) not in sids:
            x["tags"] = [t for t in x["tags"] if t != "sunnah"]


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # طرفية ويندوز ما تطبع ✓ بدونها
    if "--tags-only" in sys.argv:
        # نحدّث وسم "سنّة نعيشها" بس، بدون ما ننزل الأحاديث كلها من جديد
        content = json.load(open(OUT, encoding="utf-8"))
        tag(content["items"], sunnah_ids())
        json.dump(content, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("سنّة نعيشها:", sum(1 for x in content["items"] if "sunnah" in x.get("tags", [])))
        return
    # الأبواب المرتبطة بوقت أول، عشان الحديث ياخذ وقته لو تكرر في باب عام
    plan = [("hadith", [(c, ctx) for c, ctx in CONTEXT_CATS.items()]),
            ("hadith", [(c, "general") for c in HADITH_CATS]),
            ("sahabi", [(c, "general") for c in SAHABI_CATS])]
    seen, items = set(), []
    for kind, cats in plan:
        for cat, ctx in cats:
            for hid in ids_in(cat):
                if hid in seen:
                    continue
                seen.add(hid)
                time.sleep(1)
                h = get(f"/hadeeths/one/?language=ar&id={hid}")
                text = (h.get("hadeeth") or "").strip()
                grade = (h.get("grade") or "").strip()
                # التخريج: السطر الأول بس (بعضها فيه سطر زايد). هذا وصف جنب النص، مو النص نفسه
                attribution = (h.get("attribution") or "").strip().splitlines()[0].strip().rstrip(".") if h.get("attribution") else ""
                # الصحيح المرفوع بس: "موقوف" كلام صحابي، مو حديث نبوي
                if not text or not grade.startswith("صحيح") or "موقوف" in grade:
                    continue
                if len(text) > MAX_LEN[kind]:
                    continue
                items.append({
                    "type": kind,
                    "context": ctx,
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
    tag(items, sunnah_ids())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # نستبدل عناصر الموسوعة بس (رقمها بدون بادئة)، وحصن المسلم (hisn-) والقرآن (quran-) يبقون زي ما هم
    content = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    keep = [x for x in content.get("items", []) if "-" in str(x.get("sourceId", ""))]
    content.update({
        "_readme": "المحتوى الديني المعتمد. منقول حرفياً بدون تعديل: الأحاديث وفضل الصحابة من موسوعة الأحاديث النبوية HadeethEnc.com (حسب سياسة الاستخدام)، والأذكار والأدعية من حصن المسلم للقحطاني رحمه الله (إذن المؤلف: التوزيع المجاني بدون حذف أو إضافة أو تغيير، مع كتابة: وقف لله تعالى). التحديث بالسكربتات في tools/",
        "source": "HadeethEnc.com + حصن المسلم",
        "fetchedAt": date.today().isoformat(),
        "items": items + keep
    })
    json.dump(content, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    from collections import Counter
    print("انحفظ:", dict(Counter((x["type"], x.get("context")) for x in items)), "→", OUT)


if __name__ == "__main__":
    main()
