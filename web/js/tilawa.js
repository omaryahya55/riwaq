/*
 * شاشة القرآن: تختار الشيخ، ثم السورة، وتشتغل التلاوة في خدمة أصلية تكمل لو رجعت للواجهة أو طلعت شاشة الانتظار.
 * الأذان يوقفها ويرجعها، وتوقف لو انطفى التلفزيون أو شغّلت فيديو. الشاشة تتحرك بالريموت بس.
 * في المتصفح (بدون أندرويد) الحالة تجريبية، بدون صوت.
 */
(function () {
  const native = () => !!(window.Riwaq && Riwaq.tilawaPlay);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLS = 3, CELL_H = 136, ROW_H = 84, GRID_H = 744, LIST_H = 756;
  const IDLE_MS = 120000; // بعدها نرجع للواجهة، والتلاوة تكمل، وشاشة الانتظار تقدر تطلع
  const KEY = "riwaq.tilawa";

  let box, onClose = null, view = "r"; // r الشيوخ، s السور، p التشغيل
  let rIdx = 0, sIdx = 0, ctl = 1, timer = null, lastKey = 0;
  let demo = { on: false, paused: false, edition: "", surah: 0, verse: false, pos: 0, dur: 0, ayah: 0, ayahs: 0, loading: false };

  const data = () => window.TILAWA || { reciters: [], surahs: [] };
  const reciter = (id) => data().reciters.find((r) => r.id === id);
  const surah = (n) => data().surahs.find((s) => s.n === n);
  const bare = (name) => String(name).replace(/^سُورَةُ\s+/, "");
  const fullName = (r) => (r ? r.name + (r.style ? " · " + r.style : "") : "");
  // الخدمة تبدأ بعد لحظة من الضغط: نعرض "نجهز" من أول ما يضغط، ولو ما بدأت خلال ثواني نرجع للقائمة
  let pending = null;
  const state = () => {
    if (!native()) return demo;
    let st;
    try { st = JSON.parse(Riwaq.tilawaState()); } catch (e) { st = { on: false }; }
    if (st.on) { pending = null; return st; }
    if (pending && Date.now() - pending.at < 4000) return { on: true, loading: true, paused: false, edition: pending.edition, surah: pending.surah, verse: pending.verse, pos: 0, dur: 0, ayah: 0, ayahs: surah(pending.surah).ayahs };
    pending = null;
    return st;
  };
  const clock = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), z = (n) => String(n).padStart(2, "0");
    return F.digits(h ? `${h}:${z(m)}:${z(s % 60)}` : `${m}:${z(s % 60)}`);
  };

  // زر الاستكمال: أول سطر في القائمة، لو فيه تلاوة وقفت في نصها
  const resumeItem = () => {
    const st = state(), l = st.last;
    if (st.on || !l || !reciter(l.edition) || !surah(l.surah) || !(l.at > 0)) return null;
    return l;
  };
  const rows = () => (resumeItem() ? [{ resume: true }] : []).concat(data().reciters);

  function build() {
    box = document.createElement("div");
    box.className = "tl";
    box.innerHTML = `
      <div class="tl-bg"></div>
      <div class="tl-lists">
        <header class="tl-head"><h2>القرآن الكريم</h2><p class="tl-step" data-t="step"></p></header>
        <div class="tl-reciters"><div class="tl-rs" data-t="rs"></div></div>
        <div class="tl-surahs"><div class="tl-ss" data-t="ss"></div></div>
        <div class="tl-src">التلاوات من mp3quran.net</div>
      </div>
      <div class="tl-player">
        <div class="tl-reciter" data-t="pr"></div>
        <div class="tl-name" data-t="pn"></div>
        <div class="tl-meta" data-t="pm"></div>
        <div class="tl-bar"><i data-t="pb"></i></div>
        <div class="tl-times"><span data-t="pa"></span><span data-t="pd"></span></div>
        <div class="tl-ctl" data-t="pc"></div>
      </div>`;
    document.getElementById("home").appendChild(box);
  }
  const $ = (k) => box.querySelector(`[data-t="${k}"]`);

  function renderReciters() {
    const list = rows();
    $("rs").innerHTML = list.map((r, i) => {
      if (r.resume) {
        const l = resumeItem(), s = surah(l.surah), rc = reciter(l.edition);
        return `<div class="tl-r tl-resume ${i === rIdx ? "on" : ""}"><b>أكمل ${esc(s.name)}</b><small>${esc(fullName(rc))}</small></div>`;
      }
      return `<div class="tl-r ${i === rIdx ? "on" : ""}"><b>${esc(r.name)}</b>${r.style ? `<small>${esc(r.style)}</small>` : ""}</div>`;
    }).join("");
    $("rs").style.transform = `translateY(${-Math.max(0, Math.min(rIdx * ROW_H - LIST_H / 2 + ROW_H, list.length * ROW_H - LIST_H))}px)`;
  }
  function renderSurahs(paintAll) {
    if (paintAll) {
      $("ss").innerHTML = data().surahs.map((s, i) => `<div class="tl-s" data-i="${i}"><span class="tl-no">${F.digits(s.n)}</span><b>${esc(bare(s.name))}</b><small>${F.digits(s.ayahs)} آية</small></div>`).join("");
    }
    box.querySelectorAll(".tl-s.on").forEach((e) => e.classList.remove("on"));
    if (view === "s") { const c = $("ss").children[sIdx]; if (c) c.classList.add("on"); }
    const total = Math.ceil(data().surahs.length / COLS) * CELL_H, row = Math.floor(sIdx / COLS);
    $("ss").style.transform = `translateY(${-Math.max(0, Math.min(row * CELL_H - GRID_H / 2 + CELL_H, total - GRID_H))}px)`;
  }
  function paintStep() {
    const r = rows()[rIdx];
    $("step").textContent = view === "r" ? "اختر الشيخ" : "اختر السورة · " + (r && !r.resume ? fullName(r) : "");
    box.classList.toggle("on-s", view === "s");
    box.classList.toggle("on-r", view === "r");
    box.classList.toggle("on-p", view === "p");
    box.querySelectorAll(".tl-r.on").forEach((e) => e.classList.toggle("was", view !== "r"));
  }

  const CONTROLS = () => {
    const st = state();
    return [
      { id: "prev", ic: "tprev", name: "السورة السابقة" },
      { id: "toggle", ic: st.paused ? "tplay" : "tpause", name: st.paused ? "تشغيل" : "إيقاف مؤقت" },
      { id: "next", ic: "tnext", name: "السورة التالية" },
      { id: "stop", ic: "tstop", name: "إنهاء" }
    ];
  };
  function renderPlayer() {
    const st = state();
    if (view !== "p") return;
    // خلصت أو توقفت: نرجع لقائمة الشيوخ، وأول سطر فيها يكمل من مكانها
    if (!st.on) { view = "r"; rIdx = 0; renderAll(); return; }
    const rc = reciter(st.edition), s = surah(st.surah);
    $("pr").textContent = fullName(rc);
    $("pn").textContent = s ? s.name : "";
    $("pm").textContent = st.loading ? "نجهز التلاوة…" : st.paused ? "متوقفة مؤقتاً" : st.verse ? `الآية ${F.digits(st.ayah + 1)} من ${F.digits(st.ayahs)}` : "";
    const pct = st.verse ? (st.ayahs ? ((st.ayah + 1) / st.ayahs) * 100 : 0) : st.dur ? (st.pos / st.dur) * 100 : 0;
    $("pb").style.width = Math.min(100, pct) + "%";
    $("pa").textContent = st.verse || !st.dur ? "" : clock(st.pos);
    $("pd").textContent = st.verse || !st.dur ? "" : clock(st.dur);
    const h = CONTROLS().map((c, i) => `<div class="tl-b ${i === ctl ? "on" : ""}" ${c.id === "toggle" ? 'data-main="1"' : ""}>${icon(c.ic)}<span>${c.name}</span></div>`).join("");
    if ($("pc").__h !== h) { $("pc").innerHTML = h; $("pc").__h = h; }
  }
  function renderAll() {
    renderReciters(); renderSurahs(false); paintStep(); renderPlayer();
  }

  // ===== أوامر =====
  function play(rc, n, at) {
    if (native()) { pending = { edition: rc.id, surah: n, verse: !!rc.verse, at: Date.now() }; Riwaq.tilawaPlay(rc.id, n, !!rc.verse, rc.rate, at || 0); }
    else demo = { on: true, paused: false, edition: rc.id, surah: n, verse: !!rc.verse, pos: 62000, dur: 7200000, ayah: 12, ayahs: surah(n).ayahs, loading: false };
    try { localStorage.setItem(KEY, rc.id); } catch (e) { /* بدون تخزين: يبدأ من أول شيخ */ }
    view = "p"; ctl = 1;
    renderAll();
  }
  function stop() {
    pending = null;
    if (native()) Riwaq.tilawaStop(); else demo = Object.assign({}, demo, { on: false });
  }
  function act(id) {
    const st = state(), rc = reciter(st.edition);
    if (id === "toggle") { if (native()) Riwaq.tilawaToggle(); else demo.paused = !demo.paused; setTimeout(renderPlayer, 150); return; }
    if (id === "stop") { stop(); view = "r"; rIdx = 0; setTimeout(renderAll, 300); return; }
    if (!rc) return;
    if (id === "next" && st.surah < 114) play(rc, st.surah + 1, 0);
    if (id === "prev" && st.surah > 1) play(rc, st.surah - 1, 0);
  }
  function close() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!box) return;
    box.classList.remove("on");
    document.getElementById("home").classList.remove("tl-open");
    const fn = onClose; onClose = null;
    if (fn) fn();
  }

  window.Tilawa = {
    open(then) {
      if (!box) { build(); renderSurahs(true); }
      onClose = then; lastKey = Date.now();
      if (!document.getElementById("stage").style.getPropertyValue("--glass")) document.getElementById("stage").style.setProperty("--glass", "none");
      const st = state(), list = rows();
      let saved = ""; try { saved = localStorage.getItem(KEY) || ""; } catch (e) { saved = ""; }
      rIdx = 0;
      if (!list[0] || !list[0].resume) rIdx = Math.max(0, list.findIndex((r) => r.id === (st.on ? st.edition : saved)));
      view = st.on ? "p" : "r"; ctl = 1;
      if (st.on) sIdx = Math.max(0, st.surah - 1);
      box.classList.add("on");
      document.getElementById("home").classList.add("tl-open");
      renderAll();
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (document.hidden) return;
        if (Date.now() - lastKey > IDLE_MS) { close(); return; }
        renderPlayer();
      }, 1000);
    },
    close,
    key(k) {
      lastKey = Date.now();
      const list = rows();
      if (view === "p") {
        const C = CONTROLS();
        // أزرار التشغيل وشريطه من اليسار لليمين حتى في العربي (مثل كل المشغّلات)
        if (k === "left") ctl = Math.max(0, ctl - 1);
        if (k === "right") ctl = Math.min(C.length - 1, ctl + 1);
        if (k === "ok") { act(C[ctl].id); return true; }
        const st = state();
        // فوق وتحت: تقديم وترجيع (٣٠ ثانية، أو آية في التلاوة آية آية)
        if ((k === "up" || k === "down") && st.on && native()) Riwaq.tilawaSeek(k === "up" ? 1 : -1);
        if (k === "back" || k === "menu") { view = "s"; renderAll(); return true; }
        renderPlayer(); return true;
      }
      if (view === "s") {
        const n = data().surahs.length;
        // الشبكة من اليمين لليسار: اليسار = السورة اللي بعدها
        if (k === "left" && sIdx % COLS < COLS - 1 && sIdx < n - 1) sIdx++;
        else if (k === "right") { if (sIdx % COLS === 0) { view = "r"; renderAll(); return true; } sIdx--; }
        if (k === "down") sIdx = Math.min(n - 1, sIdx + COLS);
        if (k === "up") sIdx = Math.max(0, sIdx - COLS);
        if (k === "ok") {
          const r = list[rIdx];
          if (r && !r.resume) play(r, data().surahs[sIdx].n, 0);
          return true;
        }
        if (k === "back" || k === "menu") { view = "r"; renderAll(); return true; }
        renderSurahs(false); paintStep(); return true;
      }
      if (k === "up") rIdx = Math.max(0, rIdx - 1);
      if (k === "down") rIdx = Math.min(list.length - 1, rIdx + 1);
      if (k === "left" || k === "ok") {
        const r = list[rIdx];
        if (r && r.resume && k === "ok") {
          const l = resumeItem(), rc = reciter(l.edition);
          play(rc, l.surah, l.at);
          return true;
        }
        if (r && !r.resume) { view = "s"; renderAll(); return true; }
      }
      if (k === "back" || k === "menu") { close(); return true; }
      renderReciters(); paintStep(); return true;
    },
    // سطر هادي للواجهة وشاشة الانتظار: وش يشتغل الحين
    nowLine() {
      const st = state();
      if (!st.on) return "";
      const s = surah(st.surah), rc = reciter(st.edition);
      return s && rc ? `${s.name} · ${rc.name}` : "";
    },
    playing() { return !!state().on; },
    stop
  };
})();
