/*
 * جلب البيانات الحية. القواعد (البريف قسم ٢ قرار ٨، وقسم ٤):
 * - كل مصدر له مدة تحديث هادية (ما نضغط على أحد)، وإذا رجع 429 نوقف عنه نص ساعة.
 * - آخر قيمة تنحفظ مع وقتها. إذا صارت أقدم من حدها: تختفي الخانة، وما نعرضها كأنها جديدة.
 * - كل النصوص اللي تجي من برا تنعرض كنص (ما تنحط كـ HTML).
 * - CONFIG.proxyBase فاضي = نطلب المصدر مباشرة (تطوير). في النشر: السيرفر الوسيط (worker/).
 */
(function () {
  const MIN = 60000, HOUR = 60 * MIN;

  // كل مصدر: كل كم يتحدث، ومتى يعتبر قديم ويختفي
  const RULES = {
    weather: { every: 30 * MIN, maxAge: 3 * HOUR },
    forecast: { every: 30 * MIN, maxAge: 24 * HOUR },
    dust: { every: 60 * MIN, maxAge: 3 * HOUR },
    metals: { every: 10 * MIN, maxAge: 2 * HOUR },
    fx: { every: 6 * HOUR, maxAge: 4 * 24 * HOUR },     // البنوك المركزية ما تنشر في الإجازات
    table: { every: 6 * HOUR, maxAge: 3 * 24 * HOUR },
    team: { every: 60 * MIN, maxAge: 12 * HOUR },
    news: { every: 20 * MIN, maxAge: 6 * HOUR }
  };

  const listeners = [];
  const cooldown = {}; // مصدر رجّع 429: ما نرجع له قبل الوقت هذا

  // ===== التخزين =====
  function read(key) {
    try { return JSON.parse(localStorage.getItem("riwaq.cache." + key)); } catch (e) { return null; }
  }
  function write(key, data) {
    const v = { at: Date.now(), data };
    try { localStorage.setItem("riwaq.cache." + key, JSON.stringify(v)); } catch (e) { /* التخزين ممتلي أو ممنوع */ }
    return v;
  }
  // يرجع البيانات بس إذا مو أقدم من الحد
  function fresh(key, rule) {
    const v = read(key);
    if (!v || Date.now() - v.at > RULES[rule].maxAge) return null;
    return v;
  }
  function due(key, rule) {
    const v = read(key);
    return !v || Date.now() - v.at > RULES[rule].every;
  }

  // ===== الشبكة =====
  async function get(url, host, asText) {
    if (cooldown[host] && Date.now() < cooldown[host]) throw new Error("cooldown");
    const ctl = window.AbortController ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), 12000);
    try {
      let r;
      try { r = await fetch(url, ctl ? { signal: ctl.signal } : {}); } catch (e) {
        // المصدر رفض أو النت مقطوع (رد الحجب 429 أحياناً يطلع كخطأ CORS): نرتاح منه ١٠ دقايق
        cooldown[host] = Date.now() + 10 * MIN;
        throw e;
      }
      if (r.status === 429) { cooldown[host] = Date.now() + 30 * MIN; throw new Error("429"); }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return asText ? await r.text() : await r.json();
    } finally { if (timer) clearTimeout(timer); }
  }

  function proxied(path, direct) {
    return CONFIG.proxyBase ? CONFIG.proxyBase.replace(/\/$/, "") + path : direct;
  }

  // ===== المصادر =====
  async function loadWeather() {
    const c = CONFIG.city; if (!c) return;
    const key = `wx.${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
    if (!due(key, "weather")) return;
    const q = `latitude=${c.lat.toFixed(4)}&longitude=${c.lon.toFixed(4)}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(c.tz)}&forecast_days=6`;
    const j = await get(proxied("/weather?" + q, "https://api.open-meteo.com/v1/forecast?" + q), "open-meteo");
    if (!j || !j.current || !j.daily) return;
    write(key, {
      now: { temp: j.current.temperature_2m, code: j.current.weather_code, humidity: j.current.relative_humidity_2m, wind: j.current.wind_speed_10m, time: j.current.time },
      days: j.daily.time.map((d, i) => ({ date: d, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i] }))
    });
  }

  async function loadDust() {
    const c = CONFIG.city; if (!c) return;
    const key = `dust.${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
    if (!due(key, "dust")) return;
    const q = `latitude=${c.lat.toFixed(4)}&longitude=${c.lon.toFixed(4)}&current=dust`;
    const j = await get(proxied("/air?" + q, "https://air-quality-api.open-meteo.com/v1/air-quality?" + q), "open-meteo");
    if (j && j.current && typeof j.current.dust === "number") write(key, { dust: j.current.dust });
  }

  async function loadMetals() {
    if (!due("metals", "metals")) return;
    const out = {};
    for (const s of ["XAU", "XAG", "BTC", "ETH"]) {
      const j = await get(proxied("/price/" + s, "https://api.gold-api.com/price/" + s), "gold-api");
      if (j && typeof j.price === "number") out[s] = { price: j.price, at: j.updatedAt };
    }
    if (Object.keys(out).length) write("metals", out);
  }

  async function loadFx() {
    if (!due("fx", "fx")) return;
    const j = await get(proxied("/fx?base=USD&quotes=SAR,EUR,GBP,AED,KWD", "https://api.frankfurter.dev/v2/rates?base=USD&quotes=SAR,EUR,GBP,AED,KWD"), "frankfurter");
    if (!Array.isArray(j)) return;
    const rates = {}; let date = "";
    j.forEach((r) => { rates[r.quote] = r.rate; if (r.date > date) date = r.date; });
    write("fx", { rates, date });
  }

  const sportsBase = () => `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(CONFIG.sportsKey || "123")}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function season() {
    // الموسم الأوروبي يبدأ في أغسطس تقريباً
    const p = F.parts(new Date(), { year: "numeric", month: "numeric" });
    const y = +p.year, m = +p.month;
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  async function loadTables() {
    if (CONFIG.sideCard !== "leagues") return;
    for (const id of CONFIG.leagues) {
      const key = "table." + id;
      if (!due(key, "table")) continue;
      const path = `/lookuptable.php?l=${id}&s=${season()}`;
      const j = await get(proxied("/sports" + path, sportsBase() + path), "thesportsdb");
      const rows = (j && j.table) || [];
      if (rows.length) write(key, rows.slice(0, 5).map((r) => ({ id: r.idTeam, name: r.strTeam, pts: +r.intPoints, played: +r.intPlayed })));
      await sleep(4000); // نوزع الطلبات
    }
  }

  async function loadTeams() {
    for (const t of CONFIG.teams) {
      const key = "team." + t.id;
      if (!due(key, "team")) continue;
      const pn = `/eventsnext.php?id=${t.id}`, pl = `/eventslast.php?id=${t.id}`;
      const n = await get(proxied("/sports" + pn, sportsBase() + pn), "thesportsdb");
      await sleep(4000);
      const l = await get(proxied("/sports" + pl, sportsBase() + pl), "thesportsdb");
      const ev = (e) => e && { home: e.strHomeTeam, away: e.strAwayTeam, homeId: e.idHomeTeam, awayId: e.idAwayTeam,
        at: e.strTimestamp ? e.strTimestamp.replace(/Z?$/, "Z") : null, hs: e.intHomeScore, as: e.intAwayScore, status: e.strStatus, league: e.strLeague, leagueId: e.idLeague };
      write(key, { next: ev(n && n.events && n.events[0]), last: ev(l && l.results && l.results[0]) });
      await sleep(4000);
    }
  }

  // RSS: المتصفح يمنع قراءة مواقع ثانية (CORS)، فالتطبيق يقرأها عن طريق أندرويد، أو السيرفر الوسيط
  function fetchText(url) {
    if (window.Riwaq && Riwaq.fetchText) {
      return new Promise((resolve, reject) => {
        const id = "cb" + Math.random().toString(36).slice(2);
        window.__riwaqCb = window.__riwaqCb || {};
        window.__riwaqCb[id] = (ok, text) => { delete window.__riwaqCb[id]; ok ? resolve(text) : reject(new Error(text)); };
        Riwaq.fetchText(url, id);
      });
    }
    return get(proxied("/rss?url=" + encodeURIComponent(url), url), "rss:" + url, true);
  }

  function parseFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) return null;
    const source = (doc.querySelector("channel > title, feed > title") || {}).textContent || "";
    const items = [...doc.querySelectorAll("item > title, entry > title")].map((n) => n.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
    return { source: source.trim().slice(0, 40), items: items.slice(0, 12) };
  }

  async function loadNews() {
    if (!CONFIG.newsFeeds.length || !due("news", "news")) return;
    const all = [];
    for (const url of CONFIG.newsFeeds.slice(0, 3)) {
      try {
        const f = parseFeed(await fetchText(url));
        if (f) f.items.forEach((t) => all.push({ title: t, source: f.source }));
      } catch (e) { /* مصدر واحد خرب ما يوقف الباقي */ }
    }
    if (all.length) write("news", all.slice(0, 20));
  }

  // ===== الواجهة العامة =====
  let running = false;
  async function refresh() {
    if (running) return; // تحديث واحد بس في نفس الوقت، عشان ما نطلب نفس المصدر مرتين
    running = true;
    try {
      const jobs = [loadWeather, loadDust, loadMetals, loadFx, loadNews, loadTables, loadTeams];
      for (const job of jobs) {
        try { await job(); } catch (e) { /* نجرب المرة الجاية. البيانات القديمة تنحكم بحدها */ }
        listeners.forEach((cb) => cb());
      }
    } finally { running = false; }
  }

  window.DATA = {
    onChange(cb) { listeners.push(cb); },
    start() {
      refresh();
      setInterval(refresh, 5 * MIN);
    },
    refresh,
    weather() { const c = CONFIG.city; return c ? fresh(`wx.${c.lat.toFixed(2)},${c.lon.toFixed(2)}`, "weather") : null; },
    forecast() {
      const c = CONFIG.city; if (!c) return null;
      const v = fresh(`wx.${c.lat.toFixed(2)},${c.lon.toFixed(2)}`, "forecast");
      if (!v) return null;
      // نشيل الأيام اللي فاتت (لو آخر تحديث كان أمس)
      const p = F.parts(new Date(), { year: "numeric", month: "2-digit", day: "2-digit" });
      const today = `${p.year}-${p.month}-${p.day}`;
      const days = v.data.days.filter((d) => d.date >= today).slice(0, 5);
      return days.length ? days : null;
    },
    dust() { const c = CONFIG.city; const v = c && fresh(`dust.${c.lat.toFixed(2)},${c.lon.toFixed(2)}`, "dust"); return v ? v.data.dust : null; },
    metals() { return fresh("metals", "metals"); },
    fx() { return fresh("fx", "fx"); },
    table(id) { return fresh("table." + id, "table"); },
    team(id) { return fresh("team." + id, "team"); },
    news() { return fresh("news", "news"); },
    season,
    RULES
  };
})();
