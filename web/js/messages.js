/*
 * رسالة من الجوال على التلفزيون (البريف قسم ٣هـ): بوت تيليقرام خاص بالمستخدم.
 * - ما فيه سيرفر: التلفزيون نفسه يسحب الرسائل من تيليقرام كل ٢٠ ثانية (وهو ظاهر بس)
 * - الربط: صفحة الإعدادات تعطي رمز من ٦ أرقام، والجوال يرسله للبوت مرة وحدة. بعدها رسائل هذا
 *   الجوال بس تطلع (لين ٥ أجهزة). ١٠ محاولات غلط من غرباء = الربط يتقفل لين رمز جديد
 * - الرسالة الأقدم من ١٠ دقايق ما تطلع، وتنعرض كنص بس (مو HTML)
 * - مفتاح البوت سرّي: على التلفزيون بس، ويروح لـ api.telegram.org بس
 */
(function () {
  const POLL_MS = 20000, MAX_AGE_S = 600, SHOW_MS = 120000, MAX_ALLOWED = 5, MAX_FAILS = 10;
  const OFFSET_KEY = "riwaq.tg.offset";
  let busy = false, hideTimer = null, box = null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const tg = () => CONFIG.telegram || {};
  const tokenOk = (t) => /^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$/.test(t || "");
  const api = (method, q) => `https://api.telegram.org/bot${tg().token}/${method}?${new URLSearchParams(q)}`;

  // على التلفزيون عن طريق أندرويد، وفي المتصفح مباشرة
  function getText(url) {
    if (window.Riwaq && Riwaq.fetchText) {
      return new Promise((resolve, reject) => {
        const id = "cb" + Math.random().toString(36).slice(2, 10);
        window.__riwaqCb = window.__riwaqCb || {};
        window.__riwaqCb[id] = (ok, text) => { delete window.__riwaqCb[id]; ok ? resolve(text) : reject(new Error("tg")); };
        Riwaq.fetchText(url, id);
      });
    }
    return fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error("tg"))));
  }

  function saveTg(patch) {
    Config.save({ telegram: Object.assign({}, tg(), patch) });
  }

  function show(name, text) {
    if (!box) {
      box = document.createElement("div");
      box.className = "phone-msg";
      document.getElementById("stage").appendChild(box);
    }
    box.innerHTML = `<div class="pm-from">رسالة من ${esc(name)}</div><div class="pm-text">${esc(text)}</div><div class="pm-hint">OK أو رجوع: إغلاق</div>`;
    box.classList.add("on");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, SHOW_MS);
  }
  function hide() { if (box) box.classList.remove("on"); }

  async function poll() {
    const t = tg();
    if (busy || !tokenOk(t.token) || document.visibilityState === "hidden") return;
    busy = true;
    try {
      let offset = 0;
      try { offset = Number(localStorage.getItem(OFFSET_KEY)) || 0; } catch (e) { /* بدون تخزين */ }
      const j = JSON.parse(await getText(api("getUpdates", { offset, timeout: 0, allowed_updates: '["message"]' })));
      if (!j.ok || !Array.isArray(j.result)) return;
      const allowed = (t.allowed || []).map((a) => String(a.id));
      let fails = t.fails || 0, last = null;
      for (const u of j.result) {
        offset = Math.max(offset, u.update_id + 1);
        const m = u.message;
        if (!m || !m.chat || typeof m.text !== "string") continue;
        const chat = String(m.chat.id), name = (m.from && m.from.first_name) || "الجوال";
        if (!allowed.includes(chat)) {
          // جوال جديد: يرسل رمز الربط بس
          if (t.code && fails < MAX_FAILS && m.text.trim() === t.code && allowed.length < MAX_ALLOWED) {
            allowed.push(chat);
            saveTg({ allowed: (t.allowed || []).concat({ id: chat, name: String(name).slice(0, 40) }), fails: 0 });
            getText(api("sendMessage", { chat_id: chat, text: "تم ربط جوالك برِواق ✓ أي رسالة ترسلها هنا تطلع على التلفزيون." })).catch(() => {});
          } else if (t.code) {
            fails++;
            saveTg({ fails });
          }
          continue;
        }
        if (Date.now() / 1000 - m.date > MAX_AGE_S) continue; // رسالة قديمة
        last = { name, text: m.text.slice(0, 280) };
      }
      try { localStorage.setItem(OFFSET_KEY, String(offset)); } catch (e) { /* بدون تخزين */ }
      if (last) show(last.name, last.text);
    } catch (e) {
      /* النت مقطوع أو المفتاح غلط: نحاول المرة الجاية */
    } finally { busy = false; }
  }

  window.PhoneMsg = {
    start() { setTimeout(poll, 3000); setInterval(poll, POLL_MS); document.addEventListener("visibilitychange", poll); },
    // زر من الريموت وهي ظاهرة: يقفلها (true = استخدمنا الزر)
    key(k) { if (box && box.classList.contains("on") && (k === "ok" || k === "back")) { hide(); return true; } return false; },
    _test: { tokenOk }
  };
})();
