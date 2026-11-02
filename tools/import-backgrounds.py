"""
رواق: صور خلفية حقيقية لكل فترة من اليوم (فجر، نهار، عصر، مغرب، ليل).

المصدر: ويكيميديا كومنز، والصور اخترناها بالعين (صحراء وسماء، بدون ناس ولا طرق ولا أعمدة).
ما نقبل إلا رخصة حرة (CC BY أو CC BY-SA أو CC0 أو ملك عام)، واسم المصوّر والرخصة ينكتبون تحت الشاشة.
الصورة تنقص لنسبة الشاشة (١٦:٩) من النص وتصغر لـ ١٩٢٠×١٠٨٠ عشان التطبيق يبقى خفيف.

الاستخدام:  python tools/import-backgrounds.py   (يحتاج Pillow)
"""
import html
import io
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

from PIL import Image

UA = "Riwaq/0.1 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "web", "img", "bg")
OUT_JS = os.path.join(HERE, "..", "web", "js", "backgrounds.js")
FREE = re.compile(r"^(CC BY(-SA)? [\d.]+( [A-Za-z]+)?|CC0( [\d.]+)?|Public domain)$", re.I)

# كل فترة صورتين، تتبدل كل يوم (Scene). كلها صحراء وسماء، بدون ناس ولا طرق
PICKS = {
    "fajr": ["File:Ar-Rub' Al-Khali (Oman) kz05.jpg", "File:Ar-Rub' Al-Khali (Oman) kz03.jpg"],
    "day": ["File:Ar-Rub' Al-Khali (Oman) kz04.jpg", "File:Rub al Khali 002.JPG"],
    "asr": ["File:Liwa Desert.JPG", "File:Ar-Rub' Al-Khali (Oman) kz01.jpg"],
    "dusk": ["File:Uruq Bani Ma'arid Reserve, Saudi Arabia (2025).jpg", "File:The massive sand dunes of Rub Al Khali.jpg"],
    "night": ["File:The Gecko's trail.jpg", "File:February -conservationlands15 Social Media Takeover- Top 15 Places on National Conservation Lands for Night Sky Viewing (16358792937).jpg"],
}


def get(url, binary=False):
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read()
    return data if binary else json.loads(data)


def shade(im, period):
    """تدرّج غامق من فوق ومن تحت (نفس التظليل اللي كان طبقة CSS)"""
    from PIL import Image as I
    light = period in ("day", "asr", "fajr")
    stops = [(0, .45 if light else .55), (.38, .12 if light else .25), (.70, .30 if light else .45), (1, .62 if light else .70)]
    h = im.height
    col = []
    for y in range(h):
        f = y / (h - 1)
        for (a, va), (b, vb) in zip(stops, stops[1:]):
            if a <= f <= b:
                col.append(va + (vb - va) * (f - a) / (b - a)); break
    mask = I.new("L", (1, h))
    mask.putdata([int(255 * v) for v in col])
    mask = mask.resize(im.size)
    dark = I.new("RGB", im.size, (6, 8, 14))
    return I.composite(dark, im, mask)


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in os.listdir(OUT_DIR):
        if name.endswith(".jpg"):
            os.remove(os.path.join(OUT_DIR, name))
    meta = {}
    for period, titles in PICKS.items():
        meta[period] = []
        for n, title in enumerate(titles):
            q = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
                "action": "query", "titles": title, "prop": "imageinfo",
                "iiprop": "extmetadata|url", "iiurlwidth": "2400", "format": "json"}))
            info = list(q["query"]["pages"].values())[0]["imageinfo"][0]
            md = info.get("extmetadata", {})
            lic = clean(md.get("LicenseShortName", {}).get("value", "")).replace(" igo", "")
            assert FREE.match(lic), f"{period}: رخصة مو حرة ({lic})"
            artist = clean(md.get("Artist", {}).get("value", ""))[:50] or "ويكيميديا كومنز"
            im = Image.open(io.BytesIO(get(info["thumburl"], binary=True))).convert("RGB")
            # نقص من النص لنسبة ١٦:٩ وبعدها نصغر
            w, h = im.size
            if w / h > 16 / 9:
                nw = int(h * 16 / 9); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
            else:
                nh = int(w * 9 / 16); top = int((h - nh) * 0.3); im = im.crop((0, top, w, top + nh))  # نخلي من السما أكثر
            im = im.resize((1920, 1080), Image.LANCZOS)
            # التظليل (عشان الكلام ينقرا) داخل الصورة نفسها، مو طبقة فوقها: التلفزيون أخف
            im = shade(im, period)
            name = f"{period}-{n + 1}"
            im.save(os.path.join(OUT_DIR, name + ".jpg"), "JPEG", quality=74, optimize=True, progressive=True)
            meta[period].append({"src": f"img/bg/{name}.jpg", "blur": f"img/bg/blur/{name}.jpg", "credit": f"{artist} ({lic})", "page": info.get("descriptionurl", "")})
            print("✓", name, lic, artist[:30])
    # التباين، وبعدها النسخة المموهة الصغيرة (خلفية البطاقات الزجاجية بدون تمويه حي)
    subprocess.check_call([sys.executable, os.path.join(HERE, "check-contrast.py"), "--bake"])
    blur_dir = os.path.join(OUT_DIR, "blur")
    os.makedirs(blur_dir, exist_ok=True)
    from PIL import ImageFilter
    for name in os.listdir(OUT_DIR):
        if name.endswith(".jpg"):
            im = Image.open(os.path.join(OUT_DIR, name)).convert("RGB").resize((480, 270), Image.BILINEAR).filter(ImageFilter.GaussianBlur(7))
            im.save(os.path.join(blur_dir, name), "JPEG", quality=60, optimize=True)
    open(OUT_JS, "w", encoding="utf-8").write(
        "/* صور الخلفية لكل فترة من اليوم (ويكيميديا كومنز، رخص حرة). يتولد من tools/import-backgrounds.py، لا تعدله */\n"
        "window.BACKGROUNDS = " + json.dumps(meta, ensure_ascii=False, indent=1) + ";\n")


if __name__ == "__main__":
    main()
