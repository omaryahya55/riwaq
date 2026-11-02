/*
 * يشغّل النموذج: يصغّر المسرح على الشاشة، يبدّل بين الواجهة وشاشة التوقف،
 * ويحوّل أزرار الريموت (أو الكيبورد) لأوامر.
 * ريموت أندرويد: الأسهم و OK (Enter) توصل للصفحة كأزرار كيبورد.
 */
(function () {
  const stage = document.getElementById("stage");
  const viewport = document.getElementById("viewport");
  const params = new URLSearchParams(location.search);
  // بعد كم ثانية بدون ضغط تطلع شاشة التوقف (على التلفزيون: أندرويد نفسه يشغّل شاشة التوقف، وهذا للمتصفح)
  const IDLE_MS = (Number(params.get("idle")) || CONFIG.idleSeconds || 90) * 1000;

  let forcedPeriod = null, forcedNight = null, idleTimer;
  // داخل شاشة توقف أندرويد: نعرض شاشة التوقف بس، وأندرويد يقفلها بأي زر
  const MODE_SAVER_ONLY = /screen=saver/.test(location.hash) && !!window.Riwaq;

  function fit() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    const s = Math.min(w / 1920, h / 1080);
    stage.style.transform = `scale(${s})`;
    stage.style.left = (w - 1920 * s) / 2 + "px";
    stage.style.top = (h - 1080 * s) / 2 + "px";
  }

  // دقايق كل وقت صلاة اليوم. بدون مدينة: أوقات تقريبية بس عشان لون الخلفية
  function prayerMinutes(now) {
    const t = Prayer.timesFor(now, 0);
    if (!t) return { fajr: 300, sunrise: 360, asr: 900, maghrib: 1080, isha: 1170 };
    const m = {}; t.forEach((p) => (m[p.id] = F.minutesOfDay(p.at))); return m;
  }

  let sceneKey = "";
  const CLOCK_FONTS = { amiri: '"Amiri", serif', alyamama: '"Alyamama", "Amiri", serif', readex: '"Readex Pro", "Amiri", serif', fustat: '"Fustat", "Amiri", serif' };
  // ألبوم البيت: شاشة الانتظار بس، وبالنهار والسهرة، وتتبدل كل نص ساعة. "مع صورنا" بالتناوب
  let albumIds = null;
  function albumNow(now, min, pm) {
    if (App.current !== "saver" || CONFIG.albumMode === "off" || CONFIG.density === "full") return null;
    if (albumIds === null) { try { albumIds = window.Riwaq && Riwaq.getAlbum ? JSON.parse(Riwaq.getAlbum()).ids || [] : []; } catch (e) { albumIds = []; } }
    if (!albumIds.length || (min >= 90 && min < pm.fajr - 30 && F.hijriParts(now).m !== 9)) return null;
    const slot = Math.floor(now.getTime() / 1800000);
    if (CONFIG.albumMode === "mix" && slot % 2) return null;
    return albumIds[Math.floor(slot / (CONFIG.albumMode === "mix" ? 2 : 1)) % albumIds.length];
  }

  function updateScene() {
    const now = new Date();
    const min = F.minutesOfDay(now);
    const pm = prayerMinutes(now);
    const period = forcedPeriod || Scene.periodAt(min, pm);
    stage.dataset.period = period;
    const own = albumNow(now, min, pm);
    const key = (own !== null ? "album:" + own : period) + "|" + Math.floor(now.getTime() / 86400000);
    if (key !== sceneKey) {
      const first = !sceneKey;
      sceneKey = key;
      const el = document.getElementById("scene");
      const paint = () => { if (own !== null) Scene.album(el, own); else Scene.render(el, period); };
      // تعتيم، تبديل، ظهور: ما تجتمع صورتين بحجم الشاشة، وما فيه قطع مفاجئ
      if (first) paint();
      else { el.style.opacity = 0; setTimeout(() => { paint(); el.style.opacity = 1; Saver.tick(true); Home.tick(); }, 450); }
    }
    stage.style.setProperty("--font-clock", CLOCK_FONTS[CONFIG.clockFont] || CLOCK_FONTS.amiri);
    // التعتيم الليلي وساعة الليل: من ١:٣٠ بالليل لين قبل الفجر بنص ساعة (اختيار صاحب المشروع)
    const start = 90, fajr = pm.fajr - 30;
    // رمضان: بدون تعتيم وقت السحور، والإمساك ظاهر (قرار صاحب المشروع)
    const night = forcedNight !== null ? forcedNight : (min >= start && min < fajr && F.hijriParts(now).m !== 9);
    stage.classList.toggle("night", night && App.current === "saver");
    stage.classList.toggle("motion", CONFIG.motion !== false);
    stage.classList.toggle("calm", CONFIG.density !== "full");
    stage.classList.toggle("frame", CONFIG.density === "frame");
    stage.classList.toggle("moment", CONFIG.homeLayout !== "classic");
    // ساعة الليل (مثل Nest Hub و Echo Show): بالليل نخلي الوقت والتاريخ والصلاة الجاية بس
    stage.classList.toggle("nightclock", night && App.current === "saver" && CONFIG.nightClock !== false);
  }

  function show(name) {
    App.current = name;
    document.getElementById("home").classList.toggle("on", name === "home");
    document.getElementById("saver").classList.toggle("on", name === "saver");
    if (name === "saver") Saver.tick(true); else { stage.classList.remove("alert"); Home.tick(); }
    updateScene();
    syncDevbar();
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    // ما تقطع شاشة الانتظار القراءة أو الرمز أو أي قائمة مفتوحة
    idleTimer = setTimeout(() => { if (window.Home && Home.busy && Home.busy()) resetIdle(); else show("saver"); }, IDLE_MS);
  }

  // ===== الأزرار =====
  const MAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", " ": "ok",
                Escape: "back", Backspace: "back", GoBack: "back", BrowserBack: "back", ContextMenu: "menu", m: "menu", M: "menu" };
  let okDown = 0, okLong = false, okTimer;

  // أزرار الأرقام (لو الريموت فيها): d0 إلى d9
  for (let n = 0; n <= 9; n++) MAP[String(n)] = "d" + n;

  function dispatch(k) {
    resetIdle();
    if (window.PhoneMsg && PhoneMsg.key(k)) return true; // رسالة الجوال ظاهرة: الزر يقفلها
    if (App.current === "saver") { if (!MODE_SAVER_ONLY) show("home"); return; } // أي زر يرجّع للواجهة
    return Home.key(k);
  }
  // أندرويد يرسل زر الرجوع هنا: true = الصفحة استخدمته
  window.RiwaqBack = () => dispatch("back") === true;

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
  // الشريط مخفي من البداية (عشان ما يطلع على التلفزيون وقت التحميل)، ويطلع في المتصفح بس
  if (!params.has("kiosk") && !window.Riwaq) bar.classList.remove("hidden");

  window.App = { current: "home", toast, show };
  // آخر خطأ في الصفحة: يطلع في تقرير المشكلة بس، وما يروح لأي مكان لحاله
  window.addEventListener("error", (e) => { try { if (window.Riwaq && Riwaq.jsError) Riwaq.jsError(String(e.message).slice(0, 200) + " @" + String(e.filename).split("/").pop() + ":" + e.lineno); } catch (x) { /* لا شي */ } });

  // ===== تشغيل =====
  // داخل شاشة توقف أندرويد ما نبني الواجهة أصلاً: بدون قائمة تطبيقات وبنرات وجلب محتوى زيادة
  if (!MODE_SAVER_ONLY) Home.init(document.getElementById("home"));
  Saver.init(document.getElementById("saver"));
  DATA.start();
  if (window.PhoneMsg) PhoneMsg.start();
  if (window.AdhanSchedule && !MODE_SAVER_ONLY) AdhanSchedule.start();
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("load", fit);
  // بعض متصفحات التلفزيون تكبّر الصفحة بعد التحميل بدون حدث resize: نراقب حجمها بنفسنا
  if (window.ResizeObserver) new ResizeObserver(fit).observe(viewport);
  const start = params.get("screen") || (location.hash.match(/screen=(\w+)/) || [])[1];
  show(start === "saver" ? "saver" : "home");
  if (!MODE_SAVER_ONLY) resetIdle();
  // الصفحة ورا تطبيق ثاني: ما نحسب ولا نرسم شي
  setInterval(() => { if (document.hidden) return; Saver.tick(); Home.tick(); updateScene(); }, 1000 * 15);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { Saver.tick(true); Home.tick(); updateScene(); } });
  // الخطوط توصل متأخر شوي: نعيد الرسم بعدها
  const remeasure = () => { window.dispatchEvent(new Event("riwaq-remeasure")); Saver.tick(true); Home.tick(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  // خط النص الديني يتحمل أول ما ينطلب، بعد القياس الأول: نقيس مرة ثانية بالخط الحقيقي عشان ما ينقص شي
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", remeasure);
  // أندرويد ينتظر هذي الإشارة قبل ما ينفذ أي أمر معلّق (بدل انتظار ثابت)، وسكربت التركيب يتأكد منها إن الصفحة انرسمت
  if (window.Riwaq && Riwaq.ready) Riwaq.ready();
})();
