/*
 * الواجهة الرئيسية.
 * فوق: التاريخ، وشريط تنقل (الإعدادات، شاشة الانتظار، اختيار التطبيقات، الأذكار والأحاديث)، والوقت والطقس.
 * الوسط: ثلاث بطاقات (الصلاة القادمة، الأذكار والأحاديث، اليوم).
 * تحت: صف التطبيقات اللي يختارها المستخدم ويرتبها، وصف المداخل (لو الجهاز فيه مداخل).
 * على التلفزيون: التطبيقات وأيقوناتها والمداخل تجي من أندرويد (Riwaq.*). في المتصفح: قائمة تجريبية.
 */
(function () {
  const native = () => !!(window.Riwaq && Riwaq.getApps);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 86400000;

  let apps = [], appById = {}, inputs = [];
  let pinned = [];
  let row = 1, col = 0;      // الصف ٠ = شريط التنقل، ١ = التطبيقات، ٢ = المداخل
  let mode = "nav";          // nav | menu | move | picker | reader | quick | pin
  let menuIdx = 0, pickIdx = 0, readIdx = 0, readList = [], quickIdx = 0;
  let pinDigits = [0, 0, 0, 0], pinPos = 0, pinThen = null, pinTries = 0;
  let root;

  const TINTS = ["#C8463D", "#2F9C7A", "#1F5FA8", "#5B3FA6", "#9E6B2B", "#2E6F5E", "#6A2C91", "#1E6F9F", "#8A3B5C", "#3F5A2E"];
  const NAV = [
    { type: "nav", id: "quick", name: "التلفزيون", ic: "tv" },
    { type: "nav", id: "settings", name: "الإعدادات", ic: "gear" },
    { type: "nav", id: "saver", name: "شاشة الانتظار", ic: "moon" },
    { type: "nav", id: "picker", name: "التطبيقات", ic: "grid" },
    { type: "nav", id: "timed", name: "ذكر الوقت", ic: "bell" },
    { type: "nav", id: "reader", name: "الأذكار", ic: "book" }
  ];
  // اللوحة السريعة (بدل لوحة Google TV اللي كانت تطلع بضغطة البيت المطوّلة)
  const QUICK = [
    { id: "system", name: "إعدادات التلفزيون", ic: "gear" },
    { id: "wifi", name: "الواي فاي والشبكة", ic: "wifi" },
    { id: "bluetooth", name: "البلوتوث والريموت", ic: "bt" },
    { id: "sound", name: "الصوت", ic: "sound" },
    { id: "display", name: "الشاشة والصورة", ic: "tv" },
    { id: "riwaq", name: "إعدادات رواق (بالجوال)", ic: "grid" },
    { id: "saver", name: "شاشة الانتظار الحين", ic: "moon" }
  ];

  function loadApps() {
    if (native()) {
      try { apps = JSON.parse(Riwaq.getApps()) || []; } catch (e) { apps = []; }
      try { inputs = JSON.parse(Riwaq.getInputs()) || []; } catch (e) { inputs = []; }
    } else {
      apps = window.DEMO ? DEMO.apps.map((a) => ({ id: a.id, name: a.name, tint: a.tint })) : [];
      inputs = window.DEMO ? DEMO.inputs : [];
    }
    apps.forEach((a, i) => { if (!a.tint) a.tint = TINTS[i % TINTS.length]; });
    appById = Object.fromEntries(apps.map((a) => [a.id, a]));
    const saved = Array.isArray(CONFIG.pinned) ? CONFIG.pinned : (window.DEMO && !native() ? DEMO.pinned : defaultPinned());
    pinned = saved.filter((id) => appById[id]);
  }

  // أول مرة (قبل ما يختار المستخدم): التطبيقات المشهورة أول، وتطبيقات النظام (الإعدادات والمتجر) آخر شي
  const POPULAR = ["com.google.android.youtube.tv", "net.mbc.shahid", "net.mbc.shahidTV", "com.netflix.ninja",
    "com.amazon.amazonvideo.livingroom", "com.disney.disneyplus", "com.google.android.youtube.tvkids", "com.spotify.tv.android"];
  const SYSTEM = ["com.android.tv.settings", "com.android.settings", "com.android.vending", "com.google.android.play.games",
    "com.google.android.tv", "com.google.android.youtube.tvmusic"];
  function defaultPinned() {
    const rank = (id) => { const p = POPULAR.indexOf(id); return p >= 0 ? p : SYSTEM.includes(id) ? 1000 : 100; };
    return apps.map((a) => a.id).sort((x, y) => rank(x) - rank(y)).slice(0, 8);
  }
  function save() { Config.save({ pinned: pinned.slice() }); }

  // تفتيح وتغميق لون (بدل color-mix اللي ما يشتغل على متصفحات التلفزيونات القديمة)
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
  }

  function rows() {
    const R = [NAV, pinned.map((id) => ({ type: "app", id, name: appById[id].name }))];
    if (inputs.length) R.push(inputs.map((i) => ({ type: "input", id: i.id, name: i.name, ic: i.icon || "hdmi" })));
    return R;
  }

  function tileHTML(item, r, c) {
    if (item.type === "app") {
      const a = appById[item.id];
      // البانر فيه اسم التطبيق أصلاً: اسمنا يطلع بس لما يتحدد
      const lockBadge = isLocked(a.id) ? `<span class="lock-badge">${icon("lock")}</span>` : "";
      if (a.banner) return `<div class="tile has-img" data-r="${r}" data-c="${c}">${lockBadge}<img src="${a.banner}" alt=""><div class="name clip"><bdi>${esc(a.name)}</bdi></div></div>`;
      if (a.icon) return `<div class="tile has-icon" data-r="${r}" data-c="${c}" style="--c1:${shade(a.tint, 0.04)};--c2:${shade(a.tint, -0.55)}">${lockBadge}<div class="bg"></div><img class="app-ic" src="${a.icon}" alt=""><div class="name clip"><bdi>${esc(a.name)}</bdi></div></div>`;
      const mono = /^[A-Za-z]/.test(a.name) ? a.name[0] : a.name.replace(/^ال/, "")[0];
      return `<div class="tile" data-r="${r}" data-c="${c}" style="--c1:${shade(a.tint, 0.08)};--c2:${shade(a.tint, -0.45)}">${lockBadge}<div class="bg"></div><div class="mono">${esc(mono)}</div><div class="name clip"><bdi>${esc(a.name)}</bdi></div></div>`;
    }
    return `<div class="tile small" data-r="${r}" data-c="${c}">${icon(item.ic)}<div class="name clip"><bdi>${esc(item.name)}</bdi></div></div>`;
  }

  function build(el) {
    el.innerHTML = `
      <div class="shade home-shade"></div>
      <div class="h-top soft-shadow">
        <div class="h-date" data-k="date"></div>
        <div class="h-center">
          <div class="h-brand" aria-label="رِواق">رِواق</div>
          <nav class="h-nav">${NAV.map((n, c) => `<div class="nav-pill" data-r="0" data-c="${c}">${icon(n.ic)}<span>${n.name}</span></div>`).join("")}</nav>
        </div>
        <div class="h-status">
          <span class="chip" data-k="wx"></span>
          <span class="h-time" data-k="time"></span>
        </div>
      </div>

      <div class="h-dash">
        <section class="h-card h-prayer" data-k="prayerCard"></section>
        <section class="h-card h-content" data-k="contentCard"></section>
        <section class="h-card h-today" data-k="todayCard"></section>
      </div>

      <div class="h-rows">
        <div class="h-row">
          <div class="h-row-head"><div class="h-row-title">تطبيقاتك</div><div class="h-row-hint">OK مطوّل على أي تطبيق: تحريك أو إخفاء · السهم فوق: الإعدادات وشاشة الانتظار</div></div>
          <div class="h-track"><div class="h-strip" data-k="r1"></div></div>
        </div>
        <div class="h-row small" data-k="inputsRow">
          <div class="h-row-head"><div class="h-row-title">المداخل</div></div>
          <div class="h-track"><div class="h-strip" data-k="r2"></div></div>
        </div>
      </div>

      <div class="tile-menu" data-k="menu">
        <div class="opt">${icon("move")}تحريك</div>
        <div class="opt">${icon("hide")}إخفاء</div>
      </div>
      <div class="picker" data-k="picker">
        <h2>اختيار التطبيقات</h2>
        <p>اللي تختاره يطلع في الواجهة. <span class="picker-count" data-k="count"></span><br>رتّبه بعدين من الواجهة نفسها.</p>
        <div class="picker-list"><div class="picker-scroll" data-k="plist"></div></div>
      </div>
      <div class="quick" data-k="quick">
        <h2>${icon("tv")}التلفزيون</h2>
        <div class="quick-list" data-k="qlist"></div>
      </div>
      <div class="pin" data-k="pin">
        <div class="pin-box">
          <div class="pin-title">${icon("lock")}<span>التطبيق مقفل</span></div>
          <p class="pin-sub" data-k="pinSub">اكتب الرمز</p>
          <div class="pin-digits" data-k="pinDigits"></div>
          <div class="pin-hint">فوق وتحت: الرقم · يمين ويسار: الخانة · OK: فتح · رجوع: إلغاء</div>
        </div>
      </div>
      <div class="reader" data-k="reader">
        <div class="reader-box">
          <div class="reader-head"><span data-k="rTitle"></span><span class="reader-count" data-k="rCount"></span></div>
          <img class="reader-img" data-k="rImg" alt="" hidden>
          <p class="reader-text" data-k="rText"></p>
          <div class="reader-src" data-k="rSrc"></div>
          <div class="reader-ref" data-k="rRef"></div>
          <div class="reader-hint" data-k="rHint"></div>
        </div>
      </div>`;
    return el;
  }

  const $ = (k) => root.querySelector(`[data-k="${k}"]`);

  function renderRows() {
    const R = rows();
    $("r1").innerHTML = R[1].length ? R[1].map((it, c) => tileHTML(it, 1, c)).join("")
      : `<div class="h-row-hint" style="padding-top:60px">ما اخترت أي تطبيق. اضغط السهم فوق واختر "اختيار التطبيقات".</div>`;
    $("inputsRow").style.display = inputs.length ? "" : "none";
    if (inputs.length) $("r2").innerHTML = R[2].map((it, c) => tileHTML(it, 2, c)).join("");
    if (row >= R.length) row = R.length - 1;
    if (row === 1 && !R[1].length) row = 0;
    col = Math.max(0, Math.min(col, R[row].length - 1));
    paintFocus();
  }

  function paintFocus() {
    root.querySelectorAll(".tile, .nav-pill").forEach((t) => t.classList.remove("focus", "moving"));
    const t = root.querySelector(`[data-r="${row}"][data-c="${col}"]`);
    if (t && !["picker", "reader", "quick", "pin"].includes(mode)) t.classList.add(mode === "move" ? "moving" : "focus");
    // صف طويل: نزحلقه عشان التطبيق المختار يبان
    if (row > 0) {
      const strip = $("r" + row), pitch = row === 1 ? 328 : 248, w = row === 1 ? 300 : 220;
      if (strip) strip.style.transform = `translateX(${Math.max(0, col * pitch + w - 1736 + 60)}px)`;
    }
    const menu = $("menu");
    menu.classList.toggle("on", mode === "menu");
    if (mode === "menu" && t) {
      const st = document.getElementById("stage").getBoundingClientRect(), tb = t.getBoundingClientRect(), s = st.width / 1920;
      menu.style.top = ((tb.top - st.top) / s - 86) + "px";
      menu.style.left = ((tb.left - st.left) / s) + "px";
      menu.querySelectorAll(".opt").forEach((o, i) => o.classList.toggle("focus", i === menuIdx));
    }
  }

  function renderPicker() {
    $("count").textContent = `مختار ${F.digits(pinned.length)} من ${F.digits(apps.length)}.`;
    $("plist").innerHTML = apps.map((a, i) => `<div class="pk ${pinned.includes(a.id) ? "on" : ""} ${i === pickIdx ? "focus" : ""}" style="--tint:${a.tint}">${a.icon ? `<img class="sw-img" src="${a.icon}" alt="">` : `<span class="sw"></span>`}<span class="nm"><bdi>${esc(a.name)}</bdi></span><span class="ck">${icon("check")}</span></div>`).join("");
    const shift = Math.max(0, pickIdx * 74 - 760 + 74 * 2);
    $("plist").style.transform = `translateY(${-Math.min(shift, Math.max(0, apps.length * 74 - 760))}px)`;
  }

  // ===== البطاقات =====
  function renderPrayerCard(now) {
    const el = $("prayerCard");
    const np = Prayer.next(now);
    if (!np) {
      el.innerHTML = `<div class="label">${icon("bell")}أهلاً بك في رواق</div><div class="hp-welcome">حدد مدينتك</div><div class="hp-sub">اضغط السهم فوق واختر <b>الإعدادات</b>، وصوّر الباركود بجوالك عشان تطلع أوقات الصلاة والطقس</div>`;
      return;
    }
    const t = F.clock(np.p.at);
    const cells = np.today.map((p) => {
      const c = F.clock(p.at);
      const cls = p.id === np.p.id ? "next" : p.at <= now ? "past" : "";
      return `<div class="hp-cell ${cls}"><div class="n">${p.name}</div><div class="t">${c.h}:${c.m}</div></div>`;
    }).join("");
    el.innerHTML = `<div class="label">${icon("bell")}الصلاة القادمة</div>
      <div class="hp-row"><div class="hp-name">${np.p.name}</div><div class="hp-when"><span class="ltr">${t.h}:${t.m}</span> ${t.ampm}<b>بعد ${F.duration(np.mins)}</b></div></div>
      <div class="hp-cells">${cells}</div>`;
  }

  // نفس قاعدة شاشة الانتظار: ممنوع نقص النص. نصغّر الخط، وإذا ما دخل ناخذ البديل اللي بعده
  // (والنص الطويل ينقرا كامل من "الأذكار" فوق)
  function renderContentCard(now) {
    const el = $("contentCard");
    for (let offset = 0; offset < 6; offset++) {
      const c = window.Content && Content.current(now, offset);
      if (!c) break;
      const text = String(c.item.text).replace(/<[^>]+>/g, "").trim();
      const hasRef = !!Content.credit(c.item, true).reference;
      for (const full of hasRef ? [true, false] : [false]) {
        const cr = Content.credit(c.item, full);
        const img = /^img\/places\/[a-z0-9-]+\.jpg$/.test(c.item.image || "") ? `<img class="hc-place-img" src="${c.item.image}" alt="">` : "";
        el.innerHTML = `<div class="label">${icon("book")}${esc(c.title)}</div>${img}<p class="hc-text ${Content.fontClass(c.item)}">${esc(text)}</p>
          <div class="hc-src">${esc(cr.source)}</div>${cr.reference ? `<div class="hc-src hc-ref">${esc(cr.reference)}</div>` : ""}`;
        for (const size of ["", "long", "xlong"]) {
          el.classList.remove("long", "xlong"); if (size) el.classList.add(size);
          if (el.scrollHeight <= el.clientHeight + 1) return;
        }
      }
    }
    el.classList.remove("long", "xlong");
    el.innerHTML = `<div class="label">${icon("book")}الأذكار والأحاديث</div><p class="hc-empty">تطلع هنا أذكار الصباح والمساء في وقتها، وحديث اليوم. اضغط السهم فوق واختر <b>الأذكار</b> عشان تقراها كاملة.</p>`;
  }

  function renderTodayCard(now) {
    const el = $("todayCard");
    const lines = [];
    const w = DATA.weather(), days = DATA.forecast();
    if (w) {
      const g = F.weather(w.data.now.code), d = days && days[0];
      lines.push(`<div class="ht-wx">${icon(g[1])}<span class="ht-temp">${F.num(w.data.now.temp)}°</span><span>${g[0]}${d ? `<small>${F.num(d.max)}° / ${F.num(d.min)}°</small>` : ""}</span></div>`);
    }
    const H = window.Saver && Saver.helpers;
    // مباراة الفريق
    const fm = DATA.featuredMatch(now);
    if (fm) {
      const E = fm.ev, nm = (id, en) => esc((window.TEAMS_AR && TEAMS_AR[id]) || en);
      const mid = fm.kind === "last" ? `<small style="display:inline">${F.digits(E.hs)} - ${F.digits(E.as)}</small>` : "×";
      const sub = fm.kind === "last" ? "النتيجة" : new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { timeZone: F.TZ, weekday: "long", hour: "numeric", minute: "2-digit" }).format(fm.at);
      lines.push(`<div class="ht-line">${icon("ball")}<span><bdi>${nm(E.homeId, E.home)}</bdi> ${mid} <bdi>${nm(E.awayId, E.away)}</bdi><small>${sub}</small></span></div>`);
    }
    // ذكر الوقت: أول سطر (أهم شي الحين)
    const tm = window.Content && Content.timed ? Content.timed(now) : [];
    if (tm.length) lines.unshift(`<div class="ht-line ht-timed">${icon("bell")}<span>حان وقت ${esc(tm.map((s) => s.title).join(" و"))}<small>افتحها كاملة من «ذكر الوقت» فوق</small></span></div>`);
    if (H) {
      const occ = [["رمضان", 9, 1], ["يوم عرفة", 12, 9], ["عاشوراء", 1, 10]]
        .map(([n, m, d]) => Object.assign({ n }, H.daysToHijri(now, m, d) || { days: 9999 })).sort((a, b) => a.days - b.days)[0];
      if (occ && occ.days > 0 && occ.days < 9999) lines.push(`<div class="ht-line">${icon("crescent")}<span>${occ.n}: باقي ${F.digits(occ.days)} ${occ.days >= 3 && occ.days <= 10 ? "أيام" : "يوم"}</span></div>`);
      if (CONFIG.city && CONFIG.city.country === "SA" && CONFIG.showSalary) {
        const s = H.nextMonthly(now, 27, "salary");
        lines.push(`<div class="ht-line">${icon("wallet")}<span>الراتب: ${s.days === 0 ? "اليوم" : `باقي ${F.digits(s.days)} ${s.days >= 3 && s.days <= 10 ? "أيام" : "يوم"}`} <small>متوقع</small></span></div>`);
      }
    }
    // البطاقة ما تكبر: لو ما دخل كل شي نشيل من آخر القائمة (الأقل أهمية) بدل ما ينقص سطر من نصه
    const paint = () => { el.innerHTML = `<div class="label">${icon("calendar")}اليوم</div>` + (lines.length ? lines.join("") : `<p class="hc-empty">حدد مدينتك وفريقك من الإعدادات.</p>`); };
    paint();
    while (lines.length > 1 && el.scrollHeight > el.clientHeight + 1) { lines.pop(); paint(); }
  }

  function renderStatus() {
    const now = new Date();
    const c = F.clock(now);
    $("time").innerHTML = `<span class="ltr">${c.h}:${c.m}</span><small>${c.ampm}</small>`;
    const parts = F.hijri(now).split("،");
    $("date").innerHTML = `${esc(parts[0])}<small>${esc((parts[1] || "").trim())}</small><small class="h-greg">${esc(F.gregorian(now))} م</small>`;
    const w = DATA.weather();
    if (w) { const g = F.weather(w.data.now.code); $("wx").innerHTML = `${icon(g[1])}${F.num(w.data.now.temp)}°`; }
    $("wx").style.display = w ? "" : "none";
    renderPrayerCard(now);
    renderContentCard(now);
    renderTodayCard(now);
  }

  // ===== قارئ الأذكار والأحاديث =====
  function renderReader() {
    const it = readList[readIdx];
    if (!it) return;
    $("rTitle").textContent = it.title;
    $("rCount").textContent = `${F.digits(readIdx + 1)} / ${F.digits(readList.length)}`;
    const tx = $("rText");
    tx.textContent = String(it.item.text).replace(/<[^>]+>/g, "").trim();
    tx.className = "reader-text " + Content.fontClass(it.item);
    const im = $("rImg"), okImg = /^img\/places\/[a-z0-9-]+\.jpg$/.test(it.item.image || "");
    im.hidden = !okImg; if (okImg) im.src = it.item.image; else im.removeAttribute("src");
    $("rSrc").textContent = it.item.source + (it.item.edition ? " · المصدر: " + it.item.edition : "");
    $("rRef").textContent = Content.credit(it.item, true).reference;
    // النص كامل دايماً: نصغّر الخط، وإذا للحين أطول من المساحة ينقرا بالسهم تحت
    tx.scrollTop = 0;
    for (const px of [44, 38, 33, 29]) { tx.style.fontSize = px + "px"; if (tx.scrollHeight <= tx.clientHeight + 1) break; }
    readScroll = tx.scrollHeight > tx.clientHeight + 1;
    $("rHint").textContent = readScroll ? "تحت وفوق: باقي النص · يمين ويسار: التالي والسابق · رجوع: إغلاق" : "الأسهم: التالي والسابق · رجوع: إغلاق";
  }
  let readScroll = false;

  function renderQuick() {
    $("qlist").innerHTML = QUICK.map((q, i) => `<div class="qk ${i === quickIdx ? "focus" : ""}">${icon(q.ic)}<span>${q.name}</span></div>`).join("");
  }
  function openQuick() { mode = "quick"; quickIdx = 0; $("quick").classList.add("on"); renderQuick(); paintFocus(); }
  function closeQuick() { mode = "nav"; $("quick").classList.remove("on"); paintFocus(); }
  function runQuick(q) {
    closeQuick();
    if (q.id === "saver") return App.show("saver");
    if (q.id === "riwaq") return native() ? Riwaq.openSettings() : (location.href = "settings.html");
    if (native() && Riwaq.openSystem) return Riwaq.openSystem(q.id);
    App.toast(`يفتح ${q.name} (في المتصفح ما يفتح شي)`);
  }

  // ===== قفل التطبيقات (للأطفال) =====
  // حماية عائلية بسيطة: تمنع فتح التطبيق من رواق بدون الرمز. ما تمنع طرق ثانية (مثل المساعد الصوتي)
  const isLocked = (id) => !!(CONFIG.lock && /^[0-9]{4}$/.test(CONFIG.lock.pin || "") && (CONFIG.lock.apps || []).includes(id));
  function renderPin() {
    $("pinDigits").innerHTML = pinDigits.map((d, i) => `<span class="pd ${i === pinPos ? "on" : ""}">${F.digits(d)}</span>`).join("");
  }
  function askPin(then, name) {
    mode = "pin"; pinDigits = [0, 0, 0, 0]; pinPos = 0; pinThen = then;
    $("pinSub").textContent = `اكتب رمز القفل عشان تفتح ${name}`;
    $("pin").classList.add("on"); renderPin(); paintFocus();
  }
  function closePin() { mode = "nav"; $("pin").classList.remove("on"); pinThen = null; paintFocus(); }
  function checkPin() {
    if (pinDigits.join("") === String(CONFIG.lock.pin)) { const fn = pinThen; pinTries = 0; closePin(); if (fn) fn(); return; }
    pinTries++;
    $("pin").classList.remove("shake"); void $("pin").offsetWidth; $("pin").classList.add("shake");
    $("pinSub").textContent = pinTries >= 3 ? "الرمز غلط. اسأل أهلك عن الرمز" : "الرمز غلط، جرّب مرة ثانية";
    pinDigits = [0, 0, 0, 0]; pinPos = 0; renderPin();
  }

  function launchItem(item) {
    if (native()) {
      if (item.type === "app") Riwaq.launch(item.id);
      if (item.type === "input") Riwaq.openInput(item.id);
      return;
    }
    App.toast({ app: `يفتح ${item.name} (في المتصفح ما يفتح شي)`, input: `يحوّل إلى ${item.name}` }[item.type]);
  }

  function open(item) {
    if (item.type === "app" && isLocked(item.id)) { askPin(() => launchItem(item), item.name); return; }
    if (item.type === "nav") {
      if (item.id === "quick") { openQuick(); return; }
      if (item.id === "picker") { mode = "picker"; pickIdx = 0; $("picker").classList.add("on"); renderPicker(); paintFocus(); return; }
      if (item.id === "saver") { App.show("saver"); return; }
      if (item.id === "timed") {
        // ذكر الوقت: اللي وقته الحين كامل (أذكار الصباح، المساء، الملك، الكهف، أدعية الجمعة)
        const secs = window.Content ? Content.timed(new Date()) : [];
        readList = secs.flatMap((s) => s.items.map((x) => ({ title: s.title + (s.hint ? " · " + s.hint : ""), item: x })));
        if (!readList.length) readList = [{ title: "ذكر الوقت", item: { type: "info", source: "", text:
          ["ما فيه ذكر له وقت محدد الحين.", "", "أذكار الصباح: من الفجر لين الظهر", "أذكار المساء: من العصر لين العشاء",
           "سورة الملك: من العشاء لين ١ بالليل", "يوم الجمعة: سورة الكهف من ١٠ الصبح لين العصر، وأدعية مأثورة من العصر لين المغرب"].join("\n") } }];
        mode = "reader"; readIdx = 0; $("reader").classList.add("on"); renderReader(); paintFocus(); return;
      }
      if (item.id === "reader") {
        readList = window.Content ? Content.readerItems(new Date()) : [];
        if (!readList.length) { App.toast("ما فيه محتوى للحين"); return; }
        mode = "reader"; readIdx = 0; $("reader").classList.add("on"); renderReader(); paintFocus(); return;
      }
      if (item.id === "settings") {
        if (native()) Riwaq.openSettings(); else location.href = "settings.html";
        return;
      }
    }
    launchItem(item);
  }

  window.Home = {
    init(el) {
      root = build(el); loadApps(); renderRows(); renderStatus();
      DATA.onChange(renderStatus);
      // خانة الأذكار تتبدل كل ٤٠ ثانية تقريباً
      setInterval(() => renderContentCard(new Date()), 20000);
      window.addEventListener("riwaq-content", () => renderContentCard(new Date())); // أول ما يوصل ملف المحتوى
    },
    // أندرويد يناديها لضغطة البيت المطوّلة (لو الجهاز يرسلها)
    openQuick() { if (mode !== "nav") { $("picker").classList.remove("on"); $("reader").classList.remove("on"); mode = "nav"; } openQuick(); },
    // أندرويد يناديها لما ينركّب أو ينحذف تطبيق
    appsChanged() { loadApps(); renderRows(); },
    tick() { renderStatus(); },
    key(k) {
      const R = rows();
      if (mode === "pin") {
        if (/^d[0-9]$/.test(k)) {
          pinDigits[pinPos] = +k[1];
          if (pinPos < 3) pinPos++; else { checkPin(); return true; }
        }
        if (k === "up") pinDigits[pinPos] = (pinDigits[pinPos] + 1) % 10;
        if (k === "down") pinDigits[pinPos] = (pinDigits[pinPos] + 9) % 10;
        if (k === "left") pinPos = Math.min(3, pinPos + 1);   // من اليمين لليسار: اليسار = الخانة اللي بعدها
        if (k === "right") pinPos = Math.max(0, pinPos - 1);
        if (k === "ok") { checkPin(); return true; }
        if (k === "back") { closePin(); return true; }
        renderPin(); return true;
      }
      if (mode === "quick") {
        if (k === "up") quickIdx = Math.max(0, quickIdx - 1);
        if (k === "down") quickIdx = Math.min(QUICK.length - 1, quickIdx + 1);
        if (k === "ok") { runQuick(QUICK[quickIdx]); return true; }
        if (k === "back" || k === "menu" || k === "right") { closeQuick(); return true; }
        renderQuick(); return true;
      }
      if (mode === "reader") {
        // النص الطويل: تحت وفوق يمشون فيه، ولين يوصل آخره السهم تحت ينقل للتالي
        const tx = $("rText");
        if (readScroll && k === "down" && tx.scrollTop + tx.clientHeight < tx.scrollHeight - 1) { tx.scrollTop += tx.clientHeight * 0.8; return true; }
        if (readScroll && k === "up" && tx.scrollTop > 0) { tx.scrollTop -= tx.clientHeight * 0.8; return true; }
        // من اليمين لليسار: السهم اليسار = التالي
        if (k === "left" || k === "down") readIdx = Math.min(readList.length - 1, readIdx + 1);
        if (k === "right" || k === "up") readIdx = Math.max(0, readIdx - 1);
        if (k === "back" || k === "ok" || k === "menu") { mode = "nav"; $("reader").classList.remove("on"); paintFocus(); return true; }
        renderReader(); return true;
      }
      if (mode === "picker") {
        if (k === "up") pickIdx = Math.max(0, pickIdx - 1);
        if (k === "down") pickIdx = Math.min(apps.length - 1, pickIdx + 1);
        if (k === "ok" && apps[pickIdx]) {
          const id = apps[pickIdx].id;
          pinned = pinned.includes(id) ? pinned.filter((x) => x !== id) : pinned.concat(id);
          save();
        }
        if (k === "back" || k === "menu") { mode = "nav"; $("picker").classList.remove("on"); renderRows(); return true; }
        renderPicker();
        return true;
      }
      if (mode === "menu") {
        if (k === "left" || k === "right") menuIdx = 1 - menuIdx;
        if (k === "back") mode = "nav";
        if (k === "ok") {
          if (menuIdx === 0) mode = "move";
          else {
            const name = appById[pinned[col]].name;
            pinned.splice(col, 1); save(); mode = "nav";
            App.toast(`أخفينا ${name}. ترجّعه من "اختيار التطبيقات"`);
            renderRows(); return true;
          }
        }
        paintFocus(); return true;
      }
      if (mode === "move") {
        // الصف من اليمين لليسار: السهم اليسار = للأمام في القائمة
        const dir = k === "left" ? 1 : k === "right" ? -1 : 0;
        const to = col + dir;
        if (dir && to >= 0 && to < pinned.length) { [pinned[col], pinned[to]] = [pinned[to], pinned[col]]; col = to; save(); renderRows(); return true; }
        if (k === "ok" || k === "back") { mode = "nav"; App.toast("انحفظ الترتيب"); }
        paintFocus(); return true;
      }
      if (k === "back") {
        // رجوع: من شريط التنقل نرجع للتطبيقات. في التطبيقات ما يسوي شي (مثل أي واجهة تلفزيون)
        if (row !== 1 && R[1].length) { row = 1; col = 0; paintFocus(); return true; }
        return false;
      }
      if (k === "left") col = Math.min(R[row].length - 1, col + 1);
      if (k === "right") col = Math.max(0, col - 1);
      if (k === "up" && row > 0) {
        row--; if (row === 1 && !R[1].length) row = 0;
        col = Math.min(col, R[row].length - 1);
      }
      if (k === "down" && row < R.length - 1) {
        row++; if (row === 1 && !R[1].length && R.length > 2) row = 2;
        if (!R[row].length) row--;
        col = Math.min(col, R[row].length - 1);
      }
      if (k === "ok" && R[row][col]) open(R[row][col]);
      if (k === "menu" && R[row][col] && R[row][col].type === "app") { mode = "menu"; menuIdx = 0; }
      paintFocus();
      return true;
    }
  };
})();
