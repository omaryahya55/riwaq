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
  let rIdx = 0, sIdx = 0, ctl = 2, timer = null, lastKey = 0;
  let demo = { on: false, paused: false, edition: "", surah: 0, verse: false, pos: 0, dur: 0, ayah: 0, ayahs: 0, loading: false, sleep: 0, sleepEnd: false };
  // مؤقت النوم: كل ضغطة تنقل للي بعده (مطفي، ١٥، ٣٠، ٤٥، ٦٠ دقيقة، آخر السورة)
  const SLEEP = [0, 15, 30, 45, 60, -1];
  let sleepSel = 0, demoSleepAt = 0;

  const data = () => window.TILAWA || { reciters: [], surahs: [] };
  const reciter = (id) => data().reciters.find((r) => r.id === id);
  const surah = (n) => data().surahs.find((s) => s.n === n);
  const bare = (name) => String(name).replace(/^سُورَةُ\s+/, "");
  const fullName = (r) => (r ? r.name + (r.style ? " · " + r.style : "") : "");
  // الخدمة تبدأ بعد لحظة من الضغط: نعرض "نجهز" من أول ما يضغط، ولو ما بدأت خلال ثواني نرجع للقائمة
  let pending = null;
  const state = () => {
    if (!native()) { if (demoSleepAt) demo.sleep = Math.max(0, Math.ceil((demoSleepAt - Date.now()) / 1000)); return demo; }
    let st;
    try { st = JSON.parse(Riwaq.tilawaState()); } catch (e) { st = { on: false }; }
    if (st.on) { pending = null; return st; }
    if (pending && Date.now() - pending.at < 4000) return { on: true, loading: true, paused: false, edition: pending.edition, surah: pending.surah, verse: pending.verse, pos: 0, dur: 0, ayah: 0, ayahs: surah(pending.surah).ayahs };
    pending = null;
    return st;
  };
  // رقم الآية: توقيت كل آية من mp3quran (يتحمل مرة لكل سورة وشيخ، وينحفظ في الذاكرة). اللي ما له توقيت ما يطلع له رقم
  const timing = {};
  function ayahNow(st) {
    const rc = reciter(st.edition);
    if (!rc || !rc.t || st.verse || !st.surah) return null;
    const key = rc.t + ":" + st.surah;
    if (!(key in timing)) {
      timing[key] = null;
      try {
        fetch(`https://www.mp3quran.net/api/v3/ayat_timing?surah=${st.surah}&read=${rc.t}`).then((r) => (r.ok ? r.json() : [])).then((j) => {
          timing[key] = Array.isArray(j) ? j.filter((x) => x && x.ayah > 0).map((x) => [+x.start_time, +x.end_time, +x.ayah]) : [];
        }).catch(() => { timing[key] = []; });
      } catch (e) { timing[key] = []; }
    }
    const t = timing[key];
    if (!t || !t.length) return null;
    const pos = st.pos || 0;
    let lo = 0, hi = t.length - 1, a = 0;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (t[m][0] <= pos) { a = t[m][2]; lo = m + 1; } else hi = m - 1; }
    return a > 0 ? { n: a, of: (surah(st.surah) || {}).ayahs || t.length } : null;
  }
  const ayahText = (st) => { const a = ayahNow(st); return a ? `الآية ${F.digits(a.n)} من ${F.digits(a.of)}` : ""; };
  // من وين نكمل: آخر تلاوة وقفت في نصها
  const DISMISS = "riwaq.tlDismiss";
  const dismissKey = (l) => `${l.edition}|${l.surah}|${l.at}`;
  function resumeInfo() {
    const l = resumeItem();
    if (!l) return null;
    try { if (localStorage.getItem(DISMISS) === dismissKey(l)) return null; } catch (e) { /* بدون تخزين: تبقى ظاهرة */ }
    const rc = reciter(l.edition), s = surah(l.surah);
    return { l, rc, s, ayah: l.verse ? "" : ayahText({ edition: l.edition, surah: l.surah, pos: l.at }) };
  }

  // الباقي على مؤقت النوم بكلام قصير
  const sleepText = (st) => {
    if (!st || !st.on) return "";
    if (st.sleepEnd) return "يوقف بآخر السورة";
    if (!(st.sleep > 0)) return "";
    const m = Math.ceil(st.sleep / 60);
    return st.sleep < 60 ? "يوقف خلال دقيقة" : `يوقف بعد ${F.digits(m)} د`;
  };
  const sleepOn = (st) => !!(st && st.on && (st.sleepEnd || st.sleep > 0));

  const clock = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), z = (n) => String(n).padStart(2, "0");
    return F.digits(h ? `${h}:${z(m)}:${z(s % 60)}` : `${m}:${z(s % 60)}`);
  };

  // زر الاستكمال: أول سطر في القائمة، لو فيه تلاوة وقفت في نصها
  const resumeItem = () => {
    const st = state(), l = st.last;
    if (st.on || !l || !reciter(l.edition) || !surah(l.surah) || !(l.at > 0 || l.verse)) return null;
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
    const list = rows(), box = $("rs");
    const l = resumeItem(), sig = list.length + "|" + (l ? l.edition + l.surah + "|" + ayahText({ edition: l.edition, surah: l.surah, pos: l.at }) : "");
    if (box.__sig !== sig) {
      box.__sig = sig;
      box.innerHTML = list.map((r) => {
        if (r.resume) {
          const s = surah(l.surah), rc = reciter(l.edition);
          const ay = ayahText({ edition: l.edition, surah: l.surah, pos: l.at });
          return `<div class="tl-r tl-resume"><b>أكمل ${esc(s.name)}${ay ? " · " + esc(ay) : ""}</b><small>${esc(fullName(rc))}</small></div>`;
        }
        return `<div class="tl-r"><b>${esc(r.name)}</b>${r.style ? `<small>${esc(r.style)}</small>` : ""}</div>`;
      }).join("");
    }
    for (let i = 0; i < box.children.length; i++) box.children[i].classList.toggle("on", i === rIdx);
    if (view === "r") Dock.apply(box.children, rIdx, { axis: "y", dir: 1, size: 84, scale: [1.05, 1.015] }); else Dock.clear(box.children);
    box.style.transform = `translateY(${-Math.max(0, Math.min(rIdx * ROW_H - LIST_H / 2 + ROW_H, list.length * ROW_H - LIST_H))}px)`;
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
      { id: "back", ic: "tback10", name: st.verse ? "آية قبل" : "١٠ ثواني قبل" },
      { id: "toggle", ic: st.paused ? "tplay" : "tpause", name: st.paused ? "تشغيل" : "إيقاف مؤقت" },
      { id: "fwd", ic: "tfwd10", name: st.verse ? "آية بعد" : "١٠ ثواني بعد" },
      { id: "next", ic: "tnext", name: "السورة التالية" },
      { id: "sleep", ic: "moon", name: sleepOn(st) ? sleepText(st) : "مؤقت النوم", lit: sleepOn(st) },
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
    $("pm").textContent = st.loading ? "نجهز التلاوة…" : (st.paused ? "متوقفة مؤقتاً · " : "") + (st.verse ? `الآية ${F.digits(st.ayah + 1)} من ${F.digits(st.ayahs)}` : ayahText(st)) || (st.paused ? "متوقفة مؤقتاً" : "");
    const pct = st.verse ? (st.ayahs ? ((st.ayah + 1) / st.ayahs) * 100 : 0) : st.dur ? (st.pos / st.dur) * 100 : 0;
    $("pb").style.width = Math.min(100, pct) + "%";
    $("pa").textContent = st.verse || !st.dur ? "" : clock(st.pos);
    $("pd").textContent = st.verse || !st.dur ? "" : clock(st.dur);
    // الأزرار ثابتة، ويتغير اللي تغيّر بس: مثل الـ Dock، المحدد يكبر وجيرانه يبتعدون
    const C = CONTROLS(), pc = $("pc");
    if (pc.children.length !== C.length) pc.innerHTML = C.map(() => `<div class="tl-b"></div>`).join("");
    C.forEach((c, i) => {
      const e = pc.children[i], h = icon(c.ic) + `<span>${c.name}</span>`;
      if (e.__h !== h) { e.innerHTML = h; e.__h = h; }
      e.classList.toggle("on", i === ctl);
      e.classList.toggle("lit", !!c.lit);
    });
    Dock.apply(pc.children, ctl, { dir: 1, size: 150, scale: [1.2, 1.08] });
  }
  function renderAll() {
    renderReciters(); renderSurahs(false); paintStep(); renderPlayer();
  }

  // ===== أوامر =====
  function play(rc, n, at) {
    if (native()) { pending = { edition: rc.id, surah: n, verse: !!rc.verse, at: Date.now() }; Riwaq.tilawaPlay(rc.id, n, !!rc.verse, rc.rate, at || 0); }
    else demo = { on: true, paused: false, edition: rc.id, surah: n, verse: !!rc.verse, pos: 62000, dur: 7200000, ayah: 12, ayahs: surah(n).ayahs, loading: false };
    try { localStorage.setItem(KEY, rc.id); } catch (e) { /* بدون تخزين: يبدأ من أول شيخ */ }
    view = "p"; ctl = 2;
    renderAll();
  }
  function stop() {
    pending = null;
    sleepSel = 0; demoSleepAt = 0;
    if (native()) Riwaq.tilawaStop(); else demo = Object.assign({}, demo, { on: false, sleep: 0, sleepEnd: false, last: { edition: demo.edition, surah: demo.surah, verse: false, rate: 128, at: demo.pos } });
  }
  function act(id) {
    const st = state(), rc = reciter(st.edition);
    if (id === "toggle") { if (native()) Riwaq.tilawaToggle(); else demo.paused = !demo.paused; setTimeout(renderPlayer, 150); return; }
    if (id === "back" || id === "fwd") {
      const dir = id === "fwd" ? 1 : -1;
      if (native()) Riwaq.tilawaSeek(dir); else demo.pos = Math.max(0, demo.pos + dir * 10000);
      setTimeout(renderPlayer, 120);
      return;
    }
    if (id === "sleep") {
      // المؤقت انتهى أو انطفى من مكان ثاني: نبدأ من أول خيار
      if (!sleepOn(st)) sleepSel = 0;
      sleepSel = (sleepSel + 1) % SLEEP.length;
      const min = SLEEP[sleepSel];
      if (native()) Riwaq.tilawaSleep(min);
      else { demo.sleepEnd = min === -1; demoSleepAt = min > 0 ? Date.now() + min * 60000 : 0; demo.sleep = min > 0 ? min * 60 : 0; }
      setTimeout(renderPlayer, 150);
      return;
    }
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
      view = st.on ? "p" : "r"; ctl = 2;
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
        // فوق وتحت: اختصار لنفس الزرين (١٠ ثواني، أو آية في التلاوة آية آية)
        if ((k === "up" || k === "down") && st.on) act(k === "up" ? "fwd" : "back");
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
    toggle() { if (state().on) act("toggle"); },
    seek(dir) { if (state().on && native()) Riwaq.tilawaSeek(dir); },
    // أكمل من حيث وقفت (من الواجهة، بدون ما تدخل شاشة القرآن)
    resume() {
      const l = resumeItem(), rc = l && reciter(l.edition);
      if (!rc) return;
      if (!box) { build(); renderSurahs(true); }
      play(rc, l.surah, l.at);
    },
    // إغلاق المشغّل بدون استكمال: يوقف ويخفي بطاقة «أكمل» لهذا المكان
    dismiss() {
      const l = resumeItem();
      if (l) try { localStorage.setItem(DISMISS, dismissKey(l)); } catch (e) { /* بدون تخزين */ }
    },
    stopAndDismiss() { stop(); setTimeout(() => this.dismiss(), 700); },
    // للمشغّل الصغير في الواجهة
    info() {
      const st = state();
      if (!st.on) {
        const r = resumeInfo();
        return r && r.s && r.rc ? { resume: true, name: r.s.name, reciter: fullName(r.rc), ayah: r.ayah, paused: true, loading: false, pct: 0 } : null;
      }
      const s = surah(st.surah), rc = reciter(st.edition);
      const pct = st.verse ? (st.ayahs ? ((st.ayah + 1) / st.ayahs) * 100 : 0) : st.dur ? (st.pos / st.dur) * 100 : 0;
      return { name: s ? s.name : "", reciter: fullName(rc), paused: !!st.paused, loading: !!st.loading, pct: Math.min(100, pct), sleep: sleepText(st), ayah: st.verse ? `الآية ${F.digits(st.ayah + 1)} من ${F.digits(st.ayahs)}` : ayahText(st) };
    },
    stop
  };
})();
