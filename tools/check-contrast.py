# رواق: يفحص إن النص العاجي ينقرا فوق كل صورة خلفية (تباين ٤٫٥ وفوق في مناطق النص).
#   python tools/check-contrast.py          فحص بس (يطلع رمز خطأ لو فيه صورة ما تكفي)
#   python tools/check-contrast.py --bake   يغمّق الصور اللي ما تكفي، داخل الملف نفسه:
#     التظليل مدموج في الصورة عشان ما نحط طبقة بحجم الشاشة فوقها (تثقّل الرسم على التلفزيون).
# الصور برخص حرة ومكتوب عليها «معدّلة» في الشاشة. يحتاج Pillow.
import os
import sys
from PIL import Image

BG = os.path.join(os.path.dirname(__file__), "..", "web", "img", "bg")
INK = 0.89  # إضاءة #F7F2E8
TARGET = 4.5
# مناطق النص بمقاس المسرح: أعلى الشاشة (التاريخ والساعة والصلوات والنص)، وسطر المصادر تحت
REGIONS = [(40, 640), (1000, 1070)]


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


LUT = [lin(i) for i in range(256)]


def p90(img, y0, y1):
    small = img.crop((0, y0, img.width, y1)).resize((480, max(1, (y1 - y0) // 4)), Image.BILINEAR)
    px = [small.getpixel((x, y)) for y in range(small.height) for x in range(small.width)]
    vals = sorted(0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b] for r, g, b in px)
    return vals[int(len(vals) * 0.9)]


def contrast(l):
    return (INK + 0.05) / (l + 0.05)


def bake(img):
    # أغمق شوي في مناطق النص، ويخف في النص السفلي عشان الصورة تبقى حية
    for f in [x / 100 for x in range(96, 30, -2)]:
        w, h = img.size
        out = Image.new("RGB", img.size)
        src, dst = img.load(), out.load()
        for y in range(h):
            t = y / h
            k = f if t < 0.6 else f + (1 - f) * 0.35 * min(1, (t - 0.6) / 0.15) if t < 0.85 else f
            for x in range(w):
                r, g, b = src[x, y]
                dst[x, y] = (int(r * k), int(g * k), int(b * k))
        if all(contrast(p90(out, a, b)) >= TARGET for a, b in REGIONS):
            return out
    return out


def main():
    do_bake = "--bake" in sys.argv
    bad = 0
    for name in sorted(os.listdir(BG)):
        if not name.endswith(".jpg"):
            continue
        path = os.path.join(BG, name)
        img = Image.open(path).convert("RGB")
        worst = min(contrast(p90(img, a, b)) for a, b in REGIONS)
        if worst < TARGET and do_bake:
            img = bake(img)
            img.save(path, quality=82, optimize=True, progressive=False)
            worst = min(contrast(p90(img, a, b)) for a, b in REGIONS)
        print(f"{name}: {worst:.2f}")
        if worst < TARGET:
            bad += 1
    sys.exit(1 if bad else 0)


main()
