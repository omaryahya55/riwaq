"""
رواق: استيراد كتاب حصن المسلم كامل (سعيد بن علي بن وهف القحطاني رحمه الله) مع مراجعه.

المصدر الرقمي: نسخة IslamHouse.com بصيغة Word (فيها الحواشي = التخريج):
  https://d1.islamhouse.com/data/ar/ih_books/single_01/ar_Hisn_Almuslim.docx
الإذن:
  - المؤلف (صفحة الحقوق، الطبعة ٣٤): التوزيع المجاني بدون حذف أو إضافة أو تغيير، مع كتابة "وقف لله تعالى"
  - IslamHouse (سياسة الاستخدام): بدون تعديل، مع ذكر المصدر
القواعد:
  - نص كل ذكر حرفياً. نشيل بس علامات الحواشي الفاضية "()" (مكانها، مو كلام)
  - المرجع = حاشية الكتاب نفسها حرفياً
  - العنوان = عنوان الباب في الكتاب (نشيل التطويل "ـ" اللي للزينة بس)
  - كل ذكر ياخذ "وقت" حسب بابه (النوم بالليل، الطعام وقت الغدا والعشا، الأذان وقت الأذان...)

الاستخدام:  python tools/import-hisn.py
"""
import json
import os
import re
import sys
import urllib.request
import zipfile
import io
from datetime import date

URL = "https://d1.islamhouse.com/data/ar/ih_books/single_01/ar_Hisn_Almuslim.docx"
BOOK_PAGE = "https://islamhouse.com/ar/books/2522/"
UA = "Riwaq/0.1 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"
HERE = os.path.dirname(os.path.abspath(__file__))
APPROVED = os.path.join(HERE, "..", "web", "content", "approved.json")
AR = "٠١٢٣٤٥٦٧٨٩"
ar = lambda n: "".join(AR[int(c)] for c in str(n))

# وقت كل باب (بالكلمات اللي في عنوانه). الترتيب مهم: أول تطابق يفوز
CONTEXTS = [
    ("adhkar", ["الصباح والمساء"]),
    ("wake", ["الاستيقاظ"]),
    ("sleep", ["النوم", "تقلب ليلا", "تقلّب ليلاً", "الفزع", "الرؤيا"]),
    ("afterPrayer", ["بعد السلام"]),
    ("adhan", ["الأذان"]),
    ("mosque", ["المسجد"]),
    ("iftar", ["إفطار", "أفطر"]),
    ("meal", ["الطعام", "الضيف", "اللبن", "سقاه", "أطعمه"]),
    ("rain", ["المطر", "الرعد", "الاستسقاء", "مطر"]),
    ("wind", ["الريح"]),
    ("newMoon", ["الهلال"]),
    ("leaveHome", ["الخروج من المنزل"]),
    ("enterHome", ["دخول المنزل"]),
    ("prayer", ["الاستفتاح", "الركوع", "السجود", "السجدتين", "التشهد", "القنوت", "الوتر", "التلاوة"]),
]


SITE = "https://www.hisnmuslim.com/api/ar/"
# رموز خطوط خاصة (مثل خط المصحف) تطلع مكسورة على التلفزيون: أي نص فيها ما نعرضه
# (﴿ ﴾ أقواس الآيات العادية مسموحة)
UNCLEAN = re.compile(r"[A-Za-z%$#@&^~|\\<>=_ﭐ-ﴽ﵀-﷿ﹰ-﻿]")


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return json.loads(urllib.request.urlopen(req, timeout=25).read().decode("utf-8-sig"))


def site_texts():
    """نص كل ذكر من hisnmuslim.com (نفس ترقيم الكتاب، وحروفه عادية مو رموز خطوط)"""
    import time
    out = {}
    for ch in fetch_json(SITE + "husn_ar.json")["العربية"]:
        try:
            data = fetch_json(ch["TEXT"].replace("http://", "https://"))
            for it in next(iter(data.values())):
                out[int(it["ID"])] = (it.get("ARABIC_TEXT") or "").strip()
        except Exception as e:
            print("تخطي باب:", ch.get("TITLE"), e)
        time.sleep(0.4)
    return out


def strip_diacritics(s):
    return re.sub(r"[ؐ-ًؚ-ٰٟـ]", "", s)


def context_of(title):
    plain = strip_diacritics(title)
    for ctx, keys in CONTEXTS:
        if any(strip_diacritics(k) in plain for k in keys):
            return ctx
    return "general"


