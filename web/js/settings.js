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
    const raw = await r.json();
    secretsSet = (raw && raw._secrets) || {}; // الأسرار ما ترجع من التلفزيون: بس نعرف أيّها محفوظ
    cfg = Config.sanitize(Object.assign({}, Config.DEFAULTS, raw)); // نفس فحص التلفزيون
  }

  // الأسرار (الرمز، ومفتاح البوت، وTodoist، ورابط التقويم) ما تنعرض: الحقل فاضي، وفاضي = يبقى المحفوظ.
  // الحذف بزر صريح بجنب الحقل (يرسل _clear للتلفزيون)
  let secretsSet = {};
  const clearSecrets = {};
  const SECRET_FIELDS = [["lockPin", "pin"], ["icalUrl", "icalUrl"], ["todoistToken", "todoistToken"], ["tgToken", "tgToken"]];
  function paintSecrets() {
    for (const [id, key] of SECRET_FIELDS) {
      const input = $(id);
      if (!input || !secretsSet[key]) continue;
      input.placeholder = clearSecrets[key] ? "سيُحذف عند الحفظ" : "محفوظ على التلفزيون (اتركه فاضي للإبقاء عليه)";
      if (!input.parentNode.querySelector(`[data-clear="${key}"]`)) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn"; b.dataset.clear = key; b.textContent = "حذف المحفوظ";
        b.addEventListener("click", () => { clearSecrets[key] = true; input.value = ""; input.placeholder = "سيُحذف عند الحفظ"; status("اضغط حفظ عشان يتطبق"); });
        input.after(b);
      }
    }
  }

  // ===== المدينة =====
  function paintCity() {
    $("cityNow").textContent = cfg.city ? `${cfg.city.name}${cfg.city.region ? "، " + cfg.city.region : ""}` : "ما اخترت مدينة";
    $("salaryRow").style.display = cfg.city && cfg.city.country !== "SA" ? "none" : "";
  }
  async function searchCity() {
    const q = $("cityQ").value.trim();
    if (q.length < 2) return;
    const near = localCities(q);
    if (near.length) showCities(near);
    else $("cityResults").innerHTML = `<li class="muted">نبحث…</li>`;
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ar&format=json`);
      const j = await r.json();
      const list = near.concat((j.results || []).filter((x) => x.timezone && !near.some((n) => Math.abs(n.latitude - x.latitude) < 0.1 && Math.abs(n.longitude - x.longitude) < 0.1)));
      if (!list.length) { $("cityResults").innerHTML = `<li class="muted">ما لقينا شي. جرّب اسم ثاني أو بالإنقليزي.</li>`; return; }
      showCities(list);
    } catch (e) {
      // بدون نت: اللي لقيناه محلياً يبقى
      if (!near.length) $("cityResults").innerHTML = `<li class="muted">ما قدرنا نبحث. تأكد من النت.</li>`;
    }
  }
  function showCities(list) {
    $("cityResults").innerHTML = list.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.name)}<small>${esc([x.admin1, x.country].filter(Boolean).join("، "))}</small></button></li>`).join("");
    $("cityResults").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const x = list[+b.dataset.i];
      const clean = (s) => String(s || "").replace(/[\u200E\u200F]/g, "").trim(); // علامات اتجاه مخفية تجي من GeoNames
      cfg.city = { name: clean(x.name), region: clean(x.admin1), lat: x.latitude, lon: x.longitude, tz: x.timezone, country: x.country_code };
      $("cityResults").innerHTML = ""; $("cityQ").value = "";
      paintCity();
    }));
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

  // ===== صوت الأذان: تشغيل عام، وكل صلاة لحالها =====
  const ADHAN_PRAYERS = [["fajr", "الفجر"], ["dhuhr", "الظهر"], ["asr", "العصر"], ["maghrib", "المغرب"], ["isha", "العشاء"]];
  function paintAdhan() {
    const a = cfg.adhan = Object.assign({ on: true, fajr: false, dhuhr: true, asr: true, maghrib: true, isha: true }, cfg.adhan);
    $("adhanOn").checked = !!a.on;
    $("adhanPrayers").innerHTML = ADHAN_PRAYERS.map(([k, n]) => `<button type="button" data-p="${k}" aria-pressed="${!!a[k]}">${n}</button>`).join("");
    $("adhanPrayers").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      cfg.adhan[b.dataset.p] = !cfg.adhan[b.dataset.p];
      b.setAttribute("aria-pressed", String(cfg.adhan[b.dataset.p]));
    }));
    $("adhanPrayers").style.display = a.on ? "" : "none";
    paintAdhanVoice();
  }

  // صوت الأذان من الجوال (يشتغل بس مع التلفزيون: الرابط من الباركود)
  async function paintAdhanVoice() {
    if (!remote) { $("adhanVoice").innerHTML = `<p class="tiny">رفع صوت أذان من عندك يكون من الجوال مع التلفزيون (صوّر الباركود).</p>`; return; }
    try {
      const j = await (await fetch("/api/adhan?token=" + encodeURIComponent(token))).json();
      $("adhanVoiceNow").textContent = j.custom ? "الصوت: صوت رفعته أنت ✓" : "الصوت: الافتراضي";
      $("adhanReset").style.display = j.custom ? "" : "none";
      $("fajrVoiceNow").textContent = j.fajr ? "صوت الفجر: صوت رفعته أنت ✓" : "الصوت الافتراضي واحد لكل الصلوات، وما فيه «الصلاة خير من النوم». ترفع هنا صوت للفجر بس.";
      $("fajrReset").style.display = j.fajr ? "" : "none";
      $("fajrTest").style.display = j.fajr ? "" : "none";
    } catch (e) { /* التلفزيون ما رد: نخلي النص زي ما هو */ }
  }
  async function uploadAdhan(fajr) {
    const input = $(fajr === true ? "fajrFile" : "adhanFile");
    const f = input.files[0];
    if (!f) { status("اختر ملف صوت من جوالك أول", true); return; }
    if (f.size > 10 * 1024 * 1024) { status("الملف أكبر من ١٠ ميجا", true); return; }
    status("نرفع الصوت…");
    try {
      const r = await fetch("/api/adhan?token=" + encodeURIComponent(token) + (fajr === true ? "&kind=fajr" : ""), { method: "POST", body: f });
      if (r.status === 415) throw new Error("هذا مو ملف صوت. اختر mp3 أو m4a");
      if (!r.ok) throw new Error("ما انرفع. جرّب مرة ثانية");
      status("انرفع الصوت ✓ اضغط (جرّب الصوت) تسمعه");
      input.value = "";
      paintAdhanVoice();
    } catch (e) { status(e.message, true); }
  }
  async function adhanCall(path, method, done, fajr) {
    try {
      const r = await fetch(path + "?token=" + encodeURIComponent(token) + (fajr ? "&kind=fajr" : ""), { method });
      if (!r.ok) throw new Error();
      status(done); paintAdhanVoice();
    } catch (e) { status("ما قدرنا نوصل للتلفزيون", true); }
  }

  // ===== وقت المسجد والإقامة =====
  function paintTimes() {
    const options = (cur, lo, hi, empty) => `<option value="0">${empty}</option>` + Array.from({ length: hi - lo + 1 }, (_, i) => i + lo).filter((n) => n)
      .map((n) => `<option value="${n}" ${n === cur ? "selected" : ""}>${n > 0 && lo < 0 ? "+" : ""}${ar(n)}</option>`).join("");
    $("prayerAdjust").innerHTML = ADHAN_PRAYERS.map(([k, n]) => `<label>${n}<select data-p="${k}">${options((cfg.prayerAdjust || {})[k] || 0, -10, 10, "بدون")}</select></label>`).join("");
    $("iqama").innerHTML = ADHAN_PRAYERS.map(([k, n]) => `<label>${n}<select data-p="${k}">${options((cfg.iqama || {})[k] || 0, 1, 40, "تقريبي")}</select></label>`).join("");
    const warn = () => {
      const v = (p) => +$("prayerAdjust").querySelector(`[data-p="${p}"]`).value;
      $("adjustWarn").hidden = !(v("fajr") || v("maghrib"));
    };
    $("prayerAdjust").querySelectorAll("select").forEach((s) => s.addEventListener("change", warn));
    warn();
  }
  const readTimes = (id) => { const o = {}; $(id).querySelectorAll("select").forEach((s) => { if (+s.value) o[s.dataset.p] = +s.value; }); return o; };

  // ===== مدن بدون نت =====
  const normCity = (s) => String(s || "").toLowerCase().replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
  function localCities(q) {
    const n = normCity(q);
    return (window.CITIES || []).filter((c) => normCity(c.name).includes(n) || normCity(c.en).includes(n)).slice(0, 6)
      .map((c) => ({ name: c.name, admin1: c.region, country: "", latitude: c.lat, longitude: c.lon, timezone: c.tz, country_code: c.country }));
  }

  // ===== نقل الإعدادات: بدون أسرار، والجهاز الثاني يفحصها بنفس الفحص =====
  function exportCfg() {
    const out = Object.assign({}, cfg);
    delete out.icalUrl; delete out.todoistToken; delete out.pinned; delete out.inputNames; delete out.kids;
    out.lock = { pin: "", apps: [] };
    out.telegram = { token: "", code: "", allowed: [], fails: 0 };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
    a.download = "riwaq-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    status("حفظنا الملف ✓");
  }
  async function importCfg() {
    const f = $("importCfg").files[0];
    if (!f) return;
    try {
      if (f.size > 64 * 1024) throw new Error();
      const j = JSON.parse(await f.text());
      if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
      // اللي يخص هذا الجهاز يبقى: الرمز والتطبيقات والمفاتيح
      const keep = { lock: cfg.lock, pinned: cfg.pinned, kids: cfg.kids, inputNames: cfg.inputNames, icalUrl: cfg.icalUrl, todoistToken: cfg.todoistToken, telegram: cfg.telegram };
      cfg = Config.sanitize(Object.assign({}, Config.DEFAULTS, j, keep, { v: 3 }));
      fill();
      status("قرينا الملف. راجع الإعدادات واضغط حفظ");
    } catch (e) { status("هذا مو ملف إعدادات رواق", true); }
    $("importCfg").value = "";
  }

  // ===== ألبوم البيت =====
  // نصغّر في الجوال لـ١٩٢٠ بكسل ونرسم من جديد: هذا يشيل الموقع والتاريخ وكل بيانات الصورة قبل ما تطلع من الجوال
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1920 / img.width, 1080 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error())), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error()); };
      img.src = url;
    });
  }
  const albumUrl = (x) => `/api/album${x ? "/" + x : ""}?token=${encodeURIComponent(token)}`;
  async function loadAlbum() {
    if (!remote) return;
    $("albumCard").hidden = false;
    try {
      const j = await (await fetch(albumUrl())).json();
      $("albumList").innerHTML = (j.ids || []).map((id) => `<button type="button" data-id="${+id}" aria-label="حذف الصورة"><img src="${albumUrl(+id)}" alt=""><span>اضغط للحذف</span></button>`).join("");
      $("albumList").querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
        await fetch(albumUrl(b.dataset.id), { method: "DELETE" }); loadAlbum(); status("انحذفت الصورة ✓");
      }));
    } catch (e) { /* التلفزيون ما رد */ }
  }
  async function uploadAlbum() {
    const files = [...$("albumFile").files];
    if (!files.length) { status("اختر صور من جوالك أول", true); return; }
    let done = 0;
    for (const f of files) {
      status(`نرفع ${ar(done + 1)} من ${ar(files.length)}…`);
      try {
        const r = await fetch(albumUrl(), { method: "POST", body: await shrink(f) });
        if (r.status === 409) { status("الألبوم مليان (١٠ صور). احذف صورة أول", true); break; }
        if (!r.ok) throw new Error();
        done++;
      } catch (e) { status("صورة ما انرفعت. جرّب مرة ثانية", true); break; }
    }
    if (done) status(`انرفعت ${ar(done)} ✓`);
    $("albumFile").value = "";
    loadAlbum();
  }

  // ===== صورة من عندك للتطبيق =====
  // نقص الوسط لنسبة ١٦:٩ ونرسم من جديد: يشيل الموقع والتاريخ وكل بيانات الصورة قبل ما تطلع من الجوال
  function cropBanner(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const W = 640, H = 360, k = Math.max(W / img.width, H / img.height), w = W / k, h = H / k;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        c.getContext("2d").drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, W, H);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error())), "image/jpeg", 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error()); };
      img.src = url;
    });
  }
  const appImgUrl = (pkg) => `/api/appimage/${encodeURIComponent(pkg)}?token=${encodeURIComponent(token)}`;
  let appImgList = [];
  function paintAppImg() {
    const it = appImgList.find((a) => a.id === $("appImgApp").value);
    const on = !!(it && it.custom);
    $("appImgReset").style.display = on ? "" : "none";
    $("appImgNow").hidden = !on;
    if (on) $("appImgNow").src = appImgUrl(it.id) + "&t=" + Date.now(); else $("appImgNow").removeAttribute("src");
  }
  async function loadAppImages() {
    if (!remote) return;
    try {
      const keep = $("appImgApp").value;
      appImgList = await (await fetch("/api/apps?token=" + encodeURIComponent(token))).json();
      $("appImgApp").innerHTML = appImgList.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}${a.custom ? " ✓" : ""}</option>`).join("");
      if (keep) $("appImgApp").value = keep;
      $("appImgCard").hidden = false;
      paintAppImg();
    } catch (e) { /* التلفزيون ما رد */ }
  }
  async function uploadAppImage() {
    const f = $("appImgFile").files[0];
    if (!f) { status("اختر صورة من جوالك أول", true); return; }
    status("نرفع الصورة…");
    try {
      const r = await fetch(appImgUrl($("appImgApp").value), { method: "POST", body: await cropBanner(f) });
      if (!r.ok) throw new Error();
      $("appImgFile").value = "";
      await loadAppImages();
      status("انحفظت الصورة ✓ تطلع لما ترجع للواجهة");
    } catch (e) { status("الصورة ما انرفعت. جرّب صورة ثانية", true); }
  }
  async function resetAppImage() {
    try { await fetch(appImgUrl($("appImgApp").value), { method: "DELETE" }); await loadAppImages(); status("رجع شكله الأصلي ✓"); }
    catch (e) { status("ما قدرنا نوصل للتلفزيون", true); }
  }

  // ===== أسماء المداخل، وشاشة المجلس (مع التلفزيون بس) =====
  async function loadInputs() {
    if (!remote) return;
    try {
      const list = await (await fetch("/api/inputs?token=" + encodeURIComponent(token))).json();
      if (!list.length) return;
      $("inputNames").innerHTML = list.map((i) => `<label class="inp-row"><bdi>${esc(i.name)}</bdi><input type="text" maxlength="20" data-id="${esc(i.id)}" value="${esc((cfg.inputNames || {})[i.id] || "")}" placeholder="${esc(i.name)}"></label>`).join("");
      $("inputsCard").hidden = false;
    } catch (e) { /* التلفزيون ما رد: القسم يبقى مخفي */ }
  }
  async function loadMajlis() {
    if (!remote) return;
    $("majlisCard").hidden = false;
    try {
      const j = await (await fetch("/api/majlis?token=" + encodeURIComponent(token))).json();
      $("majlisSsid").value = j.ssid || "";
      if (j.ssid) $("majlisPass").placeholder = "محفوظة (اكتبها من جديد لو بتغيّر الشبكة)";
    } catch (e) { /* نخلي الحقول فاضية */ }
  }
  async function saveMajlis() {
    const ssid = $("majlisSsid").value.trim();
    if (!ssid) { status("اكتب اسم الشبكة", true); return; }
    try {
      const r = await fetch("/api/majlis?token=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ssid, pass: $("majlisPass").value }) });
      if (!r.ok) throw new Error();
      $("majlisPass").value = ""; $("majlisPass").placeholder = "محفوظة (اكتبها من جديد لو بتغيّر الشبكة)";
      status("انحفظت الشبكة ✓");
    } catch (e) { status("ما انحفظت. جرّب مرة ثانية", true); }
  }
  async function clearMajlis() {
    try { await fetch("/api/majlis?token=" + encodeURIComponent(token), { method: "DELETE" }); $("majlisSsid").value = ""; $("majlisPass").value = ""; status("انحذفت الشبكة ✓"); }
    catch (e) { status("ما قدرنا نوصل للتلفزيون", true); }
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
    cfg.density = ["full", "frame"].includes($("density").value) ? $("density").value : "calm";
    cfg.homeLayout = $("homeLayout").value === "classic" ? "classic" : "moment";
    cfg.clockFont = $("clockFont").value;
    cfg.adhanVolume = +$("adhanVolume").value || 0;
    cfg.albumMode = $("albumMode").value;
    cfg.continueRow = $("continueRow").checked;
    cfg.roshn = $("roshn").checked;
    cfg.roshnAsked = true;
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
    paintAdhan();
    $("reminders").checked = cfg.reminders !== false;
    $("showSalary").checked = cfg.showSalary === true;
    $("homeLayout").value = cfg.homeLayout === "classic" ? "classic" : "moment";
    $("clockFont").value = cfg.clockFont || "amiri";
    $("adhanVolume").value = String(cfg.adhanVolume === undefined ? 40 : cfg.adhanVolume);
    $("albumMode").value = cfg.albumMode || "off";
    loadAlbum();
    loadAppImages();
    $("continueRow").checked = cfg.continueRow !== false;
    $("roshn").checked = cfg.roshn === true;
    $("kidsOn").checked = !!(cfg.kids && cfg.kids.on);
    paintTimes();
    loadInputs();
    loadMajlis();
    $("icalUrl").value = cfg.icalUrl || "";
    $("todoistToken").value = cfg.todoistToken || "";
    paintTelegram();
    paintQuran();
    $("sunnahDaily").checked = cfg.sunnahDaily !== false;
    $("placeDaily").checked = cfg.placeDaily !== false;
    $("motion").checked = cfg.motion !== false;
    $("bgStyle").value = cfg.bgStyle === "drawn" ? "drawn" : "photo";
    $("density").value = ["full", "frame"].includes(cfg.density) ? cfg.density : "calm";
    $("nightClock").checked = cfg.nightClock !== false;
    $("saverStay").checked = cfg.saverStay !== false;
    $("screenOffTime").value = cfg.screenOffTime || "";
    $("lockPin").value = (cfg.lock && cfg.lock.pin) || "";
    paintSecrets();
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
    cfg.kids = { on: $("kidsOn").checked, apps: [...$("kidsApps").querySelectorAll("input:checked")].map((x) => x.value) };
    if (cfg.kids.on && !pin && !secretsSet.pin) { status("وضع الأطفال يحتاج رمز قفل", true); return; }
    if (cfg.kids.on && !cfg.kids.apps.length) { status("اختر تطبيق واحد على الأقل لوضع الأطفال", true); return; }
    cfg.prayerAdjust = readTimes("prayerAdjust");
    cfg.iqama = readTimes("iqama");
    const names = {};
    $("inputNames").querySelectorAll("input").forEach((x) => { const v = x.value.trim(); if (v) names[x.dataset.id] = v; });
    if ($("inputNames").children.length) cfg.inputNames = names;
    cfg.nightClock = $("nightClock").checked;
    cfg.saverStay = $("saverStay").checked;
    cfg.screenOffTime = $("screenOffTime").value || "";
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
    cfg.adhan = Object.assign({}, cfg.adhan, { on: $("adhanOn").checked });
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
        const r = await fetch("/api/config?token=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, cfg, { _clear: Object.keys(clearSecrets) })) });
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
    const kidsOk = new Set((cfg.kids && cfg.kids.apps) || []);
    $("kidsApps").innerHTML = list.map((a) => `<label><input type="checkbox" value="${esc(a.id)}" ${kidsOk.has(a.id) ? "checked" : ""}><bdi>${esc(a.name)}</bdi></label>`).join("");
  }

  // محتوى اليوم مع روابط التحقق (نفس طريقة اختيار الشاشة: عنصر لكل يوم)
  async function loadVerify() {
    const file = new URLSearchParams(location.search).get("content") === "hadeethenc" ? "content/candidates/hadeethenc.json" : (cfg.contentFile || "content/approved.json");
    try {
      const j = await (await fetch(file)).json();
      const items = (j.items || []).filter((x) => x.approved === true && x.text && x.source && (!window.Rules || Rules.displayable(x)));
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
  $("majlisSave").addEventListener("click", saveMajlis);
  $("majlisClear").addEventListener("click", clearMajlis);
  if ($("adhanUpload")) $("adhanUpload").addEventListener("click", () => uploadAdhan(false));
  $("fajrUpload").addEventListener("click", () => uploadAdhan(true));
  $("fajrTest").addEventListener("click", () => adhanCall("/api/adhan/test", "POST", "يشتغل أذان الفجر على التلفزيون الحين", true));
  $("fajrReset").addEventListener("click", () => adhanCall("/api/adhan", "DELETE", "انحذف صوت الفجر ✓", true));
  $("albumUpload").addEventListener("click", uploadAlbum);
  $("appImgUpload").addEventListener("click", uploadAppImage);
  $("appImgReset").addEventListener("click", resetAppImage);
  $("appImgApp").addEventListener("change", paintAppImg);
  $("exportCfg").addEventListener("click", exportCfg);
  $("importCfg").addEventListener("change", importCfg);
  if ($("adhanTest")) $("adhanTest").addEventListener("click", () => adhanCall("/api/adhan/test", "POST", "يشتغل الأذان على التلفزيون الحين (رجوع يوقفه)"));
  if ($("adhanReset")) $("adhanReset").addEventListener("click", () => adhanCall("/api/adhan", "DELETE", "رجع الصوت الافتراضي ✓"));
  $("adhanOn").addEventListener("change", () => { cfg.adhan.on = $("adhanOn").checked; $("adhanPrayers").style.display = cfg.adhan.on ? "" : "none"; });

  (remote ? loadRemote() : Promise.resolve()).then(fill).catch((e) => { fill(); status(e.message, true); }).then(loadVerify);
})();
