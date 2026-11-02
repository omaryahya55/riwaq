"""
رواق: قائمة الشيوخ والسور لشاشة القرآن (web/js/tilawa-data.js).
أسماء السور وعدد الآيات من واجهة Al Quran Cloud كما هي، بدون كتابة يدوية. ونتأكد إن تلاوة كل شيخ
موجودة فعلاً على شبكة Islamic Network قبل ما يدخل القائمة. الصوت يشتغل مباشرة من شبكتهم وما ينحفظ عندنا.
شروطهم: https://alquran.cloud/terms-and-conditions
الاستخدام: python tools/import-tilawa.py
"""
import concurrent.futures as cf
import json
import os
import sys
import urllib.request

API = "https://api.alquran.cloud/v1"
CDN = "https://cdn.islamic.network/quran"
UA = {"User-Agent": "Riwaq/0.3 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"}
# id النسخة عندهم، الاسم المعروض، النوع (s سورة كاملة، v آية آية)، جودة الصوت، وصف اختياري
RECITERS = [
    ("ar.abdurrahmaansudais", "عبد الرحمن السديس", "v", 64, ""),
    ("ar.saudalshuraim", "سعود الشريم", "s", 128, ""),
    ("ar.mahermuaiqly", "ماهر المعيقلي", "v", 128, ""),
    ("ar.alafasy", "مشاري العفاسي", "s", 128, ""),
    ("ar.yasseraldossari", "ياسر الدوسري", "s", 128, ""),
    ("ar.nasseralqatami", "ناصر القطامي", "s", 128, ""),
    ("ar.abdullahawadaljuhani", "عبد الله الجهني", "s", 128, ""),
    ("ar.salahalbudair", "صلاح البدير", "s", 128, ""),
    ("ar.abdulbariaththubaity", "عبد الباري الثبيتي", "s", 128, ""),
    ("ar.aliabdurrahmanalhuthaify", "علي الحذيفي", "s", 128, ""),
    ("ar.khalidaljalil", "خالد الجليل", "s", 128, ""),
    ("ar.ahmedalajmi", "أحمد العجمي", "s", 128, ""),
    ("ar.ibrahimaldossari", "إبراهيم الدوسري", "s", 128, ""),
    ("ar.mohamedalmohisni", "محمد المحيسني", "s", 128, ""),
    ("ar.muhammadayyub", "محمد أيوب", "s", 128, ""),
    ("ar.abdullahkhayat", "عبد الله خياط", "s", 128, ""),
    ("ar.adilkalbani", "عادل الكلباني", "s", 128, ""),
    ("ar.haniarrifai", "هاني الرفاعي", "s", 128, ""),
    ("ar.husary", "محمود خليل الحصري", "v", 128, "مرتّل"),
    ("ar.abdulsamad", "عبد الباسط عبد الصمد", "v", 64, "مرتّل"),
    ("ar.abdulbasitmujawwad", "عبد الباسط عبد الصمد", "s", 128, "مجوّد"),
    ("ar.minshawi", "محمد صديق المنشاوي", "v", 128, "مرتّل"),
    ("ar.muhammadsiddiqalminshawimujawwad", "محمد صديق المنشاوي", "s", 128, "مجوّد"),
    ("ar.mustafaismail", "مصطفى إسماعيل", "s", 128, "مجوّد"),
    ("ar.mohamedtablawi", "محمد الطبلاوي", "s", 128, ""),
    ("ar.mahmoudalialbanna", "محمود علي البنا", "s", 128, ""),
]


def ok(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers=UA, method="HEAD"), timeout=20).status == 200
    except Exception:
        return False


def check(r):
    # أول وآخر السور وبعض الوسط: لو شي منها ناقص الشيخ ما يدخل
    edition, kind, rate = r[0], r[2], r[3]
    samples = [f"{CDN}/audio-surah/{rate}/{edition}/{n}.mp3" for n in (1, 2, 18, 36, 67, 114)] if kind == "s" \
        else [f"{CDN}/audio/{rate}/{edition}/{n}.mp3" for n in (1, 293, 2140, 3706, 5242, 6236)]
    return r, all(ok(u) for u in samples)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = json.load(urllib.request.urlopen(urllib.request.Request(API + "/surah", headers=UA), timeout=30))["data"]
    assert len(data) == 114 and sum(s["numberOfAyahs"] for s in data) == 6236
    surahs = [{"n": s["number"], "name": s["name"], "ayahs": s["numberOfAyahs"]} for s in data]
    with cf.ThreadPoolExecutor(8) as ex:
        results = list(ex.map(check, RECITERS))
    missing = [r[1] for r, good in results if not good]
    assert not missing, f"ناقص: {missing}"
    reciters = [{"id": r[0], "name": r[1], "verse": r[2] == "v", "rate": r[3], "style": r[4]} for r, _ in results]
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "js", "tilawa-data.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("/* الشيوخ والسور (أسماء السور من Al Quran Cloud كما هي). يتولد من tools/import-tilawa.py، لا تعدله */\n")
        f.write("window.TILAWA = " + json.dumps({"reciters": reciters, "surahs": surahs}, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(len(reciters), "شيخ،", len(surahs), "سورة")


main()
