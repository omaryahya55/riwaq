"""
رواق: استيراد حديث اليوم من sunnah.com (يشتغل بعد ما يوصل المفتاح).

القواعد (docs/CONTENT.md):
- النص ينقل حرفياً كما هو من sunnah.com. ما نعدّل ولا حرف.
- صحيح البخاري ومسلم بس.
- كل عنصر معه: الكتاب، والرقم، ورابط التحقق.
- المفتاح من متغير البيئة SUNNAH_API_KEY، ما ينكتب في الملف ولا في المستودع أبداً.

الاستخدام:
    set SUNNAH_API_KEY=...        (في PowerShell: $env:SUNNAH_API_KEY="...")
    python tools/import-hadith.py tools/hadith-picks.txt

hadith-picks.txt: سطر لكل حديث بالشكل  bukhari:1  أو  muslim:2564
(القائمة نفسها نختارها: أحاديث قصيرة تناسب الشاشة).
"""
import json
import os
import sys
import time
import urllib.request

API = "https://api.sunnah.com/v1"
BOOKS = {"bukhari": "صحيح البخاري", "muslim": "صحيح مسلم"}
OUT = os.path.join(os.path.dirname(__file__), "..", "web", "content", "approved.json")


def fetch(collection, number, key):
    req = urllib.request.Request(f"{API}/collections/{collection}/hadiths/{number}", headers={"X-API-Key": key})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def arabic_body(data):
    for h in data.get("hadith", []):
        if h.get("lang") == "ar":
            return h.get("body", "")
    return ""


def main():
    key = os.environ.get("SUNNAH_API_KEY")
    if not key:
        sys.exit("حط المفتاح في SUNNAH_API_KEY أول")
    picks = [l.strip() for l in open(sys.argv[1], encoding="utf-8") if l.strip() and not l.startswith("#")]

    content = json.load(open(OUT, encoding="utf-8"))
    items = [x for x in content.get("items", []) if x.get("type") != "hadith"]

    for p in picks:
        collection, number = p.split(":")
        if collection not in BOOKS:
            sys.exit(f"كتاب غير مسموح: {p} (البخاري ومسلم بس)")
        data = fetch(collection, number, key)
        body = arabic_body(data)
        if not body:
            sys.exit(f"ما لقينا النص العربي: {p}")
        items.append({
            "type": "hadith",
            "text": body,  # حرفياً من المصدر. التنظيف من وسوم HTML بس يصير وقت العرض
            "source": f"{BOOKS[collection]}، رقم {number}",
            "edition": "sunnah.com",
            "verifyUrl": f"https://sunnah.com/{collection}:{number}",
            "approved": True,
            "reviewedBy": "",
            "reviewedAt": ""
        })
        print("✓", p)
        time.sleep(1.1)  # طلب واحد بالثانية (اللي طلبناه منهم)

    content["items"] = items
    json.dump(content, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"انحفظ {len(picks)} حديث في {OUT}")


if __name__ == "__main__":
    main()
