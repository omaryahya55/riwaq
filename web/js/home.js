/*
 * الواجهة الرئيسية، بشكلين (CONFIG.homeLayout):
 * - لوحة اللحظة (الافتراضي): الساعة والصلوات ونص قصير فوق الصورة، وسطر خفيف (الطقس والمباراة والمناسبة)،
 *   وتحت صف التطبيقات و"أكمل المشاهدة". السهم تحت من آخر صف يفتح "يومك" بالتفاصيل.
 * - الكلاسيكية: شريط تنقل، وثلاث بطاقات، وصف التطبيقات، وصف المداخل.
 * على التلفزيون: التطبيقات وأيقوناتها والمداخل تجي من أندرويد (Riwaq.*). في المتصفح: قائمة تجريبية.
 */
(function () {
  const native = () => !!(window.Riwaq && Riwaq.getApps);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 86400000;

  let apps = [], appById = {}, inputs = [];
  let pinned = [];
  let row = 1, col = 0;      // الصف ٠ = شريط التنقل، ١ = التطبيقات، ٢ = المداخل
  let mode = "nav";          // nav | menu | move | picker | reader | quick | pin | day
  let watch = [], quickList = [];
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
    { type: "nav", id: "reader", name: "الأذكار", ic: "crescent" },
    { type: "nav", id: "tilawa", name: "القرآن", ic: "book" }
  ];
  // لوحة اللحظة: أزرار بكلماتها دايماً، بدون خلفيات. "الأذكار" فيها ذكر الوقت أول
  const NAV_MOMENT = [
    { type: "nav", id: "tilawa", name: "القرآن", ic: "book" },
    { type: "nav", id: "reader", name: "الأذكار", ic: "crescent" },
    { type: "nav", id: "inputs", name: "المداخل", ic: "hdmi" },
    { type: "nav", id: "quick", name: "التحكم", ic: "gear" }
  ];
  const moment = () => CONFIG.homeLayout !== "classic";
  // وضع الأطفال يحتاج رمز (الخروج منه بالرمز)، وهو ترتيب مو حماية كاملة
  const kids = () => !!(CONFIG.kids && CONFIG.kids.on && CONFIG.lock && /^[0-9]{4}$/.test(CONFIG.lock.pin || ""));
  const navItems = () => (moment() ? NAV_MOMENT.filter((n) => n.id !== "inputs" || inputs.length) : NAV);
  const inputName = (i) => (CONFIG.inputNames && CONFIG.inputNames[i.id]) || i.name;
  // اللوحة السريعة (بدل لوحة Google TV اللي كانت تطلع بضغطة البيت المطوّلة)
  const QUICK = [
    { id: "system", name: "إعدادات التلفزيون", ic: "gear" },
    { id: "wifi", name: "الواي فاي والشبكة", ic: "wifi" },
    { id: "bluetooth", name: "البلوتوث والريموت", ic: "bt" },
    { id: "sound", name: "الصوت", ic: "sound" },
    { id: "display", name: "الشاشة والصورة", ic: "tv" },
    { id: "riwaq", name: "إعدادات رواق (بالجوال)", ic: "grid" },
    { id: "saver", name: "شاشة الانتظار الحين", ic: "moon" },
    { id: "search", name: "بحث بالصوت", ic: "sound" },
    { id: "picker", name: "اختيار التطبيقات", ic: "grid", kidsHide: true },
    { id: "majlis", name: "شاشة المجلس (واي فاي الضيوف)", ic: "wifi" },
    { id: "update", name: "تحديث رواق", ic: "gear" },
    { id: "report", name: "إبلاغ عن مشكلة", ic: "bell" },
    { id: "restore", name: "الرجوع للواجهة الأصلية", ic: "hide" }
  ];
  function controlItems() {
    const out = QUICK.filter((q) => !(q.kidsHide && kids())).map((q) => {
      const v = q.id === "update" && native() && Riwaq.updateAvailable ? Riwaq.updateAvailable() : "";
      return v ? Object.assign({}, q, { name: "تحديث رواق · نسخة جديدة " + F.digits(v) }) : q;
    });
    if (window.Tilawa && Tilawa.playing()) out.unshift({ id: "tilawaStop", name: "وقّف التلاوة", ic: "book" });
    if (native() && Riwaq.keysOff && Riwaq.keysOff()) out.unshift({ id: "setup", name: "خدمة الأزرار توقفت: شغّلها", ic: "bell" });
    if (native() && moment() && CONFIG.continueRow !== false && Riwaq.watchAllowed && !Riwaq.watchAllowed()) out.push({ id: "askWatch", name: "اسمح بصف أكمل المشاهدة", ic: "grid" });
    return out;
  }

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
    if (kids()) pinned = (CONFIG.kids.apps || []).filter((id) => appById[id]);
    loadWatch();
  }

  // أكمل المشاهدة: اسم وأيقونة بس، بدون صور. يعتمد على التطبيق: اللي ما يكتب في قائمة النظام ما يطلع
  function loadWatch() {
    watch = [];
    if (!moment() || CONFIG.continueRow === false || kids()) return;
    let list = [];
    if (native() && Riwaq.getWatchNext) { try { list = JSON.parse(Riwaq.getWatchNext()) || []; } catch (e) { list = []; } }
    else if (!native() && window.DEMO && DEMO.watch) list = DEMO.watch;
    const clean = (window.DATA && DATA.clean) || (() => true);
    watch = list.filter((w) => w && w.title && clean(String(w.title))).slice(0, 8);
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
    const R = [navItems(), pinned.map((id) => ({ type: "app", id, name: appById[id].name }))];
    if (moment()) {
      if (!kids()) R[1] = R[1].concat({ type: "all", id: "all", name: "كل التطبيقات" });
      if (watch.length) R.push(watch.map((w) => ({ type: "watch", id: w.i, name: w.title, watch: w })));
      return R;
    }
    if (inputs.length) R.push(inputs.map((i) => ({ type: "input", id: i.id, name: inputName(i), ic: i.icon || "hdmi" })));
    return R;
  }

  function tileHTML(item, r, c) {
    if (item.type === "all") return `<div class="tile all" data-r="${r}" data-c="${c}"><div class="name">${esc(item.name)}</div></div>`;
    if (item.type === "watch") {
      const w = item.watch;
      const ic = /^\/icons\/icon\/[A-Za-z0-9_.]+\.png$/.test(w.icon || "") ? `<img class="wt-ic" src="${w.icon}" alt="">` : "";
      return `<div class="tile wt" data-r="${r}" data-c="${c}">${ic}<div class="wt-t"><bdi>${esc(w.title)}</bdi></div>${w.progress ? `<div class="wt-p"><i style="width:${+w.progress}%"></i></div>` : ""}</div>`;
    }
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
      <div class="m-top soft-shadow"><nav class="m-nav" data-k="mNav"></nav></div>
      <div class="m-info soft-shadow">
        <div class="m-clock" data-k="mClock"></div>
        <div class="m-date" data-k="mDate"></div>
        <div class="m-prayers" data-k="mPrayers"></div>
        <div class="m-next" data-k="mNext"></div>
      </div>
      <div class="m-text soft-shadow" data-k="mText"></div>
      <div class="m-mini" data-k="mMini">
        <div class="mm-info" data-m="0"><b data-k="mmName"></b><small data-k="mmSub"></small></div>
        <div class="mm-btn" data-m="1" data-k="mmToggle"></div>
        <div class="mm-btn" data-m="2">${icon("tclose")}</div>
        <div class="mm-bar"><i data-k="mmBar"></i></div>
      </div>
      <div class="m-rows">
        <div class="m-caprow">
          <div class="m-cap soft-shadow" data-k="mCap"></div>
          <div class="m-chips" data-k="mChips"></div>
        </div>
        <div class="m-track"><div class="h-strip" data-k="m1"></div></div>
        <div class="m-track wt-track" data-k="mWatch"><div class="m-track-title soft-shadow">أكمل المشاهدة</div><div class="h-strip" data-k="m2"></div></div>
      </div>
      <div class="m-credit" data-k="mCredit"></div>
      <div class="m-hint" data-k="mHint"></div>
      <div class="h-top soft-shadow">
        <div class="h-date" data-k="date"></div>
        <div class="h-center">
          <div class="h-brand" aria-label="رِواق">رِواق</div>
          <nav class="h-nav" data-k="hNav"></nav>
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
        <h2 data-k="qTitle">${icon("tv")}التلفزيون</h2>
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

  // يكتب في العنصر بس لو المحتوى تغيّر (كل كتابة = إعادة تخطيط ورسم على التلفزيون)
  const setHTML = (el, h) => { if (el && el.__h !== h) { el.innerHTML = h; el.__h = h; } };

  const rowEl = (r) => $((moment() ? "m" : "r") + r);
  function renderRows() {
    const R = rows();
    const nav = R[0].map((n, c) => `<div class="nav-pill" data-r="0" data-c="${c}">${icon(n.ic)}<span>${n.name}</span></div>`).join("");
    $("mNav").innerHTML = moment() ? nav : "";
    $("hNav").innerHTML = moment() ? "" : nav;
    const apps1 = R[1].length ? R[1].map((it, c) => tileHTML(it, 1, c)).join("")
      : `<div class="h-row-hint" style="padding-top:60px">ما اخترت أي تطبيق. اضغط السهم فوق واختر "اختيار التطبيقات".</div>`;
    if (moment()) {
      $("m1").innerHTML = apps1;
      $("r1").innerHTML = ""; $("r2").innerHTML = "";
      $("mWatch").style.display = watch.length ? "" : "none";
      root.classList.toggle("has-watch", !!watch.length);
      $("m2").innerHTML = watch.length ? R[2].map((it, c) => tileHTML(it, 2, c)).join("") : "";
    } else {
      $("r1").innerHTML = apps1;
      $("m1").innerHTML = ""; $("m2").innerHTML = "";
      $("inputsRow").style.display = inputs.length ? "" : "none";
      if (inputs.length) $("r2").innerHTML = R[2].map((it, c) => tileHTML(it, 2, c)).join("");
    }
    if (row >= R.length) row = R.length - 1;
    if (row === 1 && !R[1].length) row = 0;
    col = Math.max(0, Math.min(col, R[row].length - 1));
    paintFocus();
  }

  function paintFocus() {
    root.querySelectorAll(".tile, .nav-pill").forEach((t) => t.classList.remove("focus", "moving"));
    const t = root.querySelector(`[data-r="${row}"][data-c="${col}"]`);
    if (t && !["picker", "reader", "quick", "pin", "day", "tilawa", "mini"].includes(mode)) t.classList.add(mode === "move" ? "moving" : "focus");
    // صف طويل: نزحلقه عشان التطبيق المختار يبان
    if (row > 0) {
      const m = moment();
      const strip = rowEl(row), pitch = m ? (row === 1 ? 256 : 364) : (row === 1 ? 328 : 248), w = m ? (row === 1 ? 236 : 344) : (row === 1 ? 300 : 220);
      if (strip) strip.style.transform = `translateX(${Math.max(0, col * pitch + w - (m ? 1728 : 1736) + 60)}px)`;
    }
    // اسم المحدد فوق الصف: كبير وواحد، بدل اسم على كل مربع
    if (moment()) {
      const it = row > 0 && mode !== "day" && mode !== "mini" ? (rows()[row] || [])[col] : null;
      setHTML($("mCap"), it ? `<bdi>${esc(it.name)}</bdi>` : "");
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
  // ===== لوحة اللحظة =====
  // نص قصير فوق الصورة بمصدره. نص كامل بس: ناخذ أول نص يدخل في المساحة، وما نقص أي نص. والطويل في "يومك" و"الأذكار"
  let momentSig = "";
  function renderMomentText(now) {
    const el = $("mText");
    const first = window.Content && Content.current(now, 0);
    const sig = first ? (first.item.sourceId || first.item.text.slice(0, 40)) + "|" + first.title : "none";
    if (sig === momentSig) return;
    momentSig = sig;
    for (let offset = 0; offset < 12; offset++) {
      const c = window.Content && Content.current(now, offset);
      if (!c) break;
      const text = String(c.item.text).replace(/<[^>]+>/g, "").trim();
      el.innerHTML = `<b>${esc(c.title)}</b><p class="${Content.fontClass(c.item)}">${esc(text)}</p><small>${esc(Content.credit(c.item, false).source)}</small>`;
      if (el.scrollHeight <= el.clientHeight + 1) return;
    }
    el.innerHTML = "";
  }

  // سطر خفيف فوق التطبيقات: التلاوة، وذكر الوقت، والطقس، والمباراة، وأقرب مناسبة. أربعة بالكثير
  function renderChips(now) {
    const out = [];
    const tm = window.Content && Content.timed ? Content.timed(now) : [];
    if (tm.length) out.push(["bell", "حان وقت " + esc(tm.map((s) => s.title).join(" و"))]);
    const w = DATA.weather();
    if (w) { const g = F.sky(w.data.now.code, now); out.push([g[1], `${F.num(w.data.now.temp)}° ${g[0]}`]); }
    const fm = DATA.featuredMatch(now);
    if (fm) {
      const E = fm.ev, nm = (id, en) => esc((window.TEAMS_AR && TEAMS_AR[id]) || en);
      const mid = fm.kind === "last" ? `${F.num(E.hs)} - ${F.num(E.as)}` : "×";
      const soon = fm.kind === "next" && fm.at - now < 3600000 ? ` · بعد ${F.duration((fm.at - now) / 60000)}` : "";
      out.push(["ball", `<bdi>${nm(E.homeId, E.home)}</bdi> ${mid} <bdi>${nm(E.awayId, E.away)}</bdi>${soon}`]);
    }
    const H = window.Saver && Saver.helpers;
    if (H) {
      const occ = [["رمضان", 9, 1], ["يوم عرفة", 12, 9], ["عاشوراء", 1, 10]]
        .map(([n, m, d]) => Object.assign({ n }, H.daysToHijri(now, m, d) || { days: 9999 })).sort((x, y) => x.days - y.days)[0];
      if (occ && occ.days > 0 && occ.days < 9999) out.push(["crescent", `${occ.n}: باقي ${F.days(occ.days)}`]);
    }
    setHTML($("mChips"), out.slice(0, 4).map(([ic, t]) => `<span class="m-chip">${icon(ic)}<span>${t}</span></span>`).join(""));
  }

  function renderMoment(now) {
    const c = F.clock(now);
    setHTML($("mClock"), `<span class="ltr">${c.h}:${c.m}</span><small>${c.ampm}</small>`);
    const w = DATA.weather();
    setHTML($("mDate"), `${esc(F.hijri(now))}<small>${esc(F.gregorian(now))} م</small>`);
    const np = Prayer.next(now);
    if (np) {
      setHTML($("mPrayers"), np.today.filter((p) => !p.notPrayer).map((p) => { const t = F.clock(p.at); return `<div class="${p.id === np.p.id ? "n" : ""}"><label>${p.name}</label>${t.h}:${t.m}</div>`; }).join(""));
      const r = Prayer.ramadan(now);
      setHTML($("mNext"), r ? `${r.label} بعد ${F.duration(r.mins)}` : `${np.p.name}${np.tomorrow ? " بكرة" : ""} بعد ${F.duration(np.mins)}`);
    } else {
      setHTML($("mPrayers"), "");
      setHTML($("mNext"), "اختر مدينتك: السهم فوق ← التحكم ← إعدادات رواق");
    }
    renderMomentText(now);
    renderChips(now);
    const parts = [window.Scene && Scene.credit ? "الصورة: " + Scene.credit + " · معدّلة" : ""];
    if (w) parts.push("الطقس: Open-Meteo.com");
    setHTML($("mCredit"), esc(parts.filter(Boolean).join(" · ")));
  }

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
    setHTML(el, `<div class="label">${icon("bell")}الصلاة القادمة</div>
      <div class="hp-row"><div class="hp-name">${np.p.name}</div><div class="hp-when"><span class="ltr">${t.h}:${t.m}</span> ${t.ampm}<b>بعد ${F.duration(np.mins)}</b></div></div>
      <div class="hp-cells">${cells}</div>`);
  }

  // نفس قاعدة شاشة الانتظار: ممنوع نقص النص. نصغّر الخط، وإذا ما دخل ناخذ البديل اللي بعده
  // (والنص الطويل ينقرا كامل من "الأذكار" فوق)
  let contentSig = "";
  function renderContentCard(now) {
    const el = $("contentCard");
    // نفس المحتوى اللي معروض: ما نعيد القياس (القياس بكل الأحجام كان يتعاد كل ١٥ و٢٠ ثانية بدون داعي)
    const first = window.Content && Content.current(now, 0);
    const sig = first ? (first.item.sourceId || first.item.text.slice(0, 40)) + "|" + first.title : "";
    if (sig && sig === contentSig) return;
    contentSig = sig;
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
      const g = F.sky(w.data.now.code, now), d = days && days[0];
      lines.push(`<div class="ht-wx">${icon(g[1])}<span class="ht-temp">${F.num(w.data.now.temp)}°</span><span>${g[0]}${d ? `<small>${F.num(d.max)}° / ${F.num(d.min)}°</small>` : ""}<small>Open-Meteo.com</small></span></div>`);
    }
    const H = window.Saver && Saver.helpers;
    // مباراة الفريق
    const fm = DATA.featuredMatch(now);
    if (fm) {
      const E = fm.ev, nm = (id, en) => esc((window.TEAMS_AR && TEAMS_AR[id]) || en);
      const mid = fm.kind === "last" ? `<small style="display:inline">${F.num(E.hs)} - ${F.num(E.as)}</small>` : "×";
      const sub = fm.kind === "last" ? "النتيجة" : new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { timeZone: F.TZ, weekday: "long", hour: "numeric", minute: "2-digit" }).format(fm.at);
      lines.push(`<div class="ht-line">${icon("ball")}<span><bdi>${nm(E.homeId, E.home)}</bdi> ${mid} <bdi>${nm(E.awayId, E.away)}</bdi><small>${sub}</small></span></div>`);
    }
    // ذكر الوقت: أول سطر (أهم شي الحين)
    const tm = window.Content && Content.timed ? Content.timed(now) : [];
    if (tm.length) lines.unshift(`<div class="ht-line ht-timed">${icon("bell")}<span>حان وقت ${esc(tm.map((s) => s.title).join(" و"))}<small>${tm.every((t) => t.surah) ? "شغّلها من «القرآن» فوق" : `افتحها كاملة من ${moment() ? "«الأذكار»" : "«ذكر الوقت»"} فوق`}</small></span></div>`);
    if (H) {
      const occ = [["رمضان", 9, 1], ["يوم عرفة", 12, 9], ["عاشوراء", 1, 10]]
        .map(([n, m, d]) => Object.assign({ n }, H.daysToHijri(now, m, d) || { days: 9999 })).sort((a, b) => a.days - b.days)[0];
      if (occ && occ.days > 0 && occ.days < 9999) lines.push(`<div class="ht-line">${icon("crescent")}<span>${occ.n}: باقي ${F.days(occ.days)}</span></div>`);
      if (CONFIG.city && CONFIG.city.country === "SA" && CONFIG.showSalary) {
        const s = H.nextMonthly(now, 27, "salary");
        lines.push(`<div class="ht-line">${icon("wallet")}<span>الراتب: ${s.days === 0 ? "اليوم" : `باقي ${F.days(s.days)}`} <small>متوقع</small></span></div>`);
      }
    }
    // البطاقة ما تكبر: لو ما دخل كل شي نشيل من آخر القائمة (الأقل أهمية) بدل ما ينقص سطر من نصه
    const key = lines.join("");
    if (el.__lines === key) return;
    el.__lines = key;
    const paint = () => { el.innerHTML = `<div class="label">${icon("calendar")}اليوم</div>` + (lines.length ? lines.join("") : `<p class="hc-empty">حدد مدينتك وفريقك من الإعدادات.</p>`); };
    paint();
    while (lines.length > 1 && el.scrollHeight > el.clientHeight + 1) { lines.pop(); paint(); }
  }

  // المشغّل الصغير: يتبعك في الواجهة وقت التلاوة. تنزل له بالأسهم (فوق التطبيقات وتحت الأزرار)
  let tlOn = false, miniIdx = 1;
  function renderMini() {
    if (!moment() || !root) return;
    const info = window.Tilawa ? Tilawa.info() : null;
    tlOn = !!info;
    root.classList.toggle("has-mini", tlOn);
    if (!tlOn) {
      if (mode === "mini") { mode = "nav"; row = rows()[1].length ? 1 : 0; col = 0; paintFocus(); }
      return;
    }
    setHTML($("mmName"), esc(info.name));
    setHTML($("mmSub"), info.loading ? "نجهز التلاوة…" : esc(info.reciter) + (info.paused ? " · متوقفة" : ""));
    setHTML($("mmToggle"), icon(info.paused ? "tplay" : "tpause"));
    $("mmBar").style.width = info.pct + "%";
    root.querySelectorAll("[data-m]").forEach((e) => e.classList.toggle("on", mode === "mini" && +e.dataset.m === miniIdx));
  }
  function miniKey(k) {
    if (k === "left") miniIdx = Math.min(2, miniIdx + 1); // من اليمين لليسار: اليسار = اللي بعده
    if (k === "right") miniIdx = Math.max(0, miniIdx - 1);
    if (k === "up") { mode = "nav"; row = 0; col = 0; }
    if (k === "down" || k === "back") { mode = "nav"; row = rows()[1].length ? 1 : 0; col = 0; }
    if (k === "ok") {
      if (miniIdx === 0) { mode = "tilawa"; paintFocus(); Tilawa.open(() => { mode = "nav"; row = 1; col = 0; paintFocus(); renderStatus(); }); return true; }
      if (miniIdx === 1) Tilawa.toggle();
      if (miniIdx === 2) Tilawa.stop();
      setTimeout(renderMini, 300);
    }
    paintFocus(); renderMini();
    return true;
  }

  function renderStatus() {
    if (window.App && App.current && App.current !== "home") return; // الواجهة مخفية (شاشة الانتظار ظاهرة)
    const now = new Date();
    if (moment()) {
      renderMini();
      renderMoment(now);
      if (mode === "day") { renderContentCard(now); renderTodayCard(now); }
      return;
    }
    const c = F.clock(now);
    setHTML($("time"), `<span class="ltr">${c.h}:${c.m}</span><small>${c.ampm}</small>`);
    const parts = F.hijri(now).split("،");
    setHTML($("date"), `${esc(parts[0])}<small>${esc((parts[1] || "").trim())}</small><small class="h-greg">${esc(F.gregorian(now))} م</small>`);
    const w = DATA.weather();
    if (w) { const g = F.sky(w.data.now.code, now); setHTML($("wx"), `${icon(g[1])}${F.num(w.data.now.temp)}°`); }
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
    $("rSrc").textContent = it.item.type === "hadith" || Array.isArray(it.item.takhrij) ? Content.credit(it.item, false).source : it.item.source + (it.item.edition ? " · المصدر: " + it.item.edition : "") + (it.item.imageCredit ? " · " + it.item.imageCredit : "");
    $("rRef").textContent = Content.credit(it.item, true).reference;
    // النص كامل دايماً: نصغّر الخط، وإذا للحين أطول من المساحة ينقرا بالسهم تحت
    tx.scrollTop = 0;
    for (const px of [44, 38, 33, 29]) { tx.style.fontSize = px + "px"; if (tx.scrollHeight <= tx.clientHeight + 1) break; }
    readScroll = tx.scrollHeight > tx.clientHeight + 1;
    const need = countOf(it);
    $("rSrc").textContent += need > 1 ? ` · العدّاد: ${F.digits(counts[readIdx] || 0)} من ${F.digits(need)} (OK: عدّ)` : "";
    $("rHint").textContent = need > 1 ? "OK: عدّ · يمين ويسار: التالي والسابق · رجوع: إغلاق" : readScroll ? "تحت وفوق: باقي النص · يمين ويسار: التالي والسابق · رجوع: إغلاق" : "الأسهم: التالي والسابق · رجوع: إغلاق";
  }
  let readScroll = false;
  // عداد الأذكار: OK يعدّ، ولما يكمل ينتقل للتالي. العدد من نص الذكر نفسه
  let counts = {};
  const countOf = (it) => (window.Content && Content.repeatOf ? Content.repeatOf(it.item) : 1);

  function renderQuick() {
    const box = $("qlist");
    box.innerHTML = quickList.map((q, i) => `<div class="qk ${i === quickIdx ? "focus" : ""}">${icon(q.ic)}<span><bdi>${esc(q.name)}</bdi></span></div>`).join("");
    // القائمة أطول من الشاشة: تمشي مع التحديد
    box.style.transform = `translateY(${-Math.max(0, quickIdx * 86 - 560)}px)`;
  }
  function openList(title, ic, list) {
    mode = "quick"; quickIdx = 0; quickList = list;
    $("qTitle").innerHTML = icon(ic) + esc(title);
    $("quick").classList.add("on"); renderQuick(); paintFocus();
  }
  function openQuick() { openList(moment() ? "التحكم" : "التلفزيون", moment() ? "gear" : "tv", controlItems()); }
  function openInputs() { openList("المداخل", "hdmi", inputs.map((i) => ({ input: i, name: inputName(i), ic: i.icon || "hdmi" }))); }
  function closeQuick() { mode = "nav"; $("quick").classList.remove("on"); paintFocus(); }
  // يقفل أي طبقة مفتوحة (من زر ريموت أو أمر من أندرويد)، عشان الأزرار ما تحرك شي مخفي
  function closeLayers() {
    ["picker", "reader", "quick", "pin"].forEach((k) => $(k).classList.remove("on"));
    if (mode === "tilawa" && window.Tilawa) Tilawa.close();
    root.classList.remove("day-open");
    mode = "nav"; pinThen = null;
  }
  function openDay() { mode = "day"; root.classList.add("day-open"); const now = new Date(); renderContentCard(now); renderTodayCard(now); paintFocus(); }
  function closeDay() { mode = "nav"; root.classList.remove("day-open"); paintFocus(); }
  function runQuick(q) {
    closeQuick();
    if (q.input) return launchItem({ type: "input", id: q.input.id, name: q.name });
    if (q.id === "saver") return App.show("saver");
    if (q.id === "picker") { mode = "picker"; pickIdx = 0; $("picker").classList.add("on"); renderPicker(); paintFocus(); return; }
    if (q.id === "majlis") return guarded(() => (native() && Riwaq.openMajlis ? Riwaq.openMajlis() : App.toast("شاشة المجلس على التلفزيون بس")), "شاشة المجلس");
    if (q.id === "search") return native() && Riwaq.openSearch ? Riwaq.openSearch() : App.toast("البحث على التلفزيون بس");
    if (q.id === "tilawaStop") return window.Tilawa && Tilawa.stop();
    if (q.id === "update") return native() && Riwaq.openUpdate ? Riwaq.openUpdate() : App.toast("التحديث على التلفزيون بس");
    if (q.id === "report") return native() && Riwaq.openReport ? Riwaq.openReport() : App.toast("الإبلاغ على التلفزيون بس");
    if (q.id === "setup") return native() && Riwaq.openSetup ? Riwaq.openSetup() : undefined;
    if (q.id === "askWatch") return native() && Riwaq.askWatch ? Riwaq.askWatch() : undefined;
    if (q.id === "riwaq") return openSettings();
    if (q.id === "restore") return openRestore();
    // إعدادات التلفزيون تمر على الرمز لو فيه (الواي فاي والبلوتوث وغيرها)
    if (native() && Riwaq.openSystem) return guarded(() => Riwaq.openSystem(q.id), q.name);
    App.toast(`يفتح ${q.name} (في المتصفح ما يفتح شي)`);
  }

  // ===== قفل التطبيقات (للأطفال) =====
  // حماية عائلية بسيطة: تمنع فتح التطبيق من رواق بدون الرمز. ما تمنع طرق ثانية (مثل المساعد الصوتي)
  const isLocked = (id) => !!(CONFIG.lock && /^[0-9]{4}$/.test(CONFIG.lock.pin || "") && (CONFIG.lock.apps || []).includes(id));
  function renderPin() {
    $("pinDigits").innerHTML = pinDigits.map((d, i) => `<span class="pd ${i === pinPos ? "on" : ""}">${F.digits(d)}</span>`).join("");
  }
  const guarded = (go, name) => { if (CONFIG.lock && CONFIG.lock.pin) askPin(go, name); else go(); };
  // إعدادات رواق (الباركود): لو فيه رمز قفل، تنطلب أول (غير كذا الطفل يقدر يشيل القفل من الجوال)
  function openSettings() {
    const go = () => { if (native()) Riwaq.openSettings(); else location.href = "settings.html"; };
    if (CONFIG.lock && CONFIG.lock.pin) askPin(go, "الإعدادات"); else go();
  }

  // الرجوع للواجهة الأصلية (صفحة أندرويد بخطوات آمنة). يطلب رمز القفل لو فيه
  function openRestore() {
    const go = () => { if (native() && Riwaq.openRestore) Riwaq.openRestore(); else App.toast("الرجوع يكون من التلفزيون نفسه"); };
    if (CONFIG.lock && CONFIG.lock.pin) askPin(go, "الرجوع للواجهة الأصلية"); else go();
  }

  function askPin(then, name) {
    mode = "pin"; pinDigits = [0, 0, 0, 0]; pinPos = 0; pinThen = then;
    $("pinSub").textContent = `اكتب رمز القفل عشان تفتح ${name}`;
    $("pin").classList.add("on"); renderPin(); paintFocus();
  }
  function closePin() { mode = "nav"; $("pin").classList.remove("on"); pinThen = null; paintFocus(); }
  // ٥ محاولات غلط = انتظار، ويزيد مع التكرار (دقيقة، ٥، ١٥). ينحفظ لو انعادت الصفحة، عشان ما تنجرب الأرقام كلها
  const PIN_LOCK_KEY = "riwaq.pinLock", PIN_ROUND_KEY = "riwaq.pinRound";
  const pinLockUntil = () => { try { return +localStorage.getItem(PIN_LOCK_KEY) || 0; } catch (e) { return 0; } };
  const pinRound = () => { try { return +localStorage.getItem(PIN_ROUND_KEY) || 0; } catch (e) { return 0; } };
  function checkPin() {
    const wait = pinLockUntil() - Date.now();
    if (wait > 0) { $("pinSub").textContent = `محاولات كثيرة. انتظر ${F.digits(Math.ceil(wait / 1000))} ثانية`; return; }
    if (pinDigits.join("") === String(CONFIG.lock.pin)) {
      const fn = pinThen; pinTries = 0;
      try { localStorage.removeItem(PIN_ROUND_KEY); } catch (e) { /* بدون تخزين */ }
      closePin(); if (fn) fn(); return;
    }
    pinTries++;
    $("pin").classList.remove("shake"); void $("pin").offsetWidth; $("pin").classList.add("shake");
    if (pinTries >= 5) {
      pinTries = 0;
      const round = pinRound(), mins = [1, 5, 15][Math.min(round, 2)];
      try { localStorage.setItem(PIN_LOCK_KEY, String(Date.now() + mins * 60000)); localStorage.setItem(PIN_ROUND_KEY, String(round + 1)); } catch (e) { /* بدون تخزين: الانتظار لين تنعاد الصفحة */ }
      $("pinSub").textContent = `محاولات كثيرة. انتظر ${F.duration(mins)} واسأل أهلك عن الرمز`;
    } else $("pinSub").textContent = pinTries >= 3 ? "الرمز غلط. اسأل أهلك عن الرمز" : "الرمز غلط، جرّب مرة ثانية";
    pinDigits = [0, 0, 0, 0]; pinPos = 0; renderPin();
  }

  function launchItem(item) {
    if (native()) {
      if (item.type === "app") Riwaq.launch(item.id);
      if (item.type === "input") Riwaq.openInput(item.id);
      if (item.type === "watch") Riwaq.openWatch(item.watch.i);
      return;
    }
    App.toast({ app: `يفتح ${item.name} (في المتصفح ما يفتح شي)`, input: `يحوّل إلى ${item.name}`, watch: `يكمل ${item.name} (في المتصفح ما يفتح شي)` }[item.type]);
  }

  function open(item) {
    if (item.type === "app" && isLocked(item.id)) { askPin(() => launchItem(item), item.name); return; }
    if (item.type === "all") { mode = "picker"; pickIdx = 0; $("picker").classList.add("on"); renderPicker(); paintFocus(); return; }
    if (item.type === "nav") {
      if (item.id === "quick") { if (kids()) askPin(openQuick, "التحكم"); else openQuick(); return; }
      if (item.id === "inputs") { if (kids()) askPin(openInputs, "المداخل"); else openInputs(); return; }
      if (item.id === "picker") { mode = "picker"; pickIdx = 0; $("picker").classList.add("on"); renderPicker(); paintFocus(); return; }
      if (item.id === "saver") { App.show("saver"); return; }
      if (item.id === "tilawa") { mode = "tilawa"; paintFocus(); Tilawa.open(() => { mode = "nav"; paintFocus(); renderStatus(); }); return; }
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
      if (item.id === "settings") { openSettings(); return; }
    }
    launchItem(item);
  }

  window.Home = {
    init(el) {
      root = build(el); loadApps(); renderRows(); renderStatus();
      // تلميح أول ٣ مرات تفتح فيها الواجهة بس، بدل سطر دايم
      try {
        const n = +localStorage.getItem("riwaq.hints") || 0;
        if (moment() && n < 3) { $("mHint").textContent = "السهم تحت: يومك · OK مطوّل على تطبيق: تحريك أو إخفاء"; localStorage.setItem("riwaq.hints", String(n + 1)); }
      } catch (e) { /* بدون تخزين: ما يطلع التلميح */ }
      DATA.onChange(renderStatus);
      // وقت التلاوة نحدّث المشغّل الصغير كل ثانية. وبدونها ما نلمس الجسر
      setInterval(() => { if (tlOn && !document.hidden && window.App && App.current === "home") renderMini(); }, 1000);
      // خانة الأذكار تتبدل كل ٤٠ ثانية تقريباً
      setInterval(() => {
        if (document.hidden || (window.App && App.current !== "home")) return;
        if (moment()) { renderMomentText(new Date()); if (mode === "day") renderContentCard(new Date()); }
        else renderContentCard(new Date());
      }, 20000);
      setTimeout(renderMini, 500);
      const fresh = () => { contentSig = ""; momentSig = ""; renderStatus(); };
      window.addEventListener("riwaq-content", fresh); // أول ما يوصل ملف المحتوى
      window.addEventListener("riwaq-remeasure", fresh); // أول ما يوصل الخط
      // رجعنا من تطبيق: يمكن تغيّرت قائمة "أكمل المشاهدة"
      document.addEventListener("visibilitychange", () => {
        if (document.hidden || !moment()) return;
        const before = JSON.stringify(watch);
        loadWatch();
        if (JSON.stringify(watch) !== before) renderRows();
      });
    },
    // فيه قارئ أو رمز أو قائمة مفتوحة: شاشة الانتظار تنتظر
    busy() { return mode !== "nav" && mode !== "mini"; },
    // زر تطبيق في الريموت (أو اختيار تطبيق له) على تطبيق مقفل: أندرويد يمرره هنا عشان يطلب الرمز مثل البطاقة
    launchApp(pkg) {
      if (!/^[A-Za-z0-9_.]{1,200}$/.test(String(pkg))) return;
      closeLayers();
      open({ type: "app", id: pkg, name: (appById[pkg] || {}).name || pkg });
    },
    // أندرويد يناديها لضغطة البيت المطوّلة (لو الجهاز يرسلها)
    openRestore() { closeLayers(); openRestore(); },
    openSettings() { closeLayers(); openSettings(); },
    openQuick() { closeLayers(); if (kids()) askPin(openQuick, "التحكم"); else openQuick(); },
    // أندرويد يناديها لما ينركّب أو ينحذف تطبيق
    appsChanged() { loadApps(); renderRows(); },
    tick() { if (root) renderStatus(); },
    key(k) {
      const R = rows();
      if (mode === "tilawa") return Tilawa.key(k);
      if (mode === "mini") return miniKey(k);
      // المشغّل بين الأزرار فوق وصف التطبيقات
      if (mode === "nav" && tlOn && moment() && ((k === "up" && row === 1) || (k === "down" && row === 0))) { mode = "mini"; miniIdx = 1; paintFocus(); renderMini(); return true; }
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
        if (k === "down") quickIdx = Math.min(quickList.length - 1, quickIdx + 1);
        if (k === "ok") { runQuick(quickList[quickIdx]); return true; }
        if (k === "back" || k === "menu" || k === "right") { closeQuick(); return true; }
        renderQuick(); return true;
      }
      if (mode === "day") {
        if (k === "up" || k === "back") { closeDay(); return true; }
        if (k === "ok") { closeDay(); open({ type: "nav", id: "reader" }); return true; }
        return true;
      }
      if (mode === "reader") {
        // النص الطويل: تحت وفوق يمشون فيه، ولين يوصل آخره السهم تحت ينقل للتالي
        const tx = $("rText");
        if (readScroll && k === "down" && tx.scrollTop + tx.clientHeight < tx.scrollHeight - 1) { tx.scrollTop += tx.clientHeight * 0.8; return true; }
        if (readScroll && k === "up" && tx.scrollTop > 0) { tx.scrollTop -= tx.clientHeight * 0.8; return true; }
        // من اليمين لليسار: السهم اليسار = التالي
        if (k === "left" || k === "down") readIdx = Math.min(readList.length - 1, readIdx + 1);
        if (k === "right" || k === "up") readIdx = Math.max(0, readIdx - 1);
        if (k === "ok" && readList[readIdx] && countOf(readList[readIdx]) > 1) {
          const need = countOf(readList[readIdx]);
          counts[readIdx] = (counts[readIdx] || 0) + 1;
          renderReader();
          if (counts[readIdx] >= need && readIdx < readList.length - 1) setTimeout(() => { if (mode === "reader") { readIdx++; renderReader(); } }, 500);
          return true;
        }
        if (k === "back" || k === "ok" || k === "menu") { counts = {}; mode = "nav"; $("reader").classList.remove("on"); paintFocus(); return true; }
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
      else if (k === "down" && moment() && row === R.length - 1) { openDay(); return true; }
      else if (k === "down" && row < R.length - 1) {
        row++; if (row === 1 && !R[1].length && R.length > 2) row = 2;
        if (!R[row].length) row--;
        col = Math.min(col, R[row].length - 1);
      }
      if (k === "ok" && R[row][col]) open(R[row][col]);
      if (k === "menu" && R[row][col] && R[row][col].type === "app" && !kids()) { mode = "menu"; menuIdx = 0; }
      paintFocus();
      return true;
    }
  };
})();
