/*
 * القرآن الكريم من مصحف Tanzil كامل (content/quran.json، حرفياً):
 * - راجع محفوظك: يختار السور اللي يحفظها، وكل يوم يطلع له مقطع منها بالترتيب (آيات كاملة، ما ينقطع نص الآية)
 * - ذكر الوقت: السورة كاملة في وقتها (الكهف يوم الجمعة، والملك بالليل)
 * الحساب كله على الجهاز، وتقسيم المقاطع بقاعدة ثابتة (طول النص)، مو اختيار من أحد.
 */
(function () {
  let Q = null, loading = false, cacheKey = "", cacheList = [];
  const M = () => window.QURAN_META;
  const MAX_PLAIN = 330; // نفس مساحة خانة المحتوى تقريباً

  const plainLen = (t) => t.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "").length;
  const dayNumber = (date) => {
    const p = F.parts(date, { year: "numeric", month: "numeric", day: "numeric" });
    return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
  };
  const hifz = () => (CONFIG.hifz || []).map(Number).filter((s) => s >= 1 && s <= 114).sort((a, b) => a - b);

  function load() {
    if (Q || loading || !M()) return;
    loading = true;
    fetch("content/quran.json").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j && Array.isArray(j.suras) && j.suras.length === 114) Q = j;
      if (typeof Event === "function" && window.dispatchEvent) window.dispatchEvent(new Event("riwaq-content"));
      if (window.Saver && Saver.ready) Saver.tick(true);
    }).catch(() => { /* بدون الملف: الميزتين ما يطلعون */ }).then(() => { loading = false; });
  }

  // مقطع من سورة: البسملة سطر لحالها، ورقم كل آية بعدها ﴿١﴾
  function passage(s, a, b, title) {
    const ayat = Q.suras[s - 1].slice(a - 1, b);
    let basmala = "";
    if (a === 1 && s !== 1 && s !== 9 && ayat[0].startsWith(Q.basmala + " ")) {
      basmala = Q.basmala; ayat[0] = ayat[0].slice(Q.basmala.length + 1);
    }
    const body = ayat.map((t, i) => `${t} ﴿${F.digits(a + i)}﴾`).join(" ");
    const whole = a === 1 && b === Q.suras[s - 1].length;
    const name = M().suras[s - 1].name;
    return {
      type: "quran", context: "general", title,
      text: (basmala ? basmala + "\n" : "") + body,
      source: `سورة ${name}` + (whole ? "" : ` · ${a === b ? "الآية" : "الآيات"} ${F.digits(a)}` + (a === b ? "" : `–${F.digits(b)}`)),
      edition: "Tanzil.net", verifyUrl: `https://tanzil.net/#${s}:${a}`, sourceId: `quran-${s}-${a}-${b}`, approved: true
    };
  }

  // كل السور المحفوظة مقسمة لمقاطع تدخل في الشاشة، بالترتيب
  function chunks() {
    const key = hifz().join(",");
    if (key === cacheKey) return cacheList;
    const out = [];
    for (const s of hifz()) {
      const ayat = Q.suras[s - 1];
      let i = 0;
      while (i < ayat.length) {
        let j = i, len = 0;
        do { len += plainLen(ayat[j]); j++; } while (j < ayat.length && len + plainLen(ayat[j]) <= MAX_PLAIN);
        out.push([s, i + 1, j]);
        i = j;
      }
    }
    cacheKey = key; cacheList = out;
    return out;
  }

  function review(now, offset) {
    if (!Q || !hifz().length) return null;
    const list = chunks();
    if (!list.length) return null;
    const [s, a, b] = list[(dayNumber(now) + (offset || 0)) % list.length];
    return passage(s, a, b, "راجع محفوظك");
  }

  // سورة كاملة للقارئ (ذكر الوقت): الكهف والملك
  function surahItem(s, title) {
    if (!Q) return null;
    return passage(s, 1, Q.suras[s - 1].length, title);
  }

  window.QuranTools = { load, review, surahItem, get ready() { return !!Q; }, _test: { chunks, passage, setData(j) { Q = j; cacheKey = ""; } } };
  load();
})();
