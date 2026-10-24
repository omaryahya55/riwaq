/*
 * المحتوى الديني (حديث اليوم، الأذكار، قصة صحابي). البريف قسم ٢ قرار ٧:
 * - النصوص تجي من ملف content/approved.json بس، ومن مصادر معتمدة مع المرجع.
 * - ما ينعرض أي عنصر إلا إذا عليه "approved": true من المراجع الشرعي.
 * - الذكاء الاصطناعي ما يكتب أي نص هنا أبداً.
 * لين المراجعة تخلص (المرحلة ٤) الملف فاضي، والخانات مخفية.
 */
(function () {
  let items = [];
  function load() {
    // في التطبيق: الملف داخل التطبيق. في المتصفح: نفس المجلد
    fetch("content/approved.json").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j || !Array.isArray(j.items)) return;
      items = j.items.filter((x) => x && x.approved === true && x.text && x.source);
      if (window.Saver) Saver.tick(true);
    }).catch(() => { /* ما فيه ملف = ما فيه محتوى */ });
  }
  // نفس العنصر طول اليوم، ويتغير يومياً بالترتيب
  function pick(type, date) {
    const list = items.filter((x) => x.type === type);
    if (!list.length) return null;
    const p = F.parts(date, { year: "numeric", month: "numeric", day: "numeric" });
    const dayNum = Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
    return list[dayNum % list.length];
  }
  window.Content = { load, hadithOfDay: (d) => pick("hadith", d), sahabiOfDay: (d) => pick("sahabi", d) };
  load();
})();
