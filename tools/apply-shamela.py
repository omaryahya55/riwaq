"""
رواق: نبدّل أحاديث الموسوعة الحديثية (HadeethEnc) بنصها من المكتبة الشاملة، مع الراوي والعزو والتخريج والدرجة.

المدخل: ملفات JSON (نتيجة البحث في الشاملة، عنصر لكل حديث: sourceId, status, text, narrator, attribution,
grade, gradeBy, primary{book, book_id, page_id, printed_page, number}, takhrij[], verified).
- النص منقول حرفياً من صفحة الشاملة (من الصحابي لين آخر المتن)، ما نعدّل فيه ولا حرف.
- اللي ما لقيناه في الشاملة (status != found) يبقى من الموسوعة زي ما هو، ونطبع عدده.
- السياق (وقت العرض) والوسوم تبقى زي ما هي.

الاستخدام:
    python tools/apply-shamela.py out-01.json out-02.json ...
لو رجعنا شغلنا import-hadeethenc.py (يرجّع نص الموسوعة)، نعيد تشغيل هذا بعده بنفس الملفات (tools/shamela/).
"""
import json
import os
import re
import sys

OUT = os.path.join(os.path.dirname(__file__), "..", "web", "content", "approved.json")
MARKERS = re.compile(r"\(¬[٠-٩0-9]+\)")  # علامات الحواشي لو بقت (مو من النص)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    found = {}
    for path in sys.argv[1:]:
        for r in json.load(open(path, encoding="utf-8")):
            if r.get("status") == "found" and r.get("text") and r.get("primary"):
                found[str(r["sourceId"])] = r
    content = json.load(open(OUT, encoding="utf-8"))
    done = kept = 0
    for x in content["items"]:
        if x.get("edition") != "HadeethEnc.com":
            continue
        r = found.get(str(x.get("sourceId")))
        if not r:
            kept += 1
            continue
        p = r["primary"]
        text = MARKERS.sub("", r["text"]).strip()
        takhrij = [t for t in (r.get("takhrij") or []) if t.get("book")]
        if not any(t["book"] == p["book"] for t in takhrij):
            takhrij.insert(0, {"book": p["book"], "printed_page": p.get("printed_page", ""), "number": p.get("number", "")})
        x["hadeethencId"] = x.get("sourceId")
        x["text"] = text
        x["narrator"] = (r.get("narrator") or "").strip()
        x["attribution"] = r.get("attribution") or x.get("attribution", "")
        x["grade"] = r.get("grade") or x.get("grade", "")
        x["gradeBy"] = r.get("gradeBy", "")
        x["takhrij"] = takhrij[:4]
        x["reference"] = "\n".join(
            f"{t['book']} ({t.get('printed_page', '')}) ({t.get('number', '')})" for t in takhrij[:4])
        x["source"] = " · ".join(s for s in (x["attribution"], x["grade"]) if s)
        x["edition"] = "المكتبة الشاملة"
        x["shamela"] = {"book_id": p.get("book_id"), "page_id": p.get("page_id"), "book": p["book"]}
        x["verifyUrl"] = f"https://shamela.ws/book/{p.get('book_id')}/{p.get('page_id')}"
        x["verified"] = bool(r.get("verified"))
        done += 1
    content["_readme"] = ("المحتوى الديني المعتمد. منقول حرفياً بدون تعديل: الأحاديث وفضل الصحابة من كتب السنة في المكتبة الشاملة "
                          "(صحيح البخاري ط السلطانية، صحيح مسلم ت عبد الباقي، والسنن) مع الراوي والعزو والتخريج والدرجة، "
                          "واختيارها وتوزيعها على الأوقات من موسوعة الأحاديث النبوية HadeethEnc.com، والأذكار والأدعية من حصن المسلم "
                          "للقحطاني رحمه الله (إذن المؤلف: التوزيع المجاني بدون حذف أو إضافة أو تغيير، مع كتابة: وقف لله تعالى). التحديث بالسكربتات في tools/")
    content["source"] = "المكتبة الشاملة + HadeethEnc.com + حصن المسلم"
    json.dump(content, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"✓ من الشاملة: {done}  ·  باقي من الموسوعة (ما انلقى): {kept}")


if __name__ == "__main__":
    main()
