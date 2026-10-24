"""
رواق: "من القرآن الكريم" في الشاشة. نص المصحف من مشروع Tanzil (tanzil.net) حرفياً.

شروط Tanzil (مكتوبة في آخر الملف اللي ننزله، رخصة CC BY 3.0):
  - النسخ والتوزيع حرفياً مسموح، والتغيير ممنوع
  - نذكر المصدر (Tanzil Project) ونحط رابط tanzil.net
  - نحط إشعار الحقوق مع النص (موجود في approved.json و NOTICE.md)

وش نعرض (قاعدة ثابتة، مو اختيار يدوي، وكل مقطع كامل عشان ما ينقطع المعنى عن سياقه):
  - الفاتحة، وآية الكرسي، وآخر آيتين من البقرة (فضلها ثابت في الصحيح)
  - السور الكاملة من جزء عمّ اللي تدخل في مساحة الشاشة
النص: النسخة "البسيطة" من Tanzil بدون علامات الوقف (بعض خطوط التلفزيون ما تعرضها)، والبسملة في سطر لحالها.
بين الآيات نحط رقم الآية ﴿١﴾ مثل المصحف.

الاستخدام:  python tools/import-quran.py
"""
import json
import os
import re
import sys
import urllib.request
from datetime import date

URL = ("https://tanzil.net/pub/download/index.php?marks=false&sajdah=false&rub=false&tatweel=true"
       "&quranType=simple&outType=txt-2&agree=true")
UA = "Riwaq/0.1 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"
HERE = os.path.dirname(os.path.abspath(__file__))
APPROVED = os.path.join(HERE, "..", "web", "content", "approved.json")
META_URL = "https://tanzil.net/res/text/metadata/quran-data.js"
META_JS = os.path.join(HERE, "..", "web", "js", "quran-meta.js")
FULL_JSON = os.path.join(HERE, "..", "web", "content", "quran.json")
AR = "٠١٢٣٤٥٦٧٨٩"
ar = lambda n: "".join(AR[int(c)] for c in str(n))
MAX_PLAIN = 400  # حروف بدون تشكيل: أطول من كذا ما يدخل في خانة الشاشة

NAMES = {1: "الفاتحة", 2: "البقرة", 86: "الطارق", 87: "الأعلى", 88: "الغاشية", 90: "البلد", 91: "الشمس", 92: "الليل",
         93: "الضحى", 94: "الشرح", 95: "التين", 96: "العلق", 97: "القدر", 98: "البينة", 99: "الزلزلة",
         100: "العاديات", 101: "القارعة", 102: "التكاثر", 103: "العصر", 104: "الهمزة", 105: "الفيل",
         106: "قريش", 107: "الماعون", 108: "الكوثر", 109: "الكافرون", 110: "النصر", 111: "المسد",
         112: "الإخلاص", 113: "الفلق", 114: "الناس"}


def plain(t):
    return re.sub(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]", "", t)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    notice = "\n".join(l[1:].rstrip() for l in raw.splitlines() if l.startswith("#")).strip()
    assert "CHANGING IT IS NOT ALLOWED" in notice, "إشعار Tanzil تغيّر، اقرأ الشروط من جديد"
    Q = {}
    for l in raw.splitlines():
        m = re.match(r"^(\d+)\|(\d+)\|(.+)$", l.strip())
        if m:
            Q.setdefault(int(m[1]), {})[int(m[2])] = m[3]
    assert len(Q) == 114 and sum(len(v) for v in Q.values()) == 6236, "عدد السور أو الآيات غلط"

    def passage(s, a, b):
        ayat = [Q[s][i] for i in range(a, b + 1)]
        basmala = ""
        bsm = Q[1][1]  # البسملة بنفس حروف Tanzil (أول آية في الفاتحة)
        if a == 1 and s not in (1, 9) and ayat[0].startswith(bsm + " "):
            basmala, ayat[0] = bsm, ayat[0][len(bsm) + 1:]
        body = " ".join(f"{t} ﴿{ar(a + i)}﴾" for i, t in enumerate(ayat))
        whole = a == 1 and b == len(Q[s])
        return {
            "type": "quran",
            "context": "general",
            "title": "من القرآن الكريم",
            "text": (basmala + "\n" if basmala else "") + body,
            "reference": "",
            "source": f"سورة {NAMES[s]}" + ("" if whole else f" · {'الآية' if a == b else 'الآيات'} {ar(a)}" + ("" if a == b else f"–{ar(b)}")),
            "edition": "Tanzil.net",
            "verifyUrl": f"https://tanzil.net/#{s}:{a}",
            "sourceId": f"quran-{s}-{a}",
            "approved": True,
            "fetchedAt": date.today().isoformat()
        }

    out = [passage(1, 1, 7), passage(2, 255, 255), passage(2, 285, 286)]
    for s in range(78, 115):
        if s in NAMES and sum(len(plain(t)) for t in Q[s].values()) <= MAX_PLAIN:
            out.append(passage(s, 1, len(Q[s])))
    missing = [s for s in range(78, 115) if sum(len(plain(t)) for t in Q[s].values()) <= MAX_PLAIN and s not in NAMES]
    assert not missing, f"سور قصيرة بدون اسم: {missing}"

    # المصحف كامل لـ"راجع محفوظك" و"ذكر الوقت" (نفس نص Tanzil حرفياً) + بيانات السور والأجزاء والأحزاب من Tanzil
    req = urllib.request.Request(META_URL, headers={"User-Agent": UA})
    meta_js = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    def block(name):
        body = re.search(r"QuranData\." + name + r" = \[(.*?)\n\];", meta_js, re.S).group(1)
        return [r for r in re.findall(r"\[([^\[\]]+)\]", body) if re.match(r"\s*\d", r)]
    suras = [[int(r.split(",")[1]), r.split(",")[4].strip().strip("'\"")] for r in block("Sura")[:114]]
    juz = [[int(x) for x in r.split(",")] for r in block("Juz")][:30]
    quarters = [[int(x) for x in r.split(",")] for r in block("HizbQaurter")][:240]
    assert len(suras) == 114 and all(n == len(Q[i + 1]) for i, (n, _) in enumerate(suras)), "بيانات السور ما تطابق النص"
    assert len(juz) == 30 and len(quarters) == 240, "بيانات الأجزاء أو الأحزاب غلط"
    meta = {"suras": [{"name": nm, "ayat": n} for n, nm in suras], "juz": juz, "quarters": quarters}
    open(META_JS, "w", encoding="utf-8").write(
        "/* بيانات السور والأجزاء وأرباع الأحزاب من Tanzil.net (CC BY 3.0). يتولد من tools/import-quran.py، لا تعدله */\n"
        "window.QURAN_META = " + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ";\n")
    full = {"_notice": notice, "source": "Tanzil.net (simple)", "basmala": Q[1][1],
            "suras": [[Q[s][a] for a in range(1, len(Q[s]) + 1)] for s in range(1, 115)]}
    json.dump(full, open(FULL_JSON, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    content = json.load(open(APPROVED, encoding="utf-8"))
    keep = [x for x in content["items"] if not str(x.get("sourceId", "")).startswith("quran-")]
    content["items"] = keep + out
    content["_quranNotice"] = notice
    json.dump(content, open(APPROVED, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"القرآن: {len(out)} مقطع →", ", ".join(x["source"] for x in out))


if __name__ == "__main__":
    main()
