/*
 * الواجهة الرئيسية: صف التطبيقات اللي يختارها المستخدم ويرتبها، وصف المداخل والإعدادات.
 * على التلفزيون: التطبيقات وأيقوناتها والمداخل تجي من أندرويد (Riwaq.*). في المتصفح: قائمة تجريبية.
 * الاختيار والترتيب ينحفظون في الإعدادات (CONFIG.pinned) على الجهاز نفسه.
 */
(function () {
  const native = () => !!(window.Riwaq && Riwaq.getApps);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let apps = [], appById = {}, inputs = [];
  let pinned = [];
  let row = 0, col = 0;
  let mode = "nav";          // nav | menu | move | picker
  let menuIdx = 0, pickIdx = 0;
  let root;

  const TINTS = ["#C8463D", "#2F9C7A", "#1F5FA8", "#5B3FA6", "#9E6B2B", "#2E6F5E", "#6A2C91", "#1E6F9F", "#8A3B5C", "#3F5A2E"];

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
    const saved = Array.isArray(CONFIG.pinned) ? CONFIG.pinned : (window.DEMO && !native() ? DEMO.pinned : apps.slice(0, 6).map((a) => a.id));
    pinned = saved.filter((id) => appById[id]);
  }
  function save() { Config.save({ pinned: pinned.slice() }); }

  // تفتيح وتغميق لون (بدل color-mix اللي ما يشتغل على متصفحات التلفزيونات القديمة)
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
  }

  function rows() {
    return [
      pinned.map((id) => ({ type: "app", id, name: appById[id].name })),
      inputs.map((i) => ({ type: "input", id: i.id, name: i.name, ic: i.icon || "hdmi" }))
        .concat([{ type: "settings", name: "الإعدادات", ic: "gear" }, { type: "picker", name: "اختيار التطبيقات", ic: "grid" }])
    ];
  }

  function tileHTML(item, r, c) {
    if (item.type === "app") {
      const a = appById[item.id];
      if (a.banner) return `<div class="tile has-img" data-r="${r}" data-c="${c}"><img src="${a.banner}" alt=""><div class="name clip"><bdi>${esc(a.name)}</bdi></div></div>`;
      if (a.icon) return `<div class="tile has-icon" data-r="${r}" data-c="${c}" style="--c1:${shade(a.tint, 0.04)};--c2:${shade(a.tint, -0.55)}"><div class="bg"></div><img class="app-ic" src="${a.icon}" alt=""><div class="name clip"><bdi>${esc(a.name)}</bdi></div></div>`;
      const mono = /^[A-Za-z]/.test(a.name) ? a.name[0] : a.name.replace(/^ال/, "")[0];
      return `<div class="tile" data-r="${r}" data-c="${c}" style="--c1:${shade(a.tint, 0.08)};--c2:${shade(a.tint, -0.45)}"><div class="bg"></div><div class="mono">${esc(mono)}</div><div class="name clip"><bdi>${esc(a.name)}</bdi></div></div>`;
    }
    return `<div class="tile small" data-r="${r}" data-c="${c}">${icon(item.ic)}<div class="name clip">${esc(item.name)}</div></div>`;
  }

  function build(el) {
    el.innerHTML = `
      <div class="shade home-shade"></div>
      <div class="h-top soft-shadow">
        <div class="h-date" data-k="date"></div>
        <div class="h-brand">رِواق</div>
        <div class="h-status">
          <span class="chip" data-k="wx"></span>
          <span class="h-time" data-k="time"></span>
        </div>
      </div>
      <div class="h-hero soft-shadow" data-k="hero">
        <div class="label">الصلاة القادمة</div>
        <div class="h-hero-name" data-k="pname"></div>
        <div class="h-hero-sub" data-k="psub"></div>
      </div>
      <div class="h-rows">
        <div class="h-row">
          <div class="h-row-head"><div class="h-row-title">تطبيقاتك</div><div class="h-row-hint">اضغط OK مطوّل على أي تطبيق عشان تحرّكه أو تخفيه</div></div>
          <div class="h-track"><div class="h-strip" data-k="r0"></div></div>
        </div>
        <div class="h-row small">
          <div class="h-row-head"><div class="h-row-title" data-k="r1title"></div></div>
          <div class="h-track"><div class="h-strip" data-k="r1"></div></div>
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
      </div>`;
    return el;
  }

  const $ = (k) => root.querySelector(`[data-k="${k}"]`);

  function renderRows() {
    const R = rows();
    $("r0").innerHTML = R[0].length ? R[0].map((it, c) => tileHTML(it, 0, c)).join("")
      : `<div class="h-row-hint" style="padding-top:60px">ما اخترت أي تطبيق. افتح "اختيار التطبيقات" تحت.</div>`;
    $("r1").innerHTML = R[1].map((it, c) => tileHTML(it, 1, c)).join("");
    $("r1title").textContent = inputs.length ? "المداخل والإعدادات" : "الإعدادات";
    if (!R[0].length && row === 0) row = 1;
    col = Math.max(0, Math.min(col, R[row].length - 1));
    paintFocus();
  }

  function paintFocus() {
    root.querySelectorAll(".tile").forEach((t) => t.classList.remove("focus", "moving"));
    const t = root.querySelector(`.tile[data-r="${row}"][data-c="${col}"]`);
    if (t && mode !== "picker") t.classList.add(mode === "move" ? "moving" : "focus");
    // صف طويل: نزحلقه عشان التطبيق المختار يبان
    const strip = $("r" + row), pitch = row === 0 ? 328 : 248, w = row === 0 ? 300 : 220;
    strip.style.transform = `translateX(${Math.max(0, col * pitch + w - 1736 + 60)}px)`;
    const menu = $("menu");
    menu.classList.toggle("on", mode === "menu");
    if (mode === "menu" && t) {
      const st = document.getElementById("stage").getBoundingClientRect(), tb = t.getBoundingClientRect(), s = st.width / 1920;
      menu.style.top = ((tb.bottom - st.top) / s + 18) + "px";
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

  function renderStatus() {
    const now = new Date();
    const c = F.clock(now);
    $("time").innerHTML = `<span class="ltr">${c.h}:${c.m}</span><small>${c.ampm}</small>`;
    const parts = F.hijri(now).split("،");
    $("date").innerHTML = `${esc(parts[0])}<small>${esc((parts[1] || "").trim())}</small>`;
    const w = DATA.weather();
    if (w) { const g = F.weather(w.data.now.code); $("wx").innerHTML = `${icon(g[1])}${F.num(w.data.now.temp)}° ${g[0]}`; }
    $("wx").style.display = w ? "" : "none";
    const np = Prayer.next(now);
    if (np) {
      const t = F.clock(np.p.at);
      $("pname").textContent = np.p.name;
      $("psub").innerHTML = `${t.h}:${t.m} ${t.ampm} · <b>بعد ${F.duration(np.mins)}</b>`;
    } else {
      $("pname").textContent = "أهلاً";
      $("psub").textContent = "اختر مدينتك من الإعدادات عشان تطلع أوقات الصلاة";
    }
  }

  function open(item) {
    if (item.type === "picker") { mode = "picker"; pickIdx = 0; $("picker").classList.add("on"); renderPicker(); paintFocus(); return; }
    if (native()) {
      if (item.type === "app") Riwaq.launch(item.id);
      if (item.type === "input") Riwaq.openInput(item.id);
      if (item.type === "settings") Riwaq.openSettings();
      return;
    }
    if (item.type === "settings") { location.href = "settings.html"; return; }
    App.toast({ app: `يفتح ${item.name} (في المتصفح ما يفتح شي)`, input: `يحوّل إلى ${item.name}` }[item.type]);
  }

  window.Home = {
    init(el) { root = build(el); loadApps(); renderRows(); renderStatus(); DATA.onChange(renderStatus); },
    // أندرويد يناديها لما ينركّب أو ينحذف تطبيق
    appsChanged() { loadApps(); renderRows(); },
    tick() { renderStatus(); },
    key(k) {
      const R = rows();
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
      if (k === "back") return false; // الواجهة الرئيسية: رجوع ما يسوي شي
      if (k === "left") col = Math.min(R[row].length - 1, col + 1);
      if (k === "right") col = Math.max(0, col - 1);
      if (k === "up" && row > 0 && R[row - 1].length) { row--; col = Math.min(col, R[row].length - 1); }
      if (k === "down" && row < R.length - 1) { row++; col = Math.min(col, R[row].length - 1); }
      if (k === "ok" && R[row][col]) open(R[row][col]);
      if (k === "menu" && R[row][col] && R[row][col].type === "app") { mode = "menu"; menuIdx = 0; }
      paintFocus();
      return true;
    }
  };
})();
