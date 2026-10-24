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
import sys
import urllib.parse
import urllib.request

from PIL import Image

UA = "Riwaq/0.1 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "web", "img", "bg")
OUT_JS = os.path.join(HERE, "..", "web", "js", "backgrounds.js")
FREE = re.compile(r"^(CC BY(-SA)? [\d.]+( [A-Za-z]+)?|CC0( [\d.]+)?|Public domain)$", re.I)

PICKS = {
    "fajr": "File:Ar-Rub' Al-Khali (Oman) kz05.jpg",
    "day": "File:Ar-Rub' Al-Khali (Oman) kz04.jpg",
    "asr": "File:Liwa Desert.JPG",
    "dusk": "File:Sunset over the sand dunes in Dubai's desert (16407012747).jpg",
    "night": "File:February -conservationlands15 Social Media Takeover- Top 15 Places on National Conservation Lands for Night Sky Viewing (16358792937).jpg",
}


def get(url, binary=False):
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read()
    return data if binary else json.loads(data)


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(OUT_DIR, exist_ok=True)
    meta = {}
    for period, title in PICKS.items():
        q = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "titles": title, "prop": "imageinfo",
            "iiprop": "extmetadata|url", "iiurlwidth": "2400", "format": "json"}))
        info = list(q["query"]["pages"].values())[0]["imageinfo"][0]
        md = info.get("extmetadata", {})
        lic = clean(md.get("LicenseShortName", {}).get("value", ""))
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
        path = os.path.join(OUT_DIR, f"{period}.jpg")
        im.save(path, "JPEG", quality=70, optimize=True, progressive=True)
        meta[period] = {"src": f"img/bg/{period}.jpg", "credit": f"{artist} ({lic})", "page": info.get("descriptionurl", "")}
        print("✓", period, lic, os.path.getsize(path) // 1024, "KB")
    open(OUT_JS, "w", encoding="utf-8").write(
        "/* صور الخلفية لكل فترة من اليوم (ويكيميديا كومنز، رخص حرة). يتولد من tools/import-backgrounds.py، لا تعدله */\n"
        "window.BACKGROUNDS = " + json.dumps(meta, ensure_ascii=False, indent=1) + ";\n")


if __name__ == "__main__":
    main()
