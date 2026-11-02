"""
رواق: مدن مشهورة بدون نت لصفحة الإعدادات (web/js/cities.js).
البيانات من بحث Open-Meteo (GeoNames، CC BY 4.0): الاسم والمنطقة والإحداثيات والمنطقة الزمنية.
باقي المدن تنبحث من الجوال وقت الإعداد. الاستخدام: python tools/import-cities.py
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

CITIES = {
    "SA": ["Riyadh", "Jeddah", "Makkah", "Medina", "Dammam", "Khobar", "Dhahran", "Jubail", "Al Ahsa", "Taif", "Abha", "Khamis Mushait", "Tabuk", "Buraydah", "Unaizah", "Hail", "Najran", "Jazan", "Al Bahah", "Arar", "Sakaka", "Yanbu", "Al Kharj", "Qatif", "Hafar Al-Batin"],
    "AE": ["Dubai", "Abu Dhabi", "Sharjah", "Al Ain", "Ajman", "Ras Al Khaimah", "Fujairah"],
    "KW": ["Kuwait City"], "QA": ["Doha"], "BH": ["Manama"], "OM": ["Muscat", "Salalah"],
    "YE": ["Sanaa", "Aden"], "IQ": ["Baghdad", "Basra", "Erbil", "Mosul"], "JO": ["Amman", "Aqaba"],
    "SY": ["Damascus", "Aleppo"], "LB": ["Beirut"], "PS": ["Jerusalem", "Gaza", "Hebron", "Nablus"],
    "EG": ["Cairo", "Alexandria", "Giza", "Aswan", "Luxor"], "SD": ["Khartoum"], "LY": ["Tripoli", "Benghazi"],
    "TN": ["Tunis"], "DZ": ["Algiers", "Oran"], "MA": ["Rabat", "Casablanca", "Marrakesh", "Fes"], "MR": ["Nouakchott"],
    "TR": ["Istanbul", "Ankara"], "PK": ["Karachi", "Lahore", "Islamabad"], "ID": ["Jakarta"], "MY": ["Kuala Lumpur"],
    "GB": ["London"], "US": ["New York"], "CA": ["Toronto"], "DE": ["Berlin"], "FR": ["Paris"],
}
ALIASES = {"Hail": ["Ha'il", "حائل", "Hayil"], "Jazan": ["Jizan", "جازان", "جيزان", "Jazan City"], "Jerusalem": ["القدس", "East Jerusalem", "Al Quds"]}
UA = "Riwaq/0.3 (+https://github.com/omaryahya55/riwaq; riwaq.app1@gmail.com)"


def search(name, lang):
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({"name": name, "count": 10, "language": lang, "format": "json"})
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30)).get("results", [])


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    out = []
    for country, names in CITIES.items():
        for en in names:
            # بعض المدن تنبحث باسم ثاني (Medina عند GeoNames: Al Madinah)
            hit = None
            for q in [en] + ALIASES.get(en, []):
                hit = next((r for r in search(q, "ar") if r.get("country_code") == country and r.get("timezone")), None)
                if hit:
                    break
            if not hit:
                print("ما لقينا:", country, en)
                continue
            clean = lambda t: (t or "").replace("\u200e", "").replace("\u200f", "").strip()
            out.append({"name": clean(hit["name"]), "en": en, "region": clean(hit.get("admin1")), "lat": round(hit["latitude"], 4), "lon": round(hit["longitude"], 4), "tz": hit["timezone"], "country": country})
            time.sleep(0.15)
    # البحث ما يرجعها بهذا الاسم: إحداثيات المسجد النبوي تقريباً
    if not any(c["en"] == "Medina" for c in out):
        out.insert(3, {"name": "المدينة المنورة", "en": "Medina", "region": "منطقة المدينة المنورة", "lat": 24.4686, "lon": 39.6142, "tz": "Asia/Riyadh", "country": "SA"})
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "js", "cities.js")
    open(path, "w", encoding="utf-8").write("/* مدن مشهورة بدون نت (GeoNames عبر Open-Meteo، CC BY 4.0). يتولد من tools/import-cities.py، لا تعدله */\nwindow.CITIES = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(len(out), "مدينة")


main()
