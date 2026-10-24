/*
 * أوقات الصلاة: تنحسب على الجهاز بمكتبة adhan-js (MIT). تشتغل بدون نت.
 * أم القرى: الفجر 18.5°، والعشاء ٩٠ دقيقة بعد المغرب، و+٣٠ دقيقة للعشاء في رمضان
 * (توصية adhan-js نفسها في METHODS.md، البريف قسم ٤).
 */
(function () {
  // الطريقة حسب الدولة. اللي مو موجود هنا = رابطة العالم الإسلامي، والمستخدم يقدر يغيّرها
  const BY_COUNTRY = {
    SA: "UmmAlQura", AE: "Dubai", KW: "Kuwait", QA: "Qatar",
    EG: "Egyptian", PK: "Karachi", TR: "Turkey", SG: "Singapore",
    US: "NorthAmerica", CA: "NorthAmerica"
  };
  const METHOD_NAMES = {
    UmmAlQura: "أم القرى", Dubai: "دبي", Kuwait: "الكويت", Qatar: "قطر", Egyptian: "الهيئة المصرية",
    Karachi: "كراتشي", Turkey: "تركيا", Singapore: "سنغافورة", NorthAmerica: "أمريكا الشمالية",
    MuslimWorldLeague: "رابطة العالم الإسلامي", MoonsightingCommittee: "لجنة رؤية الهلال", Tehran: "طهران"
  };
  const ORDER = [
    { id: "fajr", name: "الفجر" }, { id: "sunrise", name: "الشروق", notPrayer: true }, { id: "dhuhr", name: "الظهر" },
    { id: "asr", name: "العصر" }, { id: "maghrib", name: "المغرب" }, { id: "isha", name: "العشاء" }
  ];

  function methodId() {
    if (CONFIG.method && CONFIG.method !== "auto") return CONFIG.method;
    return BY_COUNTRY[(CONFIG.city && CONFIG.city.country) || ""] || "MuslimWorldLeague";
  }

  // التاريخ "المحلي" للمدينة كـ Date في منتصف اليوم (adhan يحتاج يوم/شهر/سنة)
  function cityDay(now, plusDays) {
    const p = F.parts(new Date(now.getTime() + (plusDays || 0) * 86400000), { year: "numeric", month: "numeric", day: "numeric" });
    return new Date(+p.year, +p.month - 1, +p.day);
  }

  function timesFor(now, plusDays) {
    if (!CONFIG.city || !window.adhan) return null;
    const id = methodId();
    const params = adhan.CalculationMethod[id] ? adhan.CalculationMethod[id]() : adhan.CalculationMethod.MuslimWorldLeague();
    const day = cityDay(now, plusDays);
    // رمضان مع أم القرى: العشاء +٣٠
    if (id === "UmmAlQura" && F.hijriParts(new Date(day.getTime() + 12 * 3600000)).m === 9) params.adjustments.isha = 30;
    const pt = new adhan.PrayerTimes(new adhan.Coordinates(CONFIG.city.lat, CONFIG.city.lon), day, params);
    return ORDER.map((o) => Object.assign({ at: pt[o.id] }, o));
  }

  function next(now) {
    const today = timesFor(now, 0);
    if (!today) return null;
    for (const p of today) if (!p.notPrayer && p.at > now) return { p, mins: (p.at - now) / 60000, today };
    const tomorrow = timesFor(now, 1);
    const fajr = tomorrow[0];
    return { p: fajr, mins: (fajr.at - now) / 60000, today };
  }

  window.Prayer = { timesFor, next, methodId, METHOD_NAMES, BY_COUNTRY };
})();
