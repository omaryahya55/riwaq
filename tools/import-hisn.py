"""
رواق: استيراد أذكار الصباح والمساء من حصن المسلم (سعيد بن علي بن وهف القحطاني رحمه الله).

المصدر الرقمي: hisnmuslim.com (يقدّمه للمطورين، /api/ar/27.json).
⚠️ ما يشتغل على الملف المعتمد إلا بعد التأكد من إذن إعادة النشر (صفحة الحقوق في الكتاب المطبوع).
   لين ذاك الحين يكتب ملف مرشح: web/content/candidates/hisn.json

القواعد (docs/CONTENT.md): النص حرفياً كما هو، ومعه المرجع (اسم الكتاب ورقم الذكر) وعدد التكرار.

الاستخدام:
    python tools/import-hisn.py            → ملف مرشح
    python tools/import-hisn.py --approve  → يضيفها للملف المعتمد (بعد التأكد من الإذن)
"""
import json
import os
import sys
import urllib.request
from datetime import date

URL = "https://www.hisnmuslim.com/api/ar/27.json"
UA = "Riwaq/0.1 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"
HERE = os.path.dirname(os.path.abspath(__file__))
APPROVED = os.path.join(HERE, "..", "web", "content", "approved.json")
CANDIDATE = os.path.join(HERE, "..", "web", "content", "candidates", "hisn.json")
AR = "٠١٢٣٤٥٦٧٨٩"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=25).read().decode("utf-8-sig")
    data = json.loads(raw)
    section = next(iter(data))
    items = []
    for it in data[section]:
        text = (it.get("ARABIC_TEXT") or "").strip()
        if not text:
            continue
        rep = int(it.get("REPEAT") or 1)
        num = "".join(AR[int(c)] for c in str(it["ID"]))
        items.append({
            "type": "adhkar",
            "text": text,  # حرفياً من المصدر
            "repeat": rep,
            "source": f"حصن المسلم · ذكر رقم {num}" + (f" · يقال {''.join(AR[int(c)] for c in str(rep))} {'مرات' if 3 <= rep <= 10 else 'مرة'}" if rep > 1 else ""),
            "edition": "حصن المسلم (القحطاني) · hisnmuslim.com",
            "verifyUrl": "https://www.hisnmuslim.com/",
            "sourceId": f"hisn-{it['ID']}",
            "approved": True,
            "fetchedAt": date.today().isoformat()
        })
    if "--approve" in sys.argv:
        content = json.load(open(APPROVED, encoding="utf-8"))
        keep = [x for x in content["items"] if not str(x.get("sourceId", "")).startswith("hisn-")]
        content["items"] = keep + items
        json.dump(content, open(APPROVED, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"انضاف {len(items)} ذكر للملف المعتمد")
    else:
        os.makedirs(os.path.dirname(CANDIDATE), exist_ok=True)
        json.dump({"_readme": "مرشح: أذكار الصباح والمساء من حصن المسلم. ما تنعرض لين نتأكد من إذن إعادة النشر.",
                   "source": "حصن المسلم", "items": items}, open(CANDIDATE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"ملف مرشح: {len(items)} ذكر → {CANDIDATE}")


if __name__ == "__main__":
    main()
