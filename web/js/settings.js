/*
 * صفحة الإعدادات.
 * - من الجوال: التلفزيون يعرض باركود فيه رابط بيته على الشبكة + رمز سري (?token=...).
 *   الصفحة تقرا وتحفظ عن طريق /api/config، والرمز يمنع أي أحد ثاني على الشبكة يغيّر الإعدادات.
 * - في المتصفح العادي: تحفظ في localStorage.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  const remote = !!token;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);
  const AR = "٠١٢٣٤٥٦٧٨٩";
  const ar = (s) => String(s).replace(/[0-9]/g, (d) => AR[d]);

  const METHODS = [
    ["auto", "تلقائي حسب الدولة"], ["UmmAlQura", "أم القرى"], ["MuslimWorldLeague", "رابطة العالم الإسلامي"],
    ["Egyptian", "الهيئة المصرية"], ["Karachi", "كراتشي"], ["Dubai", "دبي"], ["Kuwait", "الكويت"], ["Qatar", "قطر"],
    ["Turkey", "تركيا"], ["Singapore", "سنغافورة"], ["NorthAmerica", "أمريكا الشمالية"], ["MoonsightingCommittee", "لجنة رؤية الهلال"]
  ];
  const MAX_TEAMS = 12; // أكثر من فريق في كل دوري. كل فريق طلبين بالساعة، فما نضغط على المصدر

  let cfg = Object.assign({}, CONFIG);

  function status(msg, bad) { const s = $("status"); s.textContent = msg; s.classList.toggle("bad", !!bad); }

  async function loadRemote() {
    const r = await fetch("/api/config?token=" + encodeURIComponent(token));
    if (!r.ok) throw new Error(r.status === 403 ? "الرابط انتهى. صوّر الباركود من التلفزيون مرة ثانية." : "ما قدرنا نوصل للتلفزيون");
    cfg = Config.sanitize(Object.assign({}, Config.DEFAULTS, await r.json())); // نفس فحص التلفزيون
  }

  // ===== المدينة =====
  function paintCity() {
    $("cityNow").textContent = cfg.city ? `${cfg.city.name}${cfg.city.region ? "، " + cfg.city.region : ""}` : "ما اخترت مدينة";
    $("salaryRow").style.display = cfg.city && cfg.city.country !== "SA" ? "none" : "";
  }
  async function searchCity() {
    const q = $("cityQ").value.trim();
    if (q.length < 2) return;
    $("cityResults").innerHTML = `<li class="muted">نبحث…</li>`;
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ar&format=json`);
      const j = await r.json();
      const list = (j.results || []).filter((x) => x.timezone);
      if (!list.length) { $("cityResults").innerHTML = `<li class="muted">ما لقينا شي. جرّب اسم ثاني أو بالإنقليزي.</li>`; return; }
      $("cityResults").innerHTML = list.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.name)}<small>${esc([x.admin1, x.country].filter(Boolean).join("، "))}</small></button></li>`).join("");
      $("cityResults").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        const x = list[+b.dataset.i];
        const clean = (s) => String(s || "").replace(/[‎‏]/g, "").trim(); // علامات اتجاه مخفية تجي من GeoNames
        cfg.city = { name: clean(x.name), region: clean(x.admin1), lat: x.latitude, lon: x.longitude, tz: x.timezone, country: x.country_code };
        $("cityResults").innerHTML = ""; $("cityQ").value = "";
        paintCity();
      }));
    } catch (e) {
      $("cityResults").innerHTML = `<li class="muted">ما قدرنا نبحث. تأكد من النت.</li>`;
    }
  }

  // ===== الأندية =====
  function paintTeams() {
    const league = LEAGUES.find((l) => l.id === $("teamLeague").value) || LEAGUES[0];
    const chosen = new Set(cfg.teams.map((t) => String(t.id)));
    $("teamList").innerHTML = Object.entries(league.teams).map(([id, name]) =>
      `<button type="button" data-id="${id}" aria-pressed="${chosen.has(id)}">${esc(name)}</button>`).join("");
    $("teamList").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id;
      if (cfg.teams.some((t) => String(t.id) === id)) cfg.teams = cfg.teams.filter((t) => String(t.id) !== id);
      else if (cfg.teams.length < MAX_TEAMS) cfg.teams = cfg.teams.concat({ id, name: league.teams[id] });
      else { status(`تقدر تختار لين ${ar(MAX_TEAMS)} أندية`, true); return; }
      status("");
      paintTeams();
    }));
  }

  // ===== الأخبار =====
  // ===== الأخبار: مصادر جاهزة تختار منها، ورابط من عندك =====
  const MAX_FEEDS = 6;
  const presets = () => (window.NEWS_SOURCES || []).flatMap((g) => g.items.map(([name, url]) => ({ name, url })));
  // الرابط اللي يلصقه المستخدم: نشيل المسافات والأقواس، ونضيف https:// لو ما فيه، ونحوّل http لـ https
  function normalizeFeed(s) {
    let u = String(s || "").trim().replace(/^[<"'«(\s]+|[>"'»)\s]+$/g, "");
    if (!u) return "";
    if (!/^[a-z]+:\/\//i.test(u)) u = "https://" + u;
    u = u.replace(/^http:\/\//i, "https://");
    try {
      const x = new URL(u);
      return x.protocol === "https:" && x.hostname.includes(".") ? x.href : "";
    } catch (e) { return ""; }
  }
  function toggleFeed(url) {
    const i = cfg.newsFeeds.indexOf(url);
    if (i >= 0) cfg.newsFeeds.splice(i, 1);
    else if (cfg.newsFeeds.length < MAX_FEEDS) cfg.newsFeeds.push(url);
    else { status(`تقدر تختار لين ${ar(MAX_FEEDS)} مصادر`, true); return; }
    status(""); paintFeeds();
  }
  function paintFeeds() {
    const chosen = new Set(cfg.newsFeeds);
    $("newsGroups").innerHTML = (window.NEWS_SOURCES || []).map((g) => `<h3>${esc(g.group)}</h3><div class="chips">` +
      g.items.map(([name, url]) => `<button type="button" data-url="${esc(url)}" aria-pressed="${chosen.has(url)}">${esc(name)}</button>`).join("") + "</div>").join("");
    const known = new Set(presets().map((p) => p.url));
    const custom = cfg.newsFeeds.filter((u) => !known.has(u));
    $("customFeeds").innerHTML = custom.map((u) => `<button type="button" data-url="${esc(u)}" aria-pressed="true" title="${esc(u)}"><bdi>${esc(new URL(u).hostname.replace(/^www\./, ""))}</bdi> ✕</button>`).join("");
    document.querySelectorAll("#newsGroups [data-url], #customFeeds [data-url]").forEach((b) => b.addEventListener("click", () => toggleFeed(b.dataset.url)));
    $("feedCount").textContent = cfg.newsFeeds.length ? `مختار ${ar(cfg.newsFeeds.length)} من ${ar(MAX_FEEDS)}` : "ما اخترت مصدر للحين: شريط الأخبار ما يطلع";
  }
  function addCustomFeed() {
    const u = normalizeFeed($("feedUrl").value);
    if (!u) { status("الرابط غلط. انسخ رابط RSS كامل من الموقع (مثل https://example.com/rss)", true); return; }
    if (!cfg.newsFeeds.includes(u)) {
      if (cfg.newsFeeds.length >= MAX_FEEDS) { status(`تقدر تختار لين ${ar(MAX_FEEDS)} مصادر`, true); return; }
      cfg.newsFeeds.push(u);
    }
    $("feedUrl").value = ""; status(""); paintFeeds();
  }

  // ===== القرآن: راجع محفوظك =====
  function paintQuran() {
    const M = window.QURAN_META;
    if (!M) return;
    const chosen = new Set((cfg.hifz || []).map(Number));
    $("hifzList").innerHTML = M.suras.map((s, i) => `<button type="button" data-s="${i + 1}" aria-pressed="${chosen.has(i + 1)}">${esc(s.name)}</button>`).join("");
    $("hifzList").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const n = +b.dataset.s, set = new Set((cfg.hifz || []).map(Number));
      set.has(n) ? set.delete(n) : set.add(n);
      cfg.hifz = [...set].sort((a, b2) => a - b2);
      b.setAttribute("aria-pressed", String(set.has(n)));
    }));
  }
  function readQuran() {
    delete cfg.khatma; // ختمتك انشالت (2026-10-24): بدالها "ذكر الوقت"
    cfg.sunnahDaily = $("sunnahDaily").checked;
    cfg.placeDaily = $("placeDaily").checked;
    cfg.motion = $("motion").checked;
    cfg.bgStyle = $("bgStyle").value === "drawn" ? "drawn" : "photo";
  }

  // ===== رسالة من الجوال (تيليقرام) =====
  let tgCleared = false;
  function paintTelegram() {
    const t = cfg.telegram = Object.assign({ token: "", code: "", allowed: [], fails: 0 }, cfg.telegram);
    // رمز ربط جديد لو ما فيه، أو لو انقفل بسبب محاولات غلط كثيرة
    if (!/^[0-9]{6}$/.test(t.code) || t.fails >= 10) {
      const n = new Uint32Array(1); crypto.getRandomValues(n);
      t.code = String(100000 + (n[0] % 900000)); t.fails = 0;
    }
    $("tgToken").value = t.token || "";
    $("tgCode").textContent = t.code;
    $("tgAllowed").innerHTML = t.allowed.length
      ? `المربوطة: ${t.allowed.map((a) => `<bdi>${esc(a.name)}</bdi>`).join("، ")} <button class="btn" type="button" id="tgUnlink">فك ربط الكل</button>`
      : "ما فيه جوال مربوط للحين.";
    const u = $("tgUnlink");
    if (u) u.addEventListener("click", () => { cfg.telegram.allowed = []; tgCleared = true; paintTelegram(); status("اضغط حفظ عشان يتطبق"); });
  }

  function fill() {
    $("where").textContent = remote ? "تعدّل إعدادات التلفزيون من جوالك." : "التغييرات تنحفظ على هذا الجهاز بس.";
    $("method").innerHTML = METHODS.map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
    $("method").value = cfg.method || "auto";
    $("hijriOffset").value = String(cfg.hijriOffset || 0);
    $("alertMinutes").value = String(cfg.alertMinutes);
    $("reminders").checked = cfg.reminders !== false;
    $("showSalary").checked = cfg.showSalary !== false;
    $("icalUrl").value = cfg.icalUrl || "";
    $("todoistToken").value = cfg.todoistToken || "";
    paintTelegram();
    paintQuran();
    $("sunnahDaily").checked = cfg.sunnahDaily !== false;
    $("placeDaily").checked = cfg.placeDaily !== false;
    $("motion").checked = cfg.motion !== false;
    $("bgStyle").value = cfg.bgStyle === "drawn" ? "drawn" : "photo";
    $("nightClock").checked = cfg.nightClock !== false;
    $("lockPin").value = (cfg.lock && cfg.lock.pin) || "";
    loadLockApps();
    $("teamLeague").innerHTML = LEAGUES.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
    $("leagues").innerHTML = LEAGUES.map((l) => `<label><input type="checkbox" value="${l.id}" ${cfg.leagues.includes(l.id) ? "checked" : ""}>${l.name.replace(" السعودي", "")}</label>`).join("");
    paintCity(); paintTeams(); paintFeeds();
  }

  async function save() {
    // رابط مكتوب ولا انضاف (نسى يضغط إضافة): نضيفه قبل الحفظ
    if ($("feedUrl").value.trim()) { addCustomFeed(); if ($("feedUrl").value.trim()) return; }
    cfg.newsFeeds = cfg.newsFeeds.map(normalizeFeed).filter(Boolean).slice(0, MAX_FEEDS);
    const pin = $("lockPin").value.trim();
    if (pin && !/^[0-9]{4}$/.test(pin)) { status("رمز القفل لازم يكون ٤ أرقام", true); return; }
    cfg.lock = { pin, apps: [...$("lockApps").querySelectorAll("input:checked")].map((x) => x.value) };
    cfg.nightClock = $("nightClock").checked;
    const ical = $("icalUrl").value.trim();
    if (ical && !/^https:\/\/[^\s]+$/i.test(ical)) { status("رابط التقويم لازم يبدأ بـ https://", true); return; }
    cfg.icalUrl = ical;
    const todo = $("todoistToken").value.trim();
    if (todo && !/^[A-Za-z0-9]{20,80}$/.test(todo)) { status("مفتاح Todoist غلط. انسخه كامل من الإعدادات ← التكاملات", true); return; }
    cfg.todoistToken = todo;
    const tgt = $("tgToken").value.trim();
    if (tgt && !/^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$/.test(tgt)) { status("مفتاح البوت غلط. انسخه كامل من BotFather", true); return; }
    cfg.telegram.token = tgt;
    readQuran();
    cfg.method = $("method").value;
    cfg.hijriOffset = +$("hijriOffset").value;
    cfg.alertMinutes = +$("alertMinutes").value;
    cfg.reminders = $("reminders").checked;
    cfg.showSalary = $("showSalary").checked;
    cfg.leagues = [...$("leagues").querySelectorAll("input:checked")].map((x) => x.value);
    cfg.sideCard = cfg.leagues.length ? "leagues" : "none";
    try {
      if (remote) {
        // الجوالات اللي انربطت والصفحة مفتوحة: نآخذها من التلفزيون عشان ما تضيع (إلا لو ضغطت فك الربط)
        try {
          const now = await (await fetch("/api/config?token=" + encodeURIComponent(token))).json();
          if (!tgCleared && now.telegram && Array.isArray(now.telegram.allowed)) cfg.telegram.allowed = now.telegram.allowed;
        } catch (e) { /* نحفظ اللي عندنا */ }
        const r = await fetch("/api/config?token=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
        if (!r.ok) throw new Error(r.status === 403 ? "الرابط انتهى. صوّر الباركود مرة ثانية." : "ما انحفظ. جرّب مرة ثانية.");
      } else {
        Config.save(cfg);
      }
      status("انحفظ ✓");
    } catch (e) { status(e.message, true); }
  }

  // التطبيقات المركّبة على التلفزيون (لاختيار المقفلة). في المتصفح: القائمة التجريبية
  async function loadLockApps() {
    let list = [];
    try {
      if (remote) list = await (await fetch("/api/apps?token=" + encodeURIComponent(token))).json();
      else list = (window.DEMO && DEMO.apps) || [];
    } catch (e) { list = []; }
    const chosen = new Set((cfg.lock && cfg.lock.apps) || []);
    $("lockApps").innerHTML = list.map((a) => `<label><input type="checkbox" value="${esc(a.id)}" ${chosen.has(a.id) ? "checked" : ""}><bdi>${esc(a.name)}</bdi></label>`).join("")
      || `<p class="tiny">ما قدرنا نجيب قائمة التطبيقات.</p>`;
  }

  // محتوى اليوم مع روابط التحقق (نفس طريقة اختيار الشاشة: عنصر لكل يوم)
  async function loadVerify() {
    const file = new URLSearchParams(location.search).get("content") === "hadeethenc" ? "content/candidates/hadeethenc.json" : (cfg.contentFile || "content/approved.json");
    try {
      const j = await (await fetch(file)).json();
      const items = (j.items || []).filter((x) => x.approved === true && x.text && x.source);
      if (!items.length) return;
      const day = Math.floor(Date.now() / 86400000);
      const general = (x) => (x.context || "general") === "general";
      const pickOf = (type) => { const l = items.filter((x) => x.type === type && (type === "sahabi" || type === "quran" || general(x))); return l.length ? l[day % l.length] : null; };
      // محتوى اليوم، وبعده أذكار الصباح والمساء من حصن المسلم كاملة (عنوان الباب والنص وتحته التخريج)
      const list = [["من القرآن الكريم", pickOf("quran")], ["حديث اليوم", pickOf("hadith")], ["في فضل الصحابة", pickOf("sahabi")], ["دعاء اليوم", pickOf("dua")]]
        .concat(items.filter((x) => x.type === "adhkar").map((x) => [x.title || "من أذكار الصباح والمساء", x]))
        .filter((x) => x[1]);
      $("verifyList").innerHTML = list.map(([title, x]) => `<li><div class="vs"><b>${esc(x.type === "dua" && x.title ? title + ": " + x.title : title)}</b></div><div class="vt">${esc(String(x.text).replace(/<[^>]+>/g, ""))}</div>
        <div class="vs"><span>${esc(x.source)}${x.edition ? " · " + esc(x.edition) : ""}</span>${/^https:\/\//.test(x.verifyUrl || "") ? `<a href="${esc(x.verifyUrl)}" target="_blank" rel="noopener">تحقق من المصدر ↗</a>` : ""}</div>
        ${String(x.sourceId).startsWith("hisn-") && x.reference ? `<div class="vr">${esc(x.reference)}</div>` : ""}</li>`).join("");
      $("contentCard").hidden = false;
    } catch (e) { /* ما فيه محتوى: القسم يبقى مخفي */ }
  }

  $("citySearch").addEventListener("click", searchCity);
  $("cityQ").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchCity(); } });
  $("teamLeague").addEventListener("change", paintTeams);
  $("addFeed").addEventListener("click", addCustomFeed);
  $("feedUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustomFeed(); } });
  $("save").addEventListener("click", save);

  (remote ? loadRemote() : Promise.resolve()).then(fill).catch((e) => { fill(); status(e.message, true); }).then(loadVerify);
})();
