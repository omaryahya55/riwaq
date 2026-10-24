/*
 * إعدادات المستخدم. تنحفظ على الجهاز نفسه بس (البريف قسم ٥: الخصوصية).
 * في التلفزيون: تطبيق أندرويد يحطها في الرابط بعد # أو يعطيها عن طريق Riwaq.getConfig().
 * في المتصفح: localStorage.
 */
(function () {
  const KEY = "riwaq.config";

  const DEFAULTS = {
    city: null,              // { name, lat, lon, tz, country } — ما فيه مدينة افتراضية (قرار ثابت ٣)
    method: "auto",          // auto = حسب الدولة. أو اسم طريقة من adhan
    hijriOffset: 0,          // تعديل ±١ يوم لأن الرؤية ممكن تختلف عن تقويم أم القرى
    alertMinutes: 10,        // التنبيه قبل الأذان (٠ = مطفي)
    teams: [],               // [{ id, name }] من TheSportsDB
    leagues: ["4668", "4328", "4335", "4332", "4331", "4334"], // روشن، الإنقليزي، الإسباني، الإيطالي، الألماني، الفرنسي
    sideCard: "leagues",     // البطاقة اللي جنب الساعة: leagues | none
    newsFeeds: [],           // روابط RSS يضيفها المستخدم (قرار ٩)
    icalUrl: "",             // العنوان السري لتقويم قوقل (iCal). سرّي: على الجهاز بس، وما يمر على السيرفر الوسيط
    showSalary: true,        // الراتب وحساب المواطن (يطلعون للسعودية بس)
    pinned: null,            // ترتيب التطبيقات في الواجهة (null = الافتراضي)
    lock: { pin: "", apps: [] }, // قفل التطبيقات للأطفال: رمز من ٤ أرقام (على الجهاز بس) والتطبيقات المقفلة
    nightClock: true,        // بالليل: شاشة الانتظار تصير ساعة بسيطة خافتة (مثل Nest Hub و Echo Show)
    motion: true,            // الخلفية المرسومة تتحرك بهدوء (غيوم)
    bgStyle: "photo",        // الخلفية: photo = صور حقيقية لكل فترة، drawn = رسمة
    hifz: [],                // "راجع محفوظك": أرقام السور اللي يحفظها المستخدم
    sunnahDaily: true,       // "سنّة نعيشها" بين محتوى اليوم
    placeDaily: true,        // "حكاية مكان": صورة ونبذة (أول جملة من ويكيبيديا)
    idleSeconds: 90,
    // المصادر: فاضي = نطلب المصدر مباشرة (للتطوير). في النشر: رابط السيرفر الوسيط (worker/)
    proxyBase: "",
    sportsKey: "123"         // مفتاح TheSportsDB المجاني للتطوير بس. المدفوع ما ينحط هنا أبداً (يكون في السيرفر)
  };

  /*
   * فحص الإعدادات: كل قيمة تجي من الجوال أو من التخزين لازم تكون من نوعها وفي حدودها، وإلا ناخذ الافتراضي.
   * (الجوال محمي بالرمز، بس قيمة غلط وحدة ممكن تطيح الشاشة كاملة، مثل منطقة زمنية مو موجودة)
   */
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const https = (v, max) => (typeof v === "string" && v.length <= (max || 600) && /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : "");
  const int = (v, lo, hi, d) => (Number.isInteger(+v) && +v >= lo && +v <= hi ? +v : d);
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  const ID = /^[0-9]{1,10}$/;
  const PKG = /^[A-Za-z0-9_.]{1,200}$/;
  const METHODS = ["auto", "UmmAlQura", "MuslimWorldLeague", "Egyptian", "Karachi", "Dubai", "Kuwait", "Qatar", "Turkey", "Singapore", "NorthAmerica", "MoonsightingCommittee"];
  function validTz(tz) {
    if (typeof tz !== "string" || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
  }
  function sanitize(c) {
    const d = DEFAULTS, o = {};
    const city = c.city;
    o.city = city && typeof city === "object" && isFinite(city.lat) && isFinite(city.lon) && Math.abs(city.lat) <= 90 && Math.abs(city.lon) <= 180 && validTz(city.tz)
      ? { name: str(city.name, 80), region: str(city.region, 80), lat: +city.lat, lon: +city.lon, tz: city.tz, country: /^[A-Z]{2}$/.test(city.country || "") ? city.country : "" }
      : null;
    o.method = METHODS.includes(c.method) ? c.method : d.method;
    o.hijriOffset = int(c.hijriOffset, -2, 2, d.hijriOffset);
    o.alertMinutes = int(c.alertMinutes, 0, 60, d.alertMinutes);
    o.teams = (Array.isArray(c.teams) ? c.teams : []).filter((t) => t && ID.test(String(t.id))).slice(0, 12).map((t) => ({ id: String(t.id), name: str(t.name, 60) }));
    o.leagues = Array.isArray(c.leagues) ? c.leagues.map(String).filter((x) => ID.test(x)).slice(0, 10) : d.leagues.slice();
    o.sideCard = c.sideCard === "none" ? "none" : "leagues";
    o.newsFeeds = (Array.isArray(c.newsFeeds) ? c.newsFeeds : []).map((u) => https(u)).filter(Boolean).slice(0, 3);
    o.icalUrl = https(c.icalUrl, 1000);
    o.showSalary = bool(c.showSalary, d.showSalary);
    o.reminders = bool(c.reminders, true);
    o.pinned = Array.isArray(c.pinned) ? c.pinned.map(String).filter((x) => PKG.test(x)).slice(0, 60) : null;
    const lock = c.lock && typeof c.lock === "object" ? c.lock : {};
    o.lock = { pin: /^[0-9]{4}$/.test(String(lock.pin || "")) ? String(lock.pin) : "", apps: (Array.isArray(lock.apps) ? lock.apps : []).map(String).filter((x) => PKG.test(x)).slice(0, 100) };
    o.nightClock = bool(c.nightClock, d.nightClock);
    o.motion = bool(c.motion, d.motion);
    o.bgStyle = c.bgStyle === "drawn" ? "drawn" : "photo";
    o.hifz = (Array.isArray(c.hifz) ? c.hifz : []).map(Number).filter((s) => Number.isInteger(s) && s >= 1 && s <= 114).slice(0, 114);
    o.sunnahDaily = bool(c.sunnahDaily, d.sunnahDaily);
    o.placeDaily = bool(c.placeDaily, d.placeDaily);
    o.idleSeconds = int(c.idleSeconds, 30, 3600, d.idleSeconds);
    o.proxyBase = https(c.proxyBase, 200);
    o.sportsKey = /^[A-Za-z0-9]{1,40}$/.test(String(c.sportsKey || "")) ? String(c.sportsKey) : d.sportsKey;
    o.todoistToken = /^[A-Za-z0-9]{20,80}$/.test(String(c.todoistToken || "")) ? String(c.todoistToken) : "";
    const tg = c.telegram && typeof c.telegram === "object" ? c.telegram : {};
    o.telegram = {
      token: /^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$/.test(String(tg.token || "")) ? String(tg.token) : "",
      code: /^[0-9]{6}$/.test(String(tg.code || "")) ? String(tg.code) : "",
      allowed: (Array.isArray(tg.allowed) ? tg.allowed : []).filter((a) => a && /^-?[0-9]{1,15}$/.test(String(a.id))).slice(0, 5).map((a) => ({ id: String(a.id), name: str(a.name, 40) })),
      fails: int(tg.fails, 0, 1000, 0)
    };
    if (typeof c.contentFile === "string" && /^content\/[a-z0-9/-]{1,60}\.json$/.test(c.contentFile)) o.contentFile = c.contentFile;
    return o;
  }

  function load() {
    let stored = {};
    try {
      if (window.Riwaq && Riwaq.getConfig) stored = JSON.parse(Riwaq.getConfig()) || {};
      else stored = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) { stored = {}; }
    return sanitize(Object.assign({}, DEFAULTS, stored && typeof stored === "object" ? stored : {}));
  }

  function save(cfg) {
    const json = JSON.stringify(cfg);
    try {
      if (window.Riwaq && Riwaq.setConfig) Riwaq.setConfig(json);
      else localStorage.setItem(KEY, json);
    } catch (e) { /* التخزين ممنوع: الإعدادات تبقى لين تتسكر الصفحة */ }
  }

  window.CONFIG = load();
  window.Config = {
    DEFAULTS,
    sanitize,
    save(patch) { Object.assign(CONFIG, patch); save(CONFIG); },
    reload() { window.CONFIG = load(); return CONFIG; }
  };
})();