def runs_text(xml):
    return "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(req, timeout=60).read()))
    doc = z.read("word/document.xml").decode("utf-8")
    fx = z.read("word/footnotes.xml").decode("utf-8")

    foot = {}
    for m in re.finditer(r'<w:footnote [^>]*w:id="(-?\d+)"[^>]*>(.*?)</w:footnote>', fx, flags=re.S):
        foot[m.group(1)] = re.sub(r"^\(\)\s*", "", runs_text(m.group(2)).strip()).strip()

    heading_re = re.compile(r"^(\d+)\s*ـ\s*(.+)$")
    item_re = re.compile(r"^(\d+)\s*-\s*(?:\(\d+\))?\s*")
    items, title, cur = [], "", None
    for p in re.findall(r"<w:p[ >].*?</w:p>", doc, flags=re.S):
        tx = runs_text(p).strip()
        if not tx:
            continue
        refs = re.findall(r'w:footnoteReference w:id="(\d+)"', p)
        h = heading_re.match(tx)
        it = item_re.match(tx)
        # بعض العناوين مكتوبة بشرطة بدل "ـ" (مثل الباب ١١٠): الرقم اللي ما يكمل التسلسل عنوان، مو ذكر
        expected = (items[-1]["n"] + 1) if items else 1
        if it and int(it.group(1)) != expected:
            h, it = re.match(r"^(\d+)\s*-\s*(.+)$", tx), None
        if h and not it:
            title = re.sub(r"\s+", " ", h.group(2).replace("ـ", "")).strip()
            cur = None
            continue
        if it:
            cur = {"n": int(it.group(1)), "title": title, "parts": [tx[it.end():]], "refs": refs}
            items.append(cur)
        elif cur is not None and title:
            # تكملة نفس الذكر في فقرة ثانية
            cur["parts"].append(tx)
            cur["refs"] += refs

    site = site_texts()
    print("نصوص الموقع:", len(site))
    seen, out, skipped = set(), [], []
    for it in items:
        if it["n"] in seen:
            break  # بعد آخر ذكر (فهرس أو تكرار)
        seen.add(it["n"])
        docx_text = re.sub(r"\s*\(\s*\)", "", "\n".join(it["parts"])).strip()  # علامات الحواشي الفاضية بس
        # النص: من الموقع إذا نظيف، وإلا من ملف Word إذا نظيف، وإلا ما نعرضه أبداً (ما نصلح بإيدنا)
        candidates = [(site.get(it["n"], ""), "hisnmuslim.com"), (docx_text, "IslamHouse.com")]
        text, text_src = next(((tx, s) for tx, s in candidates if tx and not UNCLEAN.search(tx)), ("", ""))
        if not text:
            skipped.append(it["n"])
            continue
        notes = [foot.get(r, "") for r in it["refs"] if foot.get(r)]
        out.append({
            "type": "adhkar" if context_of(it["title"]) == "adhkar" else "dua",
            "context": context_of(it["title"]),
            "title": it["title"],
            "number": it["n"],
            "text": text,
            "reference": notes[-1] if notes else "",
            "notes": notes,
            "source": f"حصن المسلم · رقم {ar(it['n'])}",
            "edition": f"حصن المسلم (القحطاني) · النص: {text_src} · التخريج: IslamHouse.com",
            "verifyUrl": BOOK_PAGE,
            "sourceId": f"hisn-{it['n']}",
            "approved": True,
            "fetchedAt": date.today().isoformat()
        })
    # الأرقام لازم تكون متسلسلة (مع المتروكة) عشان نتأكد إن القراءة صحيحة
    nums = sorted([x["number"] for x in out] + skipped)
    assert nums == list(range(1, len(nums) + 1)), "الترقيم مو متسلسل، راجع القراءة"
    print("متروك (رموز خطوط في المصدرين):", [ar(n) for n in skipped] or "لا شي")

    content = json.load(open(APPROVED, encoding="utf-8"))
    keep = [x for x in content["items"] if not str(x.get("sourceId", "")).startswith("hisn-")]
    content["items"] = keep + out
    json.dump(content, open(APPROVED, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    from collections import Counter
    print(f"حصن المسلم: {len(out)} ذكر (من ١ إلى {ar(len(nums))})")
    print("حسب الوقت:", dict(Counter(x["context"] for x in out)))


if __name__ == "__main__":
    main()
