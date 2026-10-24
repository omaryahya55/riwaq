/*
 * المحتوى الديني (حديث اليوم، الأذكار، صحابي اليوم). البريف قسم ٢ قرار ٧ وقسم ٩ قرار ٥:
 * - النصوص تجي من ملف JSON منقول حرفياً من مصدر معتمد بسكربت (tools/)، ومعها المرجع ورابط التحقق.
 * - ما ينعرض أي عنصر إلا إذا عليه "approved": true وفيه نص ومرجع.
 * - الذكاء الاصطناعي ما يكتب أي نص هنا أبداً. حتى العناوين: عنوان الباب من الكتاب نفسه،
 *   وإلا عنوان ثابت عام (مثل "حديث اليوم").
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
      if (typeof Event === "function" && window.dispatchEvent) window.dispatchEvent(new Event("riwaq-content"));
    }).catch(() => { /* ما فيه ملف = ما فيه محتوى، والخانة مخفية */ });
  }

  const MIN = 60000;
  const dayNumber = (date) => {
    const p = F.parts(date, { year: "numeric", month: "numeric", day: "numeric" });
    return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
  };
  const ctxOf = (x) => x.context || "general";
  const byCtx = (ctx, type) => items.filter((x) => ctxOf(x) === ctx && (!type || x.type === type));

  // نفس العنصر طول اليوم، ويتغير يومياً بالترتيب
  function pick(type, date, offset, ctx) {
    const list = items.filter((x) => x.type === type && (!ctx || ctxOf(x) === ctx));
    if (!list.length) return null;
    return list[(dayNumber(date) + (offset || 0)) % list.length];
  }

  // العنوان: عنوان الباب من حصن المسلم، وللأحاديث عنوان ثابت حسب وقتها
  const HADITH_TITLE = {
    meal: "من آداب الطعام", adhan: "في الأذان", prayer: "في فضل الصلاة", sleep: "من آداب النوم",
    fasting: "في فضل الصيام", lastTen: "في العشر الأواخر", dhulhijjah: "في عشر ذي الحجة", friday: "في فضل يوم الجمعة"
  };
  const titleOf = (x, fallback) => x.title || HADITH_TITLE[ctxOf(x)] || fallback;

  // إقامة الصلاة تقريباً (المعمول به في مساجد السعودية) عشان نعرف وقت "قبل الصلاة" و"بعد السلام"
  const IQAMA = { fajr: 25, dhuhr: 20, asr: 20, maghrib: 10, isha: 20 };

  // أيام الصيام المسنونة: رمضان، الإثنين والخميس، الأيام البيض، عرفة، تاسوعاء وعاشوراء
  function fastingDay(now) {
    const h = F.hijriParts(now), wd = F.parts(now, { weekday: "short" }).weekday;
    return h.m === 9 || wd === "Mon" || wd === "Thu" || (h.d >= 13 && h.d <= 15 && h.m !== 12)
      || (h.m === 12 && h.d === 9) || (h.m === 1 && (h.d === 9 || h.d === 10));
  }

  /*
   * الأوقات اللي لها محتوى خاص (حسب الساعة والصلاة والطقس والتاريخ).
   * كل وقت: contexts (أبواب حصن المسلم وأحاديث الموسوعة) + وزن (كم مرة يطلع في الدورة).
   * exclusive: أوقات قصيرة ومهمة (الأذان، بعد السلام، الإفطار) تاخذ الخانة كلها.
   */
  function windows(now) {
    const out = [];
    const t = window.Prayer && Prayer.timesFor(now, 0);
    const mod = F.minutesOfDay(now);
    const inMin = (a, b) => (a <= b ? mod >= a && mod < b : mod >= a || mod < b);
    const near = (at, from, to) => at && now >= new Date(at.getTime() + from * MIN) && now < new Date(at.getTime() + to * MIN);
    if (t) {
      const at = (id) => (t.find((p) => p.id === id) || {}).at;
      for (const id of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
        const iq = IQAMA[id];
        if (near(at(id), -2, 6)) out.push({ ctx: ["adhan"], exclusive: true });
        else if (near(at(id), 6, iq - 1)) out.push({ ctx: ["mosque", "prayer"], exclusive: true });
        else if (near(at(id), iq + 8, iq + 30)) out.push({ ctx: ["afterPrayer"], exclusive: true });
      }
      if (fastingDay(now) && near(at("maghrib"), -15, 1)) out.push({ ctx: ["iftar", "fasting"], exclusive: true });
      // دعاء رؤية الهلال: مغرب ٢٩ و٣٠ وأول الشهر
      const hd = F.hijriParts(now).d;
      if ((hd >= 29 || hd === 1) && near(at("maghrib"), 0, 90)) out.push({ ctx: ["newMoon"], exclusive: true });
      if (near(at("fajr"), -40, -2)) out.push({ ctx: ["wake", "sleep"], w: 2 });
      // أذكار الصباح (من الفجر لين ساعتين بعد الشروق) والمساء (من العصر لين العشاء)
      const sunrise = at("sunrise");
      if (at("fajr") && sunrise && now >= at("fajr") && now < new Date(sunrise.getTime() + 120 * MIN)) out.push({ ctx: ["adhkar"], w: 4, part: "morning" });
      if (at("asr") && at("isha") && now >= at("asr") && now < at("isha")) out.push({ ctx: ["adhkar"], w: 4, part: "evening" });
      // قبل النوم: ساعة ونص بعد العشاء لين قبل الفجر بساعة
      const isha = at("isha"), fajr = at("fajr");
      if ((isha && now >= new Date(isha.getTime() + 90 * MIN)) || (fajr && now < new Date(fajr.getTime() - 60 * MIN))) out.push({ ctx: ["sleep"], w: 3 });
    }
    if (inMin(12 * 60 + 45, 14 * 60 + 45) || inMin(19 * 60 + 45, 21 * 60 + 45)) out.push({ ctx: ["meal"], w: 2 });
    if (inMin(6 * 60 + 30, 7 * 60 + 45)) out.push({ ctx: ["leaveHome"], w: 1 });
    if (inMin(13 * 60 + 30, 15 * 60 + 30) || inMin(21 * 60, 22 * 60 + 30)) out.push({ ctx: ["enterHome"], w: 1 });
    // الطقس: المطر والرعد والريح (الغبار)
    const wx = window.DATA && DATA.weather && DATA.weather();
    const code = wx && wx.data && wx.data.now && wx.data.now.code;
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) out.push({ ctx: ["rain"], w: 3 });
    const dust = window.DATA && DATA.dust && DATA.dust();
    if (typeof dust === "number" && dust >= 300) out.push({ ctx: ["wind"], w: 2 });
    // مواسم: الجمعة (من مغرب الخميس)، الصيام، العشر الأواخر، عشر ذي الحجة
    const h = F.hijriParts(now), wd = F.parts(now, { weekday: "short" }).weekday;
    if (wd === "Fri" || (wd === "Thu" && mod >= 18 * 60)) out.push({ ctx: ["friday"], w: 1 });
    if (fastingDay(now)) out.push({ ctx: ["fasting"], w: 1 });
    if (h.m === 9 && h.d >= 20) out.push({ ctx: ["lastTen"], w: 1 });
    if (h.m === 12 && h.d <= 10) out.push({ ctx: ["dhulhijjah"], w: 1 });
    return out;
  }

  /*
   * وش ينعرض الحين في خانة المحتوى:
   * - وقت قصير مهم (الأذان، قبل الإقامة، بعد السلام، الإفطار، الهلال): محتواه بس
   * - غير كذا: دورة فيها محتوى الأوقات الحاضرة (أذكار الصباح/المساء، الطعام، النوم، المطر...)
   *   مع حديث اليوم وفضل الصحابة ودعاء اليوم من حصن المسلم. يتبدل كل ٤٠ ثانية
   * offset: البديل رقم كذا (لو النص ما يدخل في المساحة، الشاشة تطلب اللي بعده بدل ما تقص النص)
   */
  function current(now, offset) {
    offset = offset || 0;
    const slot = Math.floor(now.getTime() / 40000) + offset;
    const ws = windows(now);
    const ex = ws.filter((w) => w.exclusive);
    const pool = (w) => w.ctx.flatMap((c) => byCtx(c));
    if (ex.length) {
      const list = ex.flatMap(pool);
      if (list.length) { const x = list[slot % list.length]; return { title: titleOf(x, ""), item: x }; }
    }
    // الدورة: كل وقت حاضر بوزنه، وبعدها محتوى اليوم
    const cycle = [];
    for (const w of ws) {
      const list = pool(w);
      if (!list.length) continue;
      for (let k = 0; k < (w.w || 1); k++) cycle.push({ list, label: w.part === "morning" ? "من أذكار الصباح" : w.part === "evening" ? "من أذكار المساء" : "" });
    }
    const daily = [["quran", null, "من القرآن الكريم"], ["hadith", "general", "حديث اليوم"], ["sahabi", null, "في فضل الصحابة"], ["dua", "general", "دعاء اليوم"]];
    for (const [type, ctx, label] of daily) {
      const x = pick(type, now, 0, ctx);
      if (x) cycle.push({ list: [x], label, fixed: true });
    }
    // راجع محفوظك (لو اختار سور)، وسنّة نعيشها، وحكاية مكان
    const rv = window.QuranTools && QuranTools.review(now, 0);
    if (rv) cycle.splice(1, 0, { list: [rv], label: "راجع محفوظك", fixed: true, alt: (o) => QuranTools.review(now, o) });
    const sn = CONFIG.sunnahDaily !== false && pickTagged("sunnah", now, 0);
    if (sn) cycle.push({ list: [sn], label: "سنّة نعيشها", fixed: true, title: "سنّة نعيشها", alt: (o) => pickTagged("sunnah", now, o) });
    const pl = CONFIG.placeDaily !== false && pick("place", now, 0);
    if (pl) cycle.push({ list: [pl], label: "حكاية مكان", fixed: true });
    if (!cycle.length) return null;
    const c = cycle[slot % cycle.length];
    const round = Math.floor(slot / cycle.length);
    // محتوى اليوم ثابت طول اليوم إلا إذا الشاشة طلبت بديل (ما دخل)
    const x = c.fixed ? (offset ? (c.alt ? c.alt(offset) || c.list[0] : pickAlt(c.list[0], now, offset)) : c.list[0]) : c.list[round % c.list.length];
    return { title: c.title || (x.type === "adhkar" && c.label ? c.label : titleOf(x, c.label)), item: x };
  }

  // سنّة نعيشها: أحاديث الآداب العملية (السلام، والأكل، والنوم، واللباس…) عليها وسم sunnah من السكربت
  function pickTagged(tag, date, offset) {
    const list = items.filter((x) => Array.isArray(x.tags) && x.tags.includes(tag));
    return list.length ? list[(dayNumber(date) + (offset || 0)) % list.length] : null;
  }

  function pickAlt(x, now, offset) {
    return pick(x.type, now, offset, x.type === "sahabi" || x.type === "quran" ? null : ctxOf(x)) || x;
  }

  // سطر المصدر وتحته المرجع (تخريج الكتاب نفسه، حرفياً). full=false: المصدر بس
  function credit(x, full) {
    const ref = full && x.sourceId && String(x.sourceId).startsWith("hisn-") ? String(x.reference || "").trim() : "";
    return { source: x.source + (x.edition && !String(x.sourceId).startsWith("hisn-") ? " · المصدر: " + x.edition : "") + (x.imageCredit ? " · " + x.imageCredit : ""), reference: ref };
  }

  window.Content = {
    load,
    current,
    credit,
    // خط النص: الآيات بخط المصحف، والأحاديث والأذكار بالنسخ، وحكاية مكان بالخط العادي
    fontClass(x) { return x.type === "quran" ? "t-quran" : x.type === "place" ? "" : "t-naskh"; },
    get source() { return meta.source; },
    // قارئ الواجهة الرئيسية: محتوى الوقت الحاضر أول، وبعدها حصن المسلم كامل بترتيبه، وأحاديث اليوم
    readerItems(now) {
      const day = dayNumber(now);
      const of = (type) => items.filter((x) => x.type === type);
      const rotate = (list) => list.slice(day % (list.length || 1)).concat(list.slice(0, day % (list.length || 1)));
      const seen = new Set(), out = [];
      const add = (x, title) => { if (x && !seen.has(x)) { seen.add(x); out.push({ title, item: x }); } };
      const wi = window.QuranTools && QuranTools.wirdItem(now);
      if (wi) add(wi, "وردك اليوم");
      windows(now).forEach((w) => w.ctx.forEach((c) => byCtx(c).forEach((x) => add(x, titleOf(x, "")))));
      const rv = window.QuranTools && QuranTools.review(now, 0);
      if (rv) add(rv, "راجع محفوظك");
      const sn = pickTagged("sunnah", now, 0);
      if (sn) add(sn, "سنّة نعيشها");
      const pl = pick("place", now, 0);
      if (pl) add(pl, "حكاية مكان");
      rotate(of("quran")).forEach((x) => add(x, "من القرآن الكريم"));
      rotate(of("hadith")).slice(0, 15).forEach((x, i) => add(x, i === 0 ? "حديث اليوم" : titleOf(x, "من الأحاديث")));
      rotate(of("sahabi")).slice(0, 8).forEach((x) => add(x, "في فضل الصحابة"));
      items.filter((x) => String(x.sourceId).startsWith("hisn-")).forEach((x) => add(x, x.title));
      return out;
    },
    // لصفحة الإعدادات: عناصر اليوم مع روابط التحقق
    today(now) { return ["quran", "hadith", "sahabi", "dua"].map((t) => pick(t, now, 0, t === "hadith" || t === "dua" ? "general" : null)).filter(Boolean); },
    // "صمت له معنى": من دقيقة قبل الأذان لين ربع ساعة بعد الإقامة (التقريبية)
    prayerPhase(now) {
      const t = window.Prayer && Prayer.timesFor(now, 0);
      if (!t) return null;
      for (const p of t) {
        if (!IQAMA[p.id]) continue;
        const iq = new Date(p.at.getTime() + IQAMA[p.id] * MIN);
        if (now >= new Date(p.at.getTime() - MIN) && now < new Date(iq.getTime() + 15 * MIN)) return { id: p.id, name: p.name, iqama: iq, before: now < iq };
      }
      return null;
    },
    _test: { windows, fastingDay }
  };
  load();
})();
