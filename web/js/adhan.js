/*
 * صوت الأذان: الصفحة تحسب أوقات الصلاة للأيام الثلاث الجاية (نفس حساب الشاشة) وترسلها لأندرويد،
 * وأندرويد يحط منبّه لكل أذان (Adhan.kt). يشتغل حتى لو المستخدم في تطبيق ثاني، وما يشتغل والتلفزيون مطفي.
 * الصلوات المفعّلة من الإعدادات (CONFIG.adhan). الافتراضي: كل الصلوات إلا الفجر.
 */
(function () {
  const IDS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

  function upcoming(now) {
    const a = CONFIG.adhan || {};
    if (!a.on || !CONFIG.city || !window.Prayer) return [];
    const out = [];
    for (let d = 0; d < 3; d++) {
      const t = Prayer.timesFor(new Date(now.getTime() + d * 86400000), 0) || [];
      for (const p of t) if (IDS.includes(p.id) && a[p.id] && p.at > now) out.push({ at: p.at.getTime(), name: p.name });
    }
    return out;
  }

  function push() {
    if (!(window.Riwaq && Riwaq.scheduleAdhan)) return;
    try { Riwaq.scheduleAdhan(JSON.stringify(upcoming(new Date()))); } catch (e) { /* نجرب بعد ساعة */ }
  }

  window.AdhanSchedule = {
    start() { push(); setInterval(push, 3600000); },
    _test: { upcoming }
  };
})();
