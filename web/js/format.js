/* تنسيق الأرقام والتواريخ بالعربي. كل شي يمر من هنا عشان الأرقام تطلع عربية (٠١٢٣) في كل الشاشة. */
(function () {
  const TZ = (window.DEMO && DEMO.city.tz) || "Asia/Riyadh";
  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

  // أرقام عربية مع فاصلة عشرية عربية (٫) وفاصلة آلاف (٬)
  function digits(value) {
    return String(value)
      .replace(/[0-9]/g, (d) => AR_DIGITS[d])
      .replace(/\./g, "٫")
      .replace(/,/g, "٬");
  }

  function num(value, fractionDigits = 0) {
    const s = Number(value).toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    });
    return digits(s);
  }

  // أجزاء الوقت في منطقة المدينة (مو منطقة جهاز المستخدم)
  function parts(date, opts) {
    const f = new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: TZ }, opts));
    const out = {};
    f.formatToParts(date).forEach((p) => (out[p.type] = p.value));
    return out;
  }

  function clock(date) {
    const p = parts(date, { hour: "numeric", minute: "2-digit", hour12: true });
    return { h: digits(p.hour), m: digits(p.minute), ampm: p.dayPeriod === "AM" ? "ص" : "م" };
  }

  function minutesOfDay(date) {
    const p = parts(date, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return Number(p.hour) * 60 + Number(p.minute);
  }

  // "14:53" → "٢:٥٣ م"
  function hhmm(str) {
    const [H, M] = str.split(":").map(Number);
    const h12 = ((H + 11) % 12) + 1;
    return { text: digits(h12) + ":" + digits(String(M).padStart(2, "0")), ampm: H < 12 ? "ص" : "م" };
  }

  function hijri(date) {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-arab", {
      timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(date);
  }

  function hijriParts(date) {
    const f = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
      timeZone: TZ, day: "numeric", month: "numeric", year: "numeric"
    });
    const out = {};
    f.formatToParts(date).forEach((p) => (out[p.type] = p.value));
    return { d: parseInt(out.day, 10), m: parseInt(out.month, 10), y: parseInt(out.year, 10) };
  }

  function gregorian(date) {
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", {
      timeZone: TZ, day: "numeric", month: "long", year: "numeric"
    }).format(date);
  }

  function weekday(dateStr) {
    return new Intl.DateTimeFormat("ar-SA", { timeZone: TZ, weekday: "long" }).format(new Date(dateStr + "T12:00:00"));
  }

  // مدة بالدقايق → "٣ س ١٢ د" أو "٣٩ دقيقة"
  function duration(mins) {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h === 0) return digits(m) + " " + (m >= 3 && m <= 10 ? "دقايق" : "دقيقة");
    if (m === 0) return digits(h) + " " + (h >= 3 && h <= 10 ? "ساعات" : "ساعة");
    return digits(h) + " س " + digits(m) + " د";
  }

  // رموز الطقس WMO → وصف عربي + اسم الأيقونة
  const WMO = {
    0: ["صافي", "sun"], 1: ["صافي غالباً", "sun"], 2: ["غائم جزئياً", "partly"], 3: ["غائم", "cloud"],
    45: ["ضباب", "fog"], 48: ["ضباب", "fog"],
    51: ["رذاذ", "rain"], 53: ["رذاذ", "rain"], 55: ["رذاذ", "rain"],
    61: ["مطر خفيف", "rain"], 63: ["مطر", "rain"], 65: ["مطر غزير", "rain"],
    80: ["زخات مطر", "rain"], 81: ["زخات مطر", "rain"], 82: ["زخات غزيرة", "rain"],
    95: ["عاصفة رعدية", "storm"], 96: ["عاصفة رعدية", "storm"], 99: ["عاصفة رعدية", "storm"]
  };
  function weather(code) { return WMO[code] || ["—", "cloud"]; }

  window.F = { digits, num, clock, minutesOfDay, hhmm, hijri, hijriParts, gregorian, weekday, duration, weather, parts, TZ };
})();
