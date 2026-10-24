/*
 * شاشة التوقف: تبني الهيكل مرة وحدة، وتحدّث الخانات كل دقيقة أو لما توصل بيانات جديدة.
 * أي خانة ما لها بيانات حية تختفي (البريف قسم ٢ قرار ٨).
 */
(function () {
  const OUNCE_G = 31.1035;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 86400000;

  // ===== حسابات التقويم =====
  // كم يوم لين تاريخ هجري معيّن (حسب أم القرى + تعديل المستخدم). أقصى سنة
  function daysToHijri(now, month, day) {
    const t = F.hijriParts(now);
    if (t.m === month && t.d === day) return { days: 0, year: t.y };
    for (let i = 1; i < 400; i++) {
      const h = F.hijriParts(new Date(now.getTime() + i * DAY));
      if (h.m === month && h.d === day) return { days: i, year: h.y };
    }
    return null;
  }

  // يوم ثابت في الشهر الميلادي مع قاعدة الإجازة. الإجازات الرسمية تغيّره بعد، فنكتب "متوقع"
  // الراتب (وزارة المالية): الجمعة ← الخميس، والسبت ← الأحد. حساب المواطن: يتقدم إذا وافق جمعة أو سبت
  function nextMonthly(now, dayOfMonth, rule) {
    const p = F.parts(now, { year: "numeric", month: "numeric", day: "numeric" });
    let y = +p.year, m = +p.month;
    const today = Date.UTC(+p.year, +p.month - 1, +p.day, 9);
    for (let k = 0; k < 3; k++) {
      let d = new Date(Date.UTC(y, m - 1, dayOfMonth, 9));
      const wd = d.getUTCDay(); // 5 جمعة، 6 سبت
      if (wd === 5) d = new Date(d.getTime() - DAY);
      if (wd === 6) d = new Date(d.getTime() + (rule === "salary" ? DAY : -2 * DAY));
      if (d.getTime() >= today) return { date: d, days: Math.round((d.getTime() - today) / DAY) };
      m++; if (m > 12) { m = 1; y++; }
    }
  }

  const fmtDate = (d) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(d);
  const daysWord = (n) => (n >= 3 && n <= 10 ? "أيام" : "يوم");
  const isSaudi = () => CONFIG.city && CONFIG.city.country === "SA";

  // اسم الفريق بالعربي إذا موجود في الجدول، وإلا الاسم الإنقليزي
  const teamName = (id, en) => (window.TEAMS_AR && TEAMS_AR[id]) || en;

  // لون فريق المستخدم: من TheSportsDB، وإلا من جدولنا، وإلا ذهبي.
  // الألوان الغامقة تتفتّح لين تنقرا على الخلفية الغامقة (تباين كافي)
  function readable(hex) {
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const lum = () => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    for (let k = 0; k < 12 && lum() < 0.3; k++) [r, g, b] = [r, g, b].map((v) => Math.round(v + (255 - v) * 0.15));
    return `rgb(${r},${g},${b})`;
  }
  function teamColor(id) {
    const c = DATA.teamColor(id) || (window.TEAM_COLORS && TEAM_COLORS[id]);
    return c ? readable(c) : "var(--gold)";
  }

  // ===== الهيكل =====
  function build(root) {
    root.innerHTML = `
      <div class="shade saver-shade"></div>
      <div class="saver-content soft-shadow">
        <div class="s-date">
          <div class="s-hijri" data-k="hijri"></div>
          <div class="s-greg" data-k="greg"></div>
          <div class="s-now" data-k="now"></div>
        </div>
        <div class="s-prices" data-k="prices"></div>
        <div class="s-clock-wrap">
          <div class="s-clock" data-k="clock"></div>
          <div class="s-clock-city" data-k="city"></div>
          <div class="s-chips" data-k="chips"></div>
        </div>
        <div class="s-side card" data-k="side">
          <div class="s-side-head">
            <div class="s-side-title">${icon("ball")}<span data-k="league"></span></div>
            <div class="s-dots" data-k="dots"></div>
          </div>
          <div class="s-table" data-k="table"></div>
          <div class="s-side-src" data-k="sideSrc"></div>
        </div>
        <div class="s-col">
          <div class="s-hadith card" data-k="hadith"></div>
          <div class="s-prayers card" data-k="prayers"></div>
          <div class="s-week card" data-k="week"></div>
        </div>
        <div class="s-ticker" data-k="ticker">
          <div class="s-ticker-label">الأخبار</div>
          <div class="s-ticker-track"><div class="s-ticker-move" data-k="news"></div></div>
        </div>
        <div class="s-bottom" data-k="bottom"></div>
      </div>
      <div class="adhan-glow"></div>
      <div class="adhan-alert">${icon("bell")}<span data-k="alertText"></span></div>
      <div class="credit" data-k="credit"></div>`;
    return root;
  }

  const $ = (root, k) => root.querySelector(`[data-k="${k}"]`);
  const show = (el, on) => { el.style.display = on ? "" : "none"; };

  // ===== الخانات =====
  function renderClock(root, now) {
    const c = F.clock(now);
    const ds = (s) => [...s].map((ch) => `<span class="d">${ch}</span>`).join("");
    // ص/م على يسار الوقت (مثل ما ينقرا "٢:٣٥ م" بالعربي)
    $(root, "clock").innerHTML = `<span class="ampm">${c.ampm}</span>${ds(c.h)}<span class="d colon">:</span>${ds(c.m)}`;
    $(root, "city").textContent = CONFIG.city ? "بتوقيت " + CONFIG.city.name : "";
    $(root, "hijri").textContent = F.hijri(now);
    $(root, "greg").textContent = F.gregorian(now) + " م";
  }

  function renderWeather(root) {
    const w = DATA.weather(), days = DATA.forecast();
    const nowEl = $(root, "now");
    if (w) {
      const g = F.weather(w.data.now.code);
      const today = days && days[0];
      nowEl.innerHTML = `${icon(g[1])}<div class="s-now-temp">${F.num(w.data.now.temp)}°</div>
        <div class="s-now-desc">${g[0]}${today ? `<small>العظمى ${F.num(today.max)}° · الصغرى ${F.num(today.min)}°</small>` : ""}</div>`;
    }
    show(nowEl, !!w);
    const week = $(root, "week");
    if (days) {
      week.innerHTML = days.map((d, i) => {
        const g = F.weather(d.code);
        const n = i === 0 ? "اليوم" : i === 1 ? "بكرة" : F.weekday(d.date);
        return `<div class="s-day"><div class="n">${n}</div>${icon(g[1])}<div class="t">${F.num(d.max)}° <span>${F.num(d.min)}°</span></div></div>`;
      }).join("");
    }
    show(week, !!days);
  }

  function renderChips(root, now) {
    const chips = [];
    const dust = DATA.dust();
    // ٣٠٠ ميكروغرام/م³ وفوق = غبار عالي جداً (حد متحفظ، ما نخوّف الناس على الفاضي)
    if (dust !== null && dust >= 300) chips.push(`${icon("fog")}تنبيه غبار`);
    if (CONFIG.reminders !== false) {
      const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(F.parts(now, { weekday: "short" }).weekday);
      const tomorrowH = F.hijriParts(new Date(now.getTime() + DAY));
      if (wd === 5) chips.push(`${icon("crescent")}يوم الجمعة · سورة الكهف`);
      if (wd === 0 || wd === 3) chips.push(`${icon("crescent")}بكرة ${wd === 0 ? "الاثنين" : "الخميس"} · صيام`);
      if ([13, 14, 15].includes(tomorrowH.d) && tomorrowH.m !== 9) chips.push(`${icon("crescent")}بكرة من الأيام البيض`);
    }
    $(root, "chips").innerHTML = chips.map((c) => `<span class="s-chip">${c}</span>`).join("");
  }

  function renderPrices(root) {
    const m = DATA.metals(), fx = DATA.fx();
    const items = [];
    const sar = fx && fx.data.rates.SAR;
    if (m && m.data.XAU) items.push(["الذهب · أونصة", `<span class="ltr">$${F.num(m.data.XAU.price, 0)}</span>`, sar ? `الغرام ٢٤: ${F.num((m.data.XAU.price / OUNCE_G) * sar, 1)} ر.س` : ""]);
    if (m && m.data.XAG) items.push(["الفضة · أونصة", `<span class="ltr">$${F.num(m.data.XAG.price, 2)}</span>`, sar ? `الغرام: ${F.num((m.data.XAG.price / OUNCE_G) * sar, 2)} ر.س` : ""]);
    if (fx && fx.data.rates.EUR && sar) items.push(["اليورو", `${F.num(sar / fx.data.rates.EUR, 3)} <small style="font-size:20px;font-weight:400">ر.س</small>`, `الدولار: ${F.num(sar, 2)} ر.س`]);
    if (m && m.data.BTC) items.push(["بيتكوين", `<span class="ltr">$${F.num(m.data.BTC.price, 0)}</span>`, ""]);
    if (m && m.data.ETH) items.push(["إيثريوم", `<span class="ltr">$${F.num(m.data.ETH.price, 0)}</span>`, ""]);
    const el = $(root, "prices");
    const at = m ? new Date(m.at) : fx ? new Date(fx.at) : null;
    el.innerHTML = items.map((p) => `<div class="s-price"><div class="label">${p[0]}</div><div class="s-price-val">${p[1]}</div><div class="s-price-sub">${p[2]}</div></div>`).join("") +
      (at ? `<div class="s-prices-time">آخر تحديث ${F.clock(at).h}:${F.clock(at).m} ${F.clock(at).ampm}${fx ? ` · العملات يومية` : ""}</div>` : "");
    show(el, items.length > 0);
  }

  let leagueIdx = 0;
  const LEAGUE_AR = { 4668: "دوري روشن", 4328: "الدوري الإنقليزي", 4335: "الدوري الإسباني", 4332: "الدوري الإيطالي", 4331: "الدوري الألماني", 4334: "الدوري الفرنسي" };
  function availableLeagues() { return CONFIG.leagues.filter((id) => DATA.table(id)); }

  function renderLeague(root, animate) {
    const side = $(root, "side");
    const ids = CONFIG.sideCard === "leagues" ? availableLeagues() : [];
    show(side, ids.length > 0);
    if (!ids.length) return;
    leagueIdx %= ids.length;
    const id = ids[leagueIdx], t = DATA.table(id);
    const mine = new Set(CONFIG.teams.map((x) => String(x.id)));
    const table = $(root, "table");
    const paint = () => {
      $(root, "league").textContent = LEAGUE_AR[id] || "الدوري";
      table.innerHTML = `<div class="s-row s-row-head"><span></span><span>الفريق</span><span class="pl">لعب</span><span class="pt">نقاط</span></div>` +
        t.data.map((r, i) => `<div class="s-row ${mine.has(String(r.id)) ? "mine" : ""}"${mine.has(String(r.id)) ? ` style="color:${teamColor(r.id)}"` : ""}><span class="rk">${F.digits(i + 1)}</span><span class="clip"><bdi>${esc(teamName(r.id, r.name))}</bdi></span><span class="pl">${F.digits(r.played)}</span><span class="pt">${F.digits(r.pts)}</span></div>`).join("");
      $(root, "dots").innerHTML = ids.map((x, i) => `<i class="${i === leagueIdx ? "on" : ""}"></i>`).join("");
      const at = new Date(t.at);
      $(root, "sideSrc").textContent = `البيانات: TheSportsDB · ${F.clock(at).h}:${F.clock(at).m} ${F.clock(at).ampm}`;
      table.classList.remove("fade");
    };
    if (!animate) return paint();
    table.classList.add("fade");
    setTimeout(paint, 500);
  }

  function renderHadith(root) {
    // حديث اليوم يطلع بس من الملف المراجَع شرعياً (المرحلة ٤). لين ذاك الحين: مخفي
    const el = $(root, "hadith");
    const item = window.Content && Content.hadithOfDay(new Date());
    if (item) el.innerHTML = `<div class="s-card-title">حديث اليوم</div><p class="s-hadith-text">${esc(item.text)}</p><small>${esc(item.source)}</small>`;
    show(el, !!item);
  }

  function renderPrayers(root, now) {
    const el = $(root, "prayers");
    const np = Prayer.next(now);
    if (!np) {
      el.innerHTML = `<div class="s-setup">اختر مدينتك من الإعدادات عشان تطلع أوقات الصلاة</div>`;
      el.classList.add("empty");
      return null;
    }
    el.classList.remove("empty");
    el.innerHTML = np.today.map((p) => {
      const c = F.clock(p.at);
      const cls = p.id === np.p.id ? "next" : p.at <= now ? "past" : "";
      return `<div class="s-pr ${cls}"><div class="n">${p.name}</div><div class="t">${c.h}:${c.m}<small>${c.ampm}</small></div></div>`;
    }).join("");
    return np;
  }

  function cell(ic, label, main, sub) {
    return `<div class="s-cell"><div class="label">${icon(ic)}${label}</div><div class="s-cell-main">${main}</div><div class="s-cell-sub">${sub}</div></div>`;
  }

  function renderBottom(root, now, np) {
    const cells = [];
    if (np) {
      const c = F.clock(np.p.at);
      cells.push(cell("bell", "الصلاة القادمة", `${np.p.name} <small>${c.h}:${c.m} ${c.ampm}</small>`, "بعد " + F.duration(np.mins)));
    }
    // المناسبات: رمضان، وعرفة، وعاشوراء. نعرض الأقرب
    const h = F.hijriParts(now);
    if (h.m === 9 && np) {
      const today = Prayer.timesFor(now, 0);
      const maghrib = today.find((p) => p.id === "maghrib").at;
      if (now < maghrib) cells.push(cell("crescent", `رمضان · اليوم ${F.digits(h.d)}`, `الإفطار بعد ${F.duration((maghrib - now) / 60000)}`, "حسب تقويم أم القرى"));
      else { const fajr = Prayer.timesFor(now, 1)[0].at; cells.push(cell("crescent", `رمضان · اليوم ${F.digits(h.d)}`, `الإمساك بعد ${F.duration((fajr - now) / 60000)}`, "مع أذان الفجر")); }
    } else {
      const occ = [["رمضان", 9, 1], ["يوم عرفة", 12, 9], ["عاشوراء", 1, 10]]
        .map(([n, m, d]) => Object.assign({ n }, daysToHijri(now, m, d) || { days: 9999 }))
        .sort((a, b) => a.days - b.days)[0];
      if (occ && occ.days < 9999) cells.push(cell("crescent", occ.n + (occ.n === "رمضان" ? " " + F.digits(occ.year) : ""), occ.days === 0 ? "اليوم" : `باقي ${F.digits(occ.days)} <small>${daysWord(occ.days)}</small>`, "حسب تقويم أم القرى"));
    }
    // الراتب وحساب المواطن (السعودية بس): الأقرب منهم
    if (isSaudi() && CONFIG.showSalary) {
      const s = nextMonthly(now, 27, "salary"), ca = nextMonthly(now, 10, "citizen");
      const pick = ca.days < s.days ? ["حساب المواطن", ca] : ["الراتب", s];
      cells.push(cell("wallet", pick[0], pick[1].days === 0 ? "اليوم" : `باقي ${F.digits(pick[1].days)} <small>${daysWord(pick[1].days)}</small>`, fmtDate(pick[1].date) + " · متوقع"));
    }
    // مباراة الفريق: النتيجة تبقى ٢٤ ساعة بعد المباراة، وبعدها المباراة الجاية
    const team = CONFIG.teams[0], td = team && DATA.team(team.id);
    if (td) {
      const L = td.data.last, N = td.data.next;
      const lastAt = L && L.at && new Date(L.at);
      // <bdi> عشان اسم إنقليزي جنب اسم عربي ما يقلب الترتيب
      const mineIds = new Set(CONFIG.teams.map((x) => String(x.id)));
      const nm = (e, side) => {
        const id = String(side === "h" ? e.homeId : e.awayId);
        const style = mineIds.has(id) ? ` style="color:${teamColor(id)}"` : "";
        return `<bdi${style}>${esc(teamName(id, side === "h" ? e.home : e.away))}</bdi>`;
      };
      if (L && lastAt && now - lastAt < DAY && L.hs !== null && L.hs !== undefined && L.hs !== "") {
        cells.push(cell("ball", `نتيجة ${esc(teamName(team.id, team.name))}`, `${nm(L, "h")} <small>${F.digits(L.hs)} - ${F.digits(L.as)}</small> ${nm(L, "a")}`, L.status === "FT" ? "انتهت" : "جارية"));
      } else if (N && N.at) {
        const at = new Date(N.at);
        const when = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { timeZone: F.TZ, weekday: "long", hour: "numeric", minute: "2-digit" }).format(at);
        cells.push(cell("ball", `مباراة ${esc(teamName(team.id, team.name))} الجاية`, `${nm(N, "h")} <small>×</small> ${nm(N, "a")}`, when));
      }
    }
    const el = $(root, "bottom");
    el.style.gridTemplateColumns = `repeat(${Math.max(cells.length, 1)}, 1fr)`;
    el.innerHTML = cells.join("");
  }

  function renderNews(root) {
    const n = DATA.news();
    const el = $(root, "ticker");
    show(el, !!n);
    if (!n) return;
    const items = n.data.map((x) => `<span>${esc(x.title)}${x.source ? ` <em class="s-src">· ${esc(x.source)}</em>` : ""}</span>`).join("");
    const move = $(root, "news");
    if (move.dataset.sig !== String(n.at)) { move.innerHTML = items + items; move.dataset.sig = String(n.at); }
  }

  function renderCredit(root) {
    const parts = ["الخلفية: رسم رواق"];
    if (DATA.weather()) parts.push("الطقس: Open-Meteo.com");
    if (DATA.metals()) parts.push("الأسعار: gold-api.com");
    if (DATA.fx()) parts.push("العملات: Frankfurter");
    $(root, "credit").textContent = parts.join(" · ");
  }

  // حماية من حرق الشاشة: نحرك المحتوى كم بكسل كل ٤ دقايق، بتسلسل ثابت
  const SHIFTS = [[0, 0], [6, -4], [-5, 5], [4, 6], [-6, -3], [3, -6], [-3, 4]];
  let shiftIdx = 0;

  let root, lastMinute = -1, forceAlert = false;
  window.Saver = {
    init(el) {
      root = build(el);
      setInterval(() => { leagueIdx++; renderLeague(root, true); }, 8000);
      setInterval(() => {
        shiftIdx = (shiftIdx + 1) % SHIFTS.length;
        root.querySelector(".saver-content").style.transform = `translate(${SHIFTS[shiftIdx][0]}px, ${SHIFTS[shiftIdx][1]}px)`;
      }, 4 * 60 * 1000);
      DATA.onChange(() => this.tick(true));
      this.tick(true);
    },
    tick(force) {
      const now = new Date();
      const min = F.minutesOfDay(now);
      if (!force && min === lastMinute) return;
      lastMinute = min;
      renderClock(root, now);
      renderWeather(root);
      renderChips(root, now);
      renderPrices(root);
      renderLeague(root, false);
      renderHadith(root);
      const np = renderPrayers(root, now);
      renderBottom(root, now, np);
      renderNews(root);
      renderCredit(root);
      const limit = CONFIG.alertMinutes || 0;
      const alertOn = forceAlert || (np && limit > 0 && np.mins <= limit && np.mins > 0);
      document.getElementById("stage").classList.toggle("alert", !!alertOn && App.current === "saver");
      if (np) $(root, "alertText").textContent = `باقي ${F.duration(forceAlert ? limit || 10 : np.mins)} على أذان ${np.p.name}`;
    },
    setForceAlert(v) { forceAlert = v; this.tick(true); }
  };
})();
