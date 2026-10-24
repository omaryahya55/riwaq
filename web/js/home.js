/*
 * الواجهة الرئيسية: صف التطبيقات اللي يختارها المستخدم ويرتبها، وصف المداخل والإعدادات.
 * في النموذج: الاختيار ينحفظ في المتصفح (localStorage). في التطبيق الحقيقي ينحفظ على التلفزيون.
 * أيقونات التطبيقات الحقيقية تجي من أندرويد نفسه. هنا مربعات بلون واسم بس (بدون شعارات).
 */
(function () {
  const D = window.DEMO;
  const KEY = "riwaq.pinned";
  const appById = Object.fromEntries(D.apps.map((a) => [a.id, a]));

  let pinned = load();
  let row = 0, col = 0;
  let mode = "nav";          // nav | menu | move | picker
  let menuIdx = 0, pickIdx = 0;
  let root;

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(v)) return v.filter((id) => appById[id]);
    } catch (e) { /* المتصفح ممكن يمنع التخزين: نرجع للافتراضي */ }
    return D.pinned.slice();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(pinned)); } catch (e) { /* نفس السبب */ } }

  // تفتيح وتغميق لون (بدل color-mix)
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
    return `rgb(${r},${g},${b})`;
  }

  function rows() {
    return [
      pinned.map((id) => ({ type: "app", id, name: appById[id].name })),
      D.inputs.map((i) => ({ type: "input", id: i.id, name: i.name, ic: i.icon }))
        .concat([{ type: "settings", name: "الإعدادات", ic: "gear" }, { type: "picker", name: "اختيار التطبيقات", ic: "grid" }])
    ];
  }

  function tileHTML(item, r, c) {
    if (item.type === "app") {
      const a = appById[item.id];
      const mono = /^[A-Za-z]/.test(a.name) ? a.name[0] : a.name.replace(/^ال/, "")[0];
      return `<div class="tile" data-r="${r}" data-c="${c}" style="--c1:${shade(a.tint, 0.08)};--c2:${shade(a.tint, -0.45)}"><div class="bg"></div><div class="mono">${mono}</div><div class="name clip"><bdi>${a.name}</bdi></div></div>`;
    }
    return `<div class="tile small" data-r="${r}" data-c="${c}">${icon(item.ic)}<div class="name clip">${item.name}</div></div>`;
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
      <div class="h-hero soft-shadow">
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
          <div class="h-row-head"><div class="h-row-title">المداخل والإعدادات</div></div>
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
    if (!R[0].length && row === 0) row = 1;
    col = Math.min(col, R[row].length - 1);
    paintFocus();
  }

  function paintFocus() {
    root.querySelectorAll(".tile").forEach((t) => t.classList.remove("focus", "moving"));
    const t = root.querySelector(`.tile[data-r="${row}"][data-c="${col}"]`);
    if (t && mode !== "picker") t.classList.add(mode === "move" ? "moving" : "focus");
    // صف طويل: نزحلقه عشان التطبيق المختار يبان
    const strip = $("r" + row), pitch = row === 0 ? 328 : 248, w = row === 0 ? 300 : 220;
    const shift = Math.max(0, col * pitch + w - 1736 + 60);
    strip.style.transform = `translateX(${shift}px)`;
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
    $("count").textContent = `مختار ${F.digits(pinned.length)} من ${F.digits(D.apps.length)}.`;
    $("plist").innerHTML = D.apps.map((a, i) => `<div class="pk ${pinned.includes(a.id) ? "on" : ""} ${i === pickIdx ? "focus" : ""}" style="--tint:${a.tint}"><span class="sw"></span><span class="nm"><bdi>${a.name}</bdi></span><span class="ck">${icon("check")}</span></div>`).join("");
    const shift = Math.max(0, pickIdx * 74 - 760 + 74 * 2);
    $("plist").style.transform = `translateY(${-Math.min(shift, Math.max(0, D.apps.length * 74 - 760))}px)`;
  }

  function renderStatus() {
    const now = new Date();
    const c = F.clock(now);
    $("time").innerHTML = `<span class="ltr">${c.h}:${c.m}</span><small>${c.ampm}</small>`;
    const parts = F.hijri(now).split("،");
    $("date").innerHTML = `${parts[0]}<small>${(parts[1] || "").trim()}</small>`;
    const w = F.weather(D.weather.now.code);
    $("wx").innerHTML = `${icon(w[1])}${F.num(D.weather.now.temp)}° ${w[0]}`;
    const np = Saver.nextPrayer(F.minutesOfDay(now));
    const t = F.hhmm(np.p.time);
    $("pname").textContent = np.p.name;
    $("psub").innerHTML = `${t.text} ${t.ampm} · <b>بعد ${F.duration(np.mins)}</b>`;
  }

  function open(item) {
    if (item.type === "picker") { mode = "picker"; pickIdx = 0; $("picker").classList.add("on"); renderPicker(); paintFocus(); return; }
    const msg = { app: `يفتح ${item.name} (في النموذج ما يفتح شي)`, input: `يحوّل إلى ${item.name}`, settings: "الإعدادات: يطلع باركود تصوّره بجوالك" }[item.type];
    App.toast(msg);
  }

  window.Home = {
    init(el) { root = build(el); renderRows(); renderStatus(); },
    tick() { renderStatus(); },
    key(k) {
      const R = rows();
      if (mode === "picker") {
        if (k === "up") pickIdx = Math.max(0, pickIdx - 1);
        if (k === "down") pickIdx = Math.min(D.apps.length - 1, pickIdx + 1);
        if (k === "ok") {
          const id = D.apps[pickIdx].id;
          pinned = pinned.includes(id) ? pinned.filter((x) => x !== id) : pinned.concat(id);
          save();
        }
        if (k === "back" || k === "menu") { mode = "nav"; $("picker").classList.remove("on"); renderRows(); return; }
        renderPicker();
        return;
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
            renderRows(); return;
          }
        }
        paintFocus(); return;
      }
      if (mode === "move") {
        // الصف من اليمين لليسار: السهم اليسار = للأمام في القائمة
        const dir = k === "left" ? 1 : k === "right" ? -1 : 0;
        const to = col + dir;
        if (dir && to >= 0 && to < pinned.length) { [pinned[col], pinned[to]] = [pinned[to], pinned[col]]; col = to; save(); renderRows(); return; }
        if (k === "ok" || k === "back") { mode = "nav"; App.toast("انحفظ الترتيب"); }
        paintFocus(); return;
      }
      // nav
      if (k === "left") col = Math.min(R[row].length - 1, col + 1);
      if (k === "right") col = Math.max(0, col - 1);
      if (k === "up" && row > 0 && R[row - 1].length) { row--; col = Math.min(col, R[row].length - 1); }
      if (k === "down" && row < R.length - 1) { row++; col = Math.min(col, R[row].length - 1); }
      if (k === "ok") open(R[row][col]);
      if (k === "menu" && R[row][col] && R[row][col].type === "app") { mode = "menu"; menuIdx = 0; }
      paintFocus();
    }
  };
})();
