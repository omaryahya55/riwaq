"""
رواق: "حكاية مكان": صورة مكان إسلامي أو تاريخي ونبذة قصيرة عنه.

المصدر:
  - النص: أول جملة من مقدمة المقالة في ويكيبيديا العربية، حرفياً (بدون أي تعديل).
    الرخصة CC BY-SA 4.0: نذكر المصدر والرخصة تحت النص، والنص المنقول يبقى بنفس الرخصة.
  - الصورة: صورة المقالة من ويكيميديا كومنز، بس إذا رخصتها حرة (CC BY أو CC BY-SA أو CC0 أو ملك عام)،
    مع اسم المصوّر والرخصة. الصور تنحفظ داخل التطبيق (تشتغل بدون نت).
قائمة الأماكن ثابتة هنا (أسماء مقالات)، وأي مكان ما له صورة حرة أو نص ما ينضاف.

ملاحظة: ويكيبيديا مو كتاب معتمد، فناخذ أول جملة بس (تعريف المكان)، والمستخدم يقدر يطفي الخانة من الإعدادات.

الاستخدام:  python tools/import-places.py
"""
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

UA = "Riwaq/0.1 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"
HERE = os.path.dirname(os.path.abspath(__file__))
APPROVED = os.path.join(HERE, "..", "web", "content", "approved.json")
IMG_DIR = os.path.join(HERE, "..", "web", "img", "places")
MAX_PLAIN = 420
FREE = re.compile(r"^(CC BY(-SA)? [\d.]+( [A-Za-z]+)?|CC0( [\d.]+)?|Public domain|PD.*)$", re.I)

PLACES = [
    "المسجد الحرام", "الكعبة", "المسجد النبوي", "المسجد الأقصى", "قبة الصخرة", "مسجد قباء",
    "جبل أحد", "غار حراء", "جبل عرفات", "بئر زمزم", "مسجد القبلتين", "الجامع الأموي",
    "الجامع الأزهر", "جامع عقبة بن نافع", "جامع السلطان أحمد", "جامع الشيخ زايد الكبير",
    "مسجد الحسن الثاني", "قصر الحمراء", "مدائن صالح", "حي الطريف", "جدة التاريخية", "جامع القرويين",
]


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            data = urllib.request.urlopen(req, timeout=30).read()
            return data if binary else json.loads(data.decode("utf-8"))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(4)


def first_sentences(text):
    """أول جملة كاملة بس (التعريف): أقل تفاصيل = أقل احتمال خطأ، وما نقص جملة من نصها"""
    parts = re.findall(r"[^.!؟]+[.!؟]+", text.replace("\n", " "))
    out = ""
    for p in parts:
        cand = (out + " " + p.strip()).strip()
        plain = re.sub(r"[ً-ٰٟ]", "", cand)
        if len(plain) > MAX_PLAIN:
            break
        out = cand
        break  # جملة وحدة
    return out


def save_image(data, path):
    """نصغّر الصورة (عرض ٨٠٠، جودة ٧٢) عشان التطبيق يبقى خفيف. بدون Pillow: نحفظها زي ما هي"""
    try:
        import io
        from PIL import Image
        im = Image.open(io.BytesIO(data)).convert("RGB")
        im.thumbnail((800, 800))
        im.save(path, "JPEG", quality=72, optimize=True, progressive=True)
    except ImportError:
        open(path, "wb").write(data)


def clean_html(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(IMG_DIR, exist_ok=True)
    out, skipped = [], []
    for i, title in enumerate(PLACES):
        time.sleep(1)
        try:
            s = get("https://ar.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_")))
        except Exception as e:
            skipped.append((title, "ما لقينا المقالة")); continue
        text = first_sentences(s.get("extract", ""))
        img = (s.get("originalimage") or s.get("thumbnail") or {}).get("source", "").split("?")[0]
        if not text or not img:
            skipped.append((title, "بدون نص أو صورة")); continue
        fname = urllib.parse.unquote(img.split("/")[-1])
        if "/thumb/" in img:  # رابط مصغّر: اسم الملف قبل آخر جزء
            fname = urllib.parse.unquote(img.split("/")[-2])
        time.sleep(1)
        q = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "titles": "File:" + fname, "prop": "imageinfo",
            "iiprop": "extmetadata|url", "iiurlwidth": "900", "format": "json"}))
        pages = list(q.get("query", {}).get("pages", {}).values())
        info = (pages[0].get("imageinfo") or [{}])[0] if pages else {}
        md = info.get("extmetadata", {})
        lic = clean_html(md.get("LicenseShortName", {}).get("value", ""))
        artist = clean_html(md.get("Artist", {}).get("value", ""))[:60]
        thumb = info.get("thumburl", "")
        if not FREE.match(lic) or not thumb:
            skipped.append((title, f"رخصة الصورة: {lic or 'غير معروفة'}")); continue
        ext = ".jpg"
        local = f"place-{i + 1:02d}{ext}"
        time.sleep(1)
        save_image(get(thumb, binary=True), os.path.join(IMG_DIR, local))
        page = s.get("content_urls", {}).get("desktop", {}).get("page", "")
        out.append({
            "type": "place",
            "context": "general",
            "title": f"حكاية مكان · {s.get('title', title)}",
            "text": text,
            "reference": "",
            "image": f"img/places/{local}",
            "imageCredit": f"الصورة: {artist or 'ويكيميديا كومنز'} ({lic})",
            "source": "ويكيبيديا العربية (CC BY-SA 4.0)",
            "edition": "",
            "verifyUrl": page,
            "sourceId": f"place-{i + 1:02d}",
            "approved": True,
            "fetchedAt": date.today().isoformat()
        })
        print("✓", title, "·", lic)
    content = json.load(open(APPROVED, encoding="utf-8"))
    keep = [x for x in content["items"] if not str(x.get("sourceId", "")).startswith("place-")]
    content["items"] = keep + out
    json.dump(content, open(APPROVED, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"حكاية مكان: {len(out)} مكان")
    for t, why in skipped:
        print("  ✗", t, "·", why)


if __name__ == "__main__":
    main()
