"""
رواق: قائمة الشيوخ والسور لشاشة القرآن (web/js/tilawa-data.js).
أسماء السور وعدد الآيات من واجهة Al Quran Cloud كما هي، بدون كتابة يدوية.
التلاوات من واجهة mp3quran.net العامة للمطورين: نتأكد إن كل شيخ عنده ١١٤ سورة وإن الملفات موجودة قبل ما يدخل القائمة.
الصوت يشتغل مباشرة من شبكتهم وما ينحفظ عندنا. صفحة التواصل عندهم تقول: «حقوق الموقع متاحة للجميع حتى ولو كانت لإغراض تجارية»: https://www.mp3quran.net/ar/contact-us
الاستخدام: python tools/import-tilawa.py
"""
import concurrent.futures as cf
import json
import os
import re
import sys
import urllib.request

UA = {"User-Agent": "Riwaq/0.3 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"}
# رقم الشيخ عندهم، الاسم المعروض، جزء من اسم المصحف، وصف اختياري
RECITERS = [
    (54, "عبد الرحمن السديس", "مرتل", ""),
    (31, "سعود الشريم", "مرتل", ""),
    (102, "ماهر المعيقلي", "مرتل", ""),
    (92, "ياسر الدوسري", "مرتل", ""),
    (217, "بندر بليلة", "مرتل", ""),
    (254, "بدر التركي", "مرتل", ""),
    (86, "ناصر القطامي", "مرتل", ""),
    (62, "عبد الله الجهني", "مرتل", ""),
    (43, "صلاح البدير", "مرتل", ""),
    (49, "عبد الباري الثبيتي", "مرتل", ""),
    (74, "علي الحذيفي", "مرتل", ""),
    (20, "خالد الجليل", "مرتل", ""),
    (178, "إبراهيم الدوسري", "مرتل", ""),
    (108, "محمد المحيسني", "مرتل", ""),
    (109, "محمد أيوب", "مرتل", ""),
    (61, "عبد الله خياط", "مرتل", ""),
    (160, "عادل الكلباني", "مرتل", ""),
    (89, "هاني الرفاعي", "مرتل", ""),
    (118, "محمود خليل الحصري", "مرتل", "مرتّل"),
    (51, "عبد الباسط عبد الصمد", "مرتل", "مرتّل"),
    (51, "عبد الباسط عبد الصمد", "المجود", "مجوّد"),
    (112, "محمد صديق المنشاوي", "مرتل", "مرتّل"),
    (112, "محمد صديق المنشاوي", "المجود", "مجوّد"),
    (125, "مصطفى إسماعيل", "المجود", "مجوّد"),
    (106, "محمد الطبلاوي", "مرتل", ""),
    (121, "محمود علي البنا", "مرتل", ""),
]


def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40))


def ok(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers=UA, method="HEAD"), timeout=25).status == 200
    except Exception:
        return False


def resolve(r, all_reciters):
    rid, name, part, style = r
    who = next((x for x in all_reciters if x["id"] == rid), None)
    if not who:
        return r, None
    ms = next((m for m in who["moshaf"] if "حفص" in m["name"] and part in m["name"] and m["surah_total"] == 114), None)
    if not ms:
        return r, None
    m = re.fullmatch(r"https://cdn\.mp3quran\.net/audio/([a-z0-9-]+/r\d{1,2})/", ms["server"])
    if not m or not all(ok(f"{ms['server']}{n:03d}.mp3") for n in (1, 2, 18, 36, 67, 114)):
        return r, None
    return r, {"id": m[1], "name": name, "verse": False, "rate": 128, "style": style}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = get("https://api.alquran.cloud/v1/surah")["data"]
    assert len(data) == 114 and sum(s["numberOfAyahs"] for s in data) == 6236
    surahs = [{"n": s["number"], "name": s["name"], "ayahs": s["numberOfAyahs"]} for s in data]
    all_reciters = get("https://www.mp3quran.net/api/v3/reciters?language=ar")["reciters"]
    with cf.ThreadPoolExecutor(8) as ex:
        results = list(ex.map(lambda r: resolve(r, all_reciters), RECITERS))
    missing = [(r[1], r[2]) for r, got in results if not got]
    assert not missing, f"ناقص: {missing}"
    reciters = [got for _, got in results]
    # رقم الشيخ في توقيت الآيات (ayat_timing): من نفس مجلد الصوت. اللي ما له توقيت ما يعرض رقم آية
    reads = get("https://www.mp3quran.net/api/v3/ayat_timing/reads")
    by = {}
    for rd in reads:
        mm = re.search(r"/audio/([a-z0-9-]+/r\d{1,2})/", rd.get("folder_url", ""))
        if mm and rd.get("soar_count", 0) >= 114:
            by[mm[1]] = rd["id"]
    for rc in reciters:
        if rc["id"] in by:
            rc["t"] = by[rc["id"]]
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "js", "tilawa-data.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("/* الشيوخ (mp3quran.net) والسور (Al Quran Cloud). يتولد من tools/import-tilawa.py، لا تعدله */\n")
        f.write("window.TILAWA = " + json.dumps({"reciters": reciters, "surahs": surahs}, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(len(reciters), "تلاوة،", len(surahs), "سورة")


main()
