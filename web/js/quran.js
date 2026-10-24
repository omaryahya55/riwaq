/*
 * القرآن الكريم من مصحف Tanzil كامل (content/quran.json، حرفياً) لميزتين يشغّلهم المستخدم من الجوال:
 * - راجع محفوظك: يختار السور اللي يحفظها، وكل يوم يطلع له مقطع منها بالترتيب (آيات كاملة، ما ينقطع نص الآية)
 * - ختمتك: يختار ورده (نص جزء، جزء، جزأين…) ومن وين يبدأ، والشاشة تقول له ورد اليوم وكم باقي على الختمة
 * الحساب كله على الجهاز، وتقسيم المقاطع بقاعدة ثابتة (طول النص)، مو اختيار من أحد.
 */
(function () {
  let Q = null, loading = false, cacheKey = "", cacheList = [];
  const M = () => window.QURAN_META;
  const MAX_PLAIN = 330; // نفس مساحة خانة المحتوى تقريباً

  const plainLen = (t) => t.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "").length;
  const isoDay = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
  const dayNumber = (date) => {
    const p = F.parts(date, { year: "numeric", month: "numeric", day: "numeric" });
    return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
  };
  const hifz = () => (CONFIG.hifz || []).map(Number).filter((s) => s >= 1 && s <= 114).sort((a, b) => a - b);
  const kh = () => CONFIG.khatma || {};
  const need = () => hifz().length > 0 || kh().on;

  function load() {
    if (Q || loading || !need() || !M()) return;
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

  // ورد اليوم في الختمة. الأرباع: ٢٤٠ ربع حزب (٨ في كل جزء)
  function wird(now) {
    const k = kh();
    if (!k.on || !M()) return null;
    const per = [2, 4, 8, 16, 24].includes(+k.perDay) ? +k.perDay : 8;
    const days = Math.max(0, dayNumber(now) - (k.start ? isoDay(k.start) : dayNumber(now)));
    const q0 = (+k.startQ || 0) + days * per;
    if (q0 >= 240) return { done: true };
    const q1 = Math.min(240, q0 + per);
    const from = M().quarters[q0];
    let to;
    if (q1 >= 240) to = [114, M().suras[113].ayat];
    else {
      const [s, a] = M().quarters[q1];
      to = a > 1 ? [s, a - 1] : [s - 1, M().suras[s - 2].ayat];
    }
    const name = (s) => M().suras[s - 1].name;
    return {
      done: false, from, to, juz: Math.floor(q0 / 8) + 1, daysLeft: Math.ceil((240 - q0) / per),
      label: `من ${name(from[0])} ${F.digits(from[1])} إلى ${name(to[0])} ${F.digits(to[1])}`
    };
  }

  // نص ورد اليوم كامل للقارئ (ينقرا بالسهم تحت)
  function wirdItem(now) {
    const w = wird(now);
    if (!Q || !w || w.done) return null;
    const parts = [];
    for (let s = w.from[0]; s <= w.to[0]; s++) {
      const a = s === w.from[0] ? w.from[1] : 1, b = s === w.to[0] ? w.to[1] : Q.suras[s - 1].length;
      parts.push(passage(s, a, b, ""));
    }
    return {
      type: "quran", context: "general", title: "وردك اليوم",
      text: parts.map((p) => (parts.length > 1 ? `سورة ${p.source.split(" · ")[0].replace("سورة ", "")}\n` : "") + p.text).join("\n\n"),
      source: w.label, edition: "Tanzil.net", verifyUrl: `https://tanzil.net/#${w.from[0]}:${w.from[1]}`, sourceId: "quran-wird", approved: true
    };
  }

  window.QuranTools = { load, review, wird, wirdItem, get ready() { return !!Q; }, _test: { chunks, passage, setData(j) { Q = j; cacheKey = ""; } } };
  load();
})();
