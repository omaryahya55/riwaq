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
    prayerCalm: true,        // "صمت له معنى": من الأذان لين بعد الصلاة شاشة الانتظار تهدأ (الوقت والصلاة بس)
    motion: true,            // الخلفية تتحرك بهدوء (غيوم ونجوم)
    hifz: [],                // "راجع محفوظك": أرقام السور اللي يحفظها المستخدم
    khatma: { on: false, perDay: 8, startQ: 0, start: "" }, // "ختمتك": الورد بأرباع الأحزاب (٨ = جزء)، ومن وين بدأ ومتى
    sunnahDaily: true,       // "سنّة نعيشها" بين محتوى اليوم
    placeDaily: true,        // "حكاية مكان": صورة ونبذة (أول جملة من ويكيبيديا)
    idleSeconds: 90,
    // المصادر: فاضي = نطلب المصدر مباشرة (للتطوير). في النشر: رابط السيرفر الوسيط (worker/)
    proxyBase: "",
    sportsKey: "123"         // مفتاح TheSportsDB المجاني للتطوير بس. المدفوع ما ينحط هنا أبداً (يكون في السيرفر)
  };

  function fromHash() {
    // #config=<JSON مرمّز> — تطبيق أندرويد يستخدمه (الـ ?query ما يشتغل مع file:// في WebView)
    const m = location.hash.match(/config=([^&]+)/);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }

  function load() {
    let stored = {};
    try {
      if (window.Riwaq && Riwaq.getConfig) stored = JSON.parse(Riwaq.getConfig()) || {};
      else stored = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) { stored = {}; }
    return Object.assign({}, DEFAULTS, stored, fromHash() || {});
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
    save(patch) { Object.assign(CONFIG, patch); save(CONFIG); },
    reload() { window.CONFIG = load(); return CONFIG; }
  };
})();
