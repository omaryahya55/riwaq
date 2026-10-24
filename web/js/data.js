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
    news: { every: 20 * MIN, maxAge: 6 * HOUR },
    color: { every: 30 * 24 * HOUR, maxAge: 120 * 24 * HOUR },
    calendar: { every: 15 * MIN, maxAge: 6 * HOUR },
    tasks: { every: 15 * MIN, maxAge: 6 * HOUR }
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

  // أرقام الأندية والدوريات أرقام بس (تنحط في رابط الطلب)، والنتيجة رقم أو ما فيه
  const ID = /^[0-9]{1,10}$/;
  const score = (v) => (v === null || v === undefined || v === "" || !isFinite(+v) ? null : Math.max(0, Math.round(+v)));

  async function loadTables() {
    if (CONFIG.sideCard !== "leagues") return;
    for (const id of CONFIG.leagues.filter((x) => ID.test(String(x)))) {
      const key = "table." + id;
      if (!due(key, "table")) continue;
      const path = `/lookuptable.php?l=${id}&s=${season()}`;
      const j = await get(proxied("/sports" + path, sportsBase() + path), "thesportsdb");
      const rows = (j && j.table) || [];
      if (rows.length) write(key, rows.slice(0, 5).map((r) => ({ id: String(r.idTeam || ""), name: String(r.strTeam || ""), pts: +r.intPoints || 0, played: +r.intPlayed || 0 })));
      await sleep(4000); // نوزع الطلبات
    }
  }

  async function loadTeams() {
    for (const t of CONFIG.teams.filter((x) => ID.test(String(x.id)))) {
      const key = "team." + t.id;
      if (!due(key, "team")) continue;
      const pn = `/eventsnext.php?id=${t.id}`, pl = `/eventslast.php?id=${t.id}`;
      const n = await get(proxied("/sports" + pn, sportsBase() + pn), "thesportsdb");
      await sleep(4000);
      const l = await get(proxied("/sports" + pl, sportsBase() + pl), "thesportsdb");
      // كل قيمة من المصدر تتحول لنوعها (نص أو رقم) قبل ما تنحفظ: النتيجة تنعرض كرقم بس
      const ev = (e) => e && { home: String(e.strHomeTeam || ""), away: String(e.strAwayTeam || ""), homeId: String(e.idHomeTeam || ""), awayId: String(e.idAwayTeam || ""),
        at: /^\d{4}-\d\d-\d\dT[\d:]+(Z|[+-]\d\d:?\d\d)?$/.test(e.strTimestamp || "") ? (/(Z|[+-]\d\d:?\d\d)$/.test(e.strTimestamp) ? e.strTimestamp : e.strTimestamp + "Z") : null,
        hs: score(e.intHomeScore), as: score(e.intAwayScore), status: String(e.strStatus || ""), league: String(e.strLeague || ""), leagueId: String(e.idLeague || "") };
      write(key, { next: ev(n && n.events && n.events[0]), last: ev(l && l.results && l.results[0]) });
      await sleep(4000);
    }
  }

  async function loadTeamColors() {
    for (const t of CONFIG.teams.filter((x) => ID.test(String(x.id)))) {
      const key = "color." + t.id;
      if (!due(key, "color")) continue;
      const p = `/lookupteam.php?id=${t.id}`;
      const j = await get(proxied("/sports" + p, sportsBase() + p), "thesportsdb");
      const team = j && j.teams && j.teams[0];
      const c = team && /^#[0-9a-f]{6}$/i.test(team.strColour1 || "") ? team.strColour1 : "";
      write(key, { color: c });
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

  // التقويم: الرابط سرّي، فما نستخدم السيرفر الوسيط. على التلفزيون يمر عن طريق أندرويد (Riwaq.fetchText)
  async function loadCalendar() {
    const url = CONFIG.icalUrl;
    if (!url || !/^https:\/\//.test(url) || !due("cal", "calendar")) return;
    let text;
    if (window.Riwaq && Riwaq.fetchText) text = await fetchText(url);
    else text = await get(url, "ical", true); // في المتصفح: يشتغل بس إذا التقويم يسمح (CORS)
    if (!text || text.indexOf("BEGIN:VCALENDAR") < 0) return;
    // نحفظ المواعيد الجاية بس (العنوان والوقت)، مو الملف كامل
    write("cal", ICal.upcoming(text, F.TZ, new Date(), 14, 8));
  }

  // مهامك من Todoist (اختياري): مهام اليوم والمتأخرة. المفتاح سرّي: على التلفزيون بس، ويروح لـ api.todoist.com بس
  async function loadTasks() {
    const token = CONFIG.todoistToken;
    if (!token || !/^[A-Za-z0-9]{20,80}$/.test(token) || !due("tasks", "tasks")) return;
    const url = "https://api.todoist.com/api/v1/tasks/filter?" + new URLSearchParams({ query: "today | overdue", limit: "20" });
    let text;
    if (window.Riwaq && Riwaq.fetchTodoist) {
      text = await new Promise((resolve, reject) => {
        const id = "cb" + Math.random().toString(36).slice(2, 12);
        window.__riwaqCb = window.__riwaqCb || {};
        window.__riwaqCb[id] = (ok, body) => { delete window.__riwaqCb[id]; ok ? resolve(body) : reject(new Error("todoist")); };
        Riwaq.fetchTodoist(url, token, id);
      });
    } else {
      const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw new Error("todoist " + r.status);
      text = await r.text();
    }
    const j = JSON.parse(text);
    const list = (Array.isArray(j) ? j : j.results || []).map((x) => {
      const d = x.due || {};
      const at = d.datetime ? Date.parse(d.datetime) : d.date ? Date.parse(d.date + "T00:00:00") : null;
      return { title: String(x.content || "").replace(/\s+/g, " ").trim().slice(0, 80), at, allDay: !d.datetime };
    }).filter((x) => x.title).sort((a, b) => (a.at || 0) - (b.at || 0));
    write("tasks", list.slice(0, 8));
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
      const jobs = [loadWeather, loadDust, loadMetals, loadFx, loadNews, loadCalendar, loadTasks, loadTables, loadTeams, loadTeamColors];
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
    // أهم مباراة من كل أندية المستخدم: نتيجة انتهت خلال ٢٤ ساعة (الأحدث)، وإلا أقرب مباراة جاية
    featuredMatch(now) {
      now = now || new Date();
      let last = null, next = null;
      for (const t of CONFIG.teams) {
        const v = this.team(t.id); if (!v) continue;
        const L = v.data.last, N = v.data.next;
        const lAt = L && L.at && new Date(L.at);
        if (L && lAt && now - lAt < 86400000 && L.hs !== null && L.hs !== undefined && L.hs !== "" && (!last || lAt > last.at)) last = { team: t, ev: L, at: lAt };
        const nAt = N && N.at && new Date(N.at);
        if (N && nAt && nAt > now - 3 * 3600000 && (!next || nAt < next.at)) next = { team: t, ev: N, at: nAt };
      }
      return last ? Object.assign({ kind: "last" }, last) : next ? Object.assign({ kind: "next" }, next) : null;
    },
    calendar() {
      const v = CONFIG.icalUrl && fresh("cal", "calendar");
      if (!v) return null;
      const now = Date.now();
      const list = v.data.filter((e) => (e.allDay ? e.at + 86400000 : e.at) > now).slice(0, 5);
      return list.length ? list : null;
    },
    tasks() {
      const v = CONFIG.todoistToken && fresh("tasks", "tasks");
      return v && v.data.length ? v.data.slice(0, 5) : null;
    },
    teamColor(id) { const v = fresh("color." + id, "color"); return v && v.data.color ? v.data.color : null; },
    season,
    RULES
  };
})();
