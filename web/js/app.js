/*
 * يشغّل النموذج: يصغّر المسرح على الشاشة، يبدّل بين الواجهة وشاشة التوقف،
 * ويحوّل أزرار الريموت (أو الكيبورد) لأوامر.
 * ريموت أندرويد: الأسهم و OK (Enter) توصل للصفحة كأزرار كيبورد.
 */
(function () {
  const stage = document.getElementById("stage");
  const viewport = document.getElementById("viewport");
  const params = new URLSearchParams(location.search);
  const IDLE_MS = (Number(params.get("idle")) || 90) * 1000; // بعد كم ثانية بدون ضغط تطلع شاشة التوقف

  let forcedPeriod = null, forcedNight = null, idleTimer;

  function fit() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    const s = Math.min(w / 1920, h / 1080);
    stage.style.transform = `scale(${s})`;
    stage.style.left = (w - 1920 * s) / 2 + "px";
    stage.style.top = (h - 1080 * s) / 2 + "px";
  }

  const toMin = (id) => { const [h, m] = DEMO.prayers.find((p) => p.id === id).time.split(":").map(Number); return h * 60 + m; };

  function updateScene() {
    const min = F.minutesOfDay(new Date());
    const period = forcedPeriod || Scene.periodAt(min, DEMO.prayers);
    if (period !== stage.dataset.period) {
      stage.dataset.period = period;
      Scene.render(document.getElementById("scene"), period);
    }
    // التعتيم الليلي: من بعد العشاء بساعة ونص لين قبل الفجر بنص ساعة
    const isha = toMin("isha") + 90, fajr = toMin("fajr") - 30;
    const night = forcedNight !== null ? forcedNight : (min >= isha || min < fajr);
    stage.classList.toggle("night", night && App.current === "saver");
  }

  function show(name) {
    App.current = name;
    document.getElementById("home").classList.toggle("on", name === "home");
    document.getElementById("saver").classList.toggle("on", name === "saver");
    if (name === "saver") Saver.tick(true); else stage.classList.remove("alert");
    updateScene();
    syncDevbar();
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => show("saver"), IDLE_MS);
  }

  // ===== الأزرار =====
  const MAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", " ": "ok",
                Escape: "back", Backspace: "back", GoBack: "back", BrowserBack: "back", ContextMenu: "menu", m: "menu", M: "menu" };
  let okDown = 0, okLong = false, okTimer;

  function dispatch(k) {
    resetIdle();
    if (App.current === "saver") { show("home"); return; } // أي زر يرجّع للواجهة
    Home.key(k);
  }

  document.addEventListener("keydown", (e) => {
    const k = MAP[e.key];
    if (!k) return;
    e.preventDefault();
    if (k === "ok") {
      if (e.repeat || okDown) return;
      okDown = Date.now(); okLong = false;
      // OK مطوّل (أكثر من نص ثانية) = قائمة الخيارات
      okTimer = setTimeout(() => { okLong = true; dispatch("menu"); }, 550);
      return;
    }
    dispatch(k);
  });
  document.addEventListener("keyup", (e) => {
    if (MAP[e.key] !== "ok" || !okDown) return;
    clearTimeout(okTimer);
    okDown = 0;
    if (!okLong) dispatch("ok");
  });

  // ===== التوست =====
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
  }

  // ===== شريط أدوات النموذج (مو جزء من المنتج) =====
  const bar = document.getElementById("devbar");
  function syncDevbar() {
    bar.querySelectorAll("[data-a]").forEach((b) => {
      const a = b.dataset.a, v = b.dataset.v;
      b.classList.toggle("on",
        (a === "screen" && App.current === v) ||
        (a === "period" && forcedPeriod === v) ||
        (a === "res" && (v === "720") === viewport.classList.contains("frame720")) ||
        (a === "alert" && stage.classList.contains("alert")) ||
        (a === "night" && stage.classList.contains("night")));
    });
  }
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a, v = b.dataset.v;
    if (a === "screen") show(v);
    if (a === "period") { forcedPeriod = forcedPeriod === v ? null : v; updateScene(); }
    if (a === "res") { viewport.classList.toggle("frame720", v === "720"); fit(); }
    if (a === "alert") { show("saver"); Saver.setForceAlert(!stage.classList.contains("alert")); }
    if (a === "night") { forcedNight = !stage.classList.contains("night"); if (App.current !== "saver") show("saver"); updateScene(); }
    if (a === "hide") bar.classList.add("hidden");
    b.blur(); resetIdle(); syncDevbar();
  });
  if (params.has("kiosk")) bar.classList.add("hidden");

  window.App = { current: "home", toast, show };

  // ===== تشغيل =====
  Home.init(document.getElementById("home"));
  Saver.init(document.getElementById("saver"));
  fit();
  window.addEventListener("resize", fit);
  show(params.get("screen") === "saver" ? "saver" : "home");
  resetIdle();
  setInterval(() => { Saver.tick(); Home.tick(); updateScene(); }, 1000 * 15);
  // الخطوط توصل متأخر شوي: نعيد الرسم بعدها
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Saver.tick(true); Home.tick(); });
})();
