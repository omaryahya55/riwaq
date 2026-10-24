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
  const MAX_TEAMS = 3;

  let cfg = Object.assign({}, CONFIG);

  function status(msg, bad) { const s = $("status"); s.textContent = msg; s.classList.toggle("bad", !!bad); }

  async function loadRemote() {
    const r = await fetch("/api/config?token=" + encodeURIComponent(token));
    if (!r.ok) throw new Error(r.status === 403 ? "الرابط انتهى. صوّر الباركود من التلفزيون مرة ثانية." : "ما قدرنا نوصل للتلفزيون");
    cfg = Object.assign({}, Config.DEFAULTS, await r.json());
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
  function paintFeeds() {
    const list = cfg.newsFeeds.length ? cfg.newsFeeds : [""];
    $("feeds").innerHTML = list.map((u, i) => `<div class="feed"><input type="url" inputmode="url" placeholder="https://..." value="${esc(u)}" data-i="${i}" aria-label="رابط RSS"><button class="btn" type="button" data-del="${i}" aria-label="حذف">✕</button></div>`).join("");
    $("feeds").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      readFeeds(); cfg.newsFeeds.splice(+b.dataset.del, 1); paintFeeds();
    }));
    $("addFeed").style.display = list.length >= 3 ? "none" : "";
  }
  function readFeeds() {
    cfg.newsFeeds = [...$("feeds").querySelectorAll("input")].map((x) => x.value.trim()).filter(Boolean);
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
    $("teamLeague").innerHTML = LEAGUES.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
    $("leagues").innerHTML = LEAGUES.map((l) => `<label><input type="checkbox" value="${l.id}" ${cfg.leagues.includes(l.id) ? "checked" : ""}>${l.name.replace(" السعودي", "")}</label>`).join("");
    paintCity(); paintTeams(); paintFeeds();
  }

  async function save() {
    readFeeds();
    const bad = cfg.newsFeeds.find((u) => !/^https?:\/\/[^\s]+$/i.test(u));
    if (bad) { status("رابط الأخبار لازم يبدأ بـ https://", true); return; }
    const ical = $("icalUrl").value.trim();
    if (ical && !/^https:\/\/[^\s]+$/i.test(ical)) { status("رابط التقويم لازم يبدأ بـ https://", true); return; }
    cfg.icalUrl = ical;
    cfg.method = $("method").value;
    cfg.hijriOffset = +$("hijriOffset").value;
    cfg.alertMinutes = +$("alertMinutes").value;
    cfg.reminders = $("reminders").checked;
    cfg.showSalary = $("showSalary").checked;
    cfg.leagues = [...$("leagues").querySelectorAll("input:checked")].map((x) => x.value);
    cfg.sideCard = cfg.leagues.length ? "leagues" : "none";
    try {
      if (remote) {
        const r = await fetch("/api/config?token=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
        if (!r.ok) throw new Error(r.status === 403 ? "الرابط انتهى. صوّر الباركود مرة ثانية." : "ما انحفظ. جرّب مرة ثانية.");
      } else {
        Config.save(cfg);
      }
      status("انحفظ ✓");
    } catch (e) { status(e.message, true); }
  }

  // محتوى اليوم مع روابط التحقق (نفس طريقة اختيار الشاشة: عنصر لكل يوم)
  async function loadVerify() {
    const file = new URLSearchParams(location.search).get("content") === "hadeethenc" ? "content/candidates/hadeethenc.json" : (cfg.contentFile || "content/approved.json");
    try {
      const j = await (await fetch(file)).json();
      const items = (j.items || []).filter((x) => x.approved === true && x.text && x.source);
      if (!items.length) return;
      const day = Math.floor(Date.now() / 86400000);
      const pickOf = (type) => { const l = items.filter((x) => x.type === type); return l.length ? l[day % l.length] : null; };
      const list = [["حديث اليوم", pickOf("hadith")], ["في فضل الصحابة", pickOf("sahabi")]]
        .concat(items.filter((x) => x.type === "adhkar").map((x) => ["من أذكار الصباح والمساء", x]))
        .filter((x) => x[1]);
      $("verifyList").innerHTML = list.map(([title, x]) => `<li><div class="vs"><b>${esc(title)}</b></div><div class="vt">${esc(String(x.text).replace(/<[^>]+>/g, ""))}</div>
        <div class="vs"><span>${esc(x.source)}${x.edition ? " · " + esc(x.edition) : ""}</span>${/^https:\/\//.test(x.verifyUrl || "") ? `<a href="${esc(x.verifyUrl)}" target="_blank" rel="noopener">تحقق من المصدر ↗</a>` : ""}</div></li>`).join("");
      $("contentCard").hidden = false;
    } catch (e) { /* ما فيه محتوى: القسم يبقى مخفي */ }
  }

  $("citySearch").addEventListener("click", searchCity);
  $("cityQ").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchCity(); } });
  $("teamLeague").addEventListener("change", paintTeams);
  $("addFeed").addEventListener("click", () => { readFeeds(); cfg.newsFeeds.push(""); paintFeeds(); cfg.newsFeeds = cfg.newsFeeds.filter(Boolean); });
  $("save").addEventListener("click", save);

  (remote ? loadRemote() : Promise.resolve()).then(fill).catch((e) => { fill(); status(e.message, true); }).then(loadVerify);
})();
