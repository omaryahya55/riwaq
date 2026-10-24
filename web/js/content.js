/*
 * المحتوى الديني (حديث اليوم، الأذكار، صحابي اليوم). البريف قسم ٢ قرار ٧ وقسم ٩ قرار ٥:
 * - النصوص تجي من ملف JSON منقول حرفياً من مصدر معتمد بسكربت (tools/)، ومعها المرجع ورابط التحقق.
 * - ما ينعرض أي عنصر إلا إذا عليه "approved": true وفيه نص ومرجع.
 * - الذكاء الاصطناعي ما يكتب أي نص هنا أبداً.
 * المصدر: content/approved.json. للمعاينة: ?content=hadeethenc يقرا content/candidates/hadeethenc.json
 */
(function () {
  let items = [], meta = {};
  const param = new URLSearchParams(location.search).get("content");
  const file = /^[a-z0-9-]{1,40}$/.test(param || "") ? `content/candidates/${param}.json`
    : (window.CONFIG && CONFIG.contentFile) || "content/approved.json";

  function load() {
    fetch(file).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j || !Array.isArray(j.items)) return;
      meta = { source: j.source || "" };
      items = j.items.filter((x) => x && x.approved === true && x.text && x.source);
      if (window.Saver && Saver.ready) Saver.tick(true);
    }).catch(() => { /* ما فيه ملف = ما فيه محتوى، والخانة مخفية */ });
  }

  const dayNumber = (date) => {
    const p = F.parts(date, { year: "numeric", month: "numeric", day: "numeric" });
    return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
  };

  // نفس العنصر طول اليوم، ويتغير يومياً بالترتيب
  function pick(type, date) {
    const list = items.filter((x) => x.type === type);
    if (!list.length) return null;
    return list[dayNumber(date) % list.length];
  }

  /*
   * وش ينعرض الحين في خانة المحتوى:
   * - وقت أذكار الصباح (من الفجر لين ساعتين بعد الشروق) ووقت أذكار المساء (من العصر لين العشاء):
   *   الأذكار، وتتبدل كل ٤٠ ثانية
   * - غير كذا: حديث اليوم وصحابي اليوم بالتناوب كل ٤٥ ثانية
   */
  function current(now) {
    const t = window.Prayer && Prayer.timesFor(now, 0);
    const adhkar = items.filter((x) => x.type === "adhkar");
    if (t && adhkar.length) {
      const at = (id) => t.find((p) => p.id === id).at;
      const morning = now >= at("fajr") && now < new Date(at("sunrise").getTime() + 2 * 3600000);
      const evening = now >= at("asr") && now < at("isha");
      if (morning || evening) {
        const i = Math.floor(now.getTime() / 40000) % adhkar.length;
        return { title: morning ? "من أذكار الصباح" : "من أذكار المساء", item: adhkar[i] };
      }
    }
    const h = pick("hadith", now), s = pick("sahabi", now);
    if (s && (!h || Math.floor(now.getTime() / 45000) % 2 === 1)) return { title: "في فضل الصحابة", item: s };
    if (h) return { title: "حديث اليوم", item: h };
    return null;
  }

  window.Content = {
    load,
    current,
    get source() { return meta.source; },
    // لصفحة الإعدادات: عناصر اليوم مع روابط التحقق
    today(now) { return ["hadith", "sahabi"].map((t) => pick(t, now)).filter(Boolean); }
  };
  load();
})();
