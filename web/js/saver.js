/* شاشة التوقف: تبني الخانات مرة وحدة، وبعدين تحدّث الساعة والعدادات كل دقيقة بس (خفيف على التلفزيون). */
(function () {
  const D = window.DEMO;
  const OUNCE_G = 31.1035;

  function prayerMinutes(p) { const [h, m] = p.time.split(":").map(Number); return h * 60 + m; }

  // الصلاة الجاية (بدون الشروق). بعد العشاء = فجر بكرة
  function nextPrayer(minNow) {
    const list = D.prayers.filter((p) => !p.notPrayer);
    for (const p of list) if (prayerMinutes(p) > minNow) return { p, mins: prayerMinutes(p) - minNow };
    return { p: list[0], mins: prayerMinutes(list[0]) + 1440 - minNow };
  }

  // أول رمضان الجاي حسب تقويم أم القرى (Intl). نمشي يوم يوم، أقصى سنة
  function daysToRamadan(now) {
    const today = F.hijriParts(now);
    if (today.m === 9) return { inRamadan: true, day: today.d };
    for (let i = 1; i < 400; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      const h = F.hijriParts(d);
      if (h.m === 9 && h.d === 1) return { days: i, year: h.y, date: d };
    }
    return null;
  }

  // الراتب: يوم ٢٧. الجمعة تتقدم للخميس، والسبت يتأخر للأحد (قاعدة وزارة المالية، البريف قسم ٣ب).
  // الإجازات الرسمية تغيّره بعد، فنكتب "متوقع" لين يجي جدول السنة الرسمي (المرحلة ٢)
  function nextSalary(now) {
    const p = F.parts(now, { year: "numeric", month: "numeric", day: "numeric" });
    let y = +p.year, m = +p.month;
    for (let k = 0; k < 3; k++) {
      let d = new Date(Date.UTC(y, m - 1, 27, 9));
      const wd = d.getUTCDay(); // 5 جمعة، 6 سبت
      if (wd === 5) d = new Date(d.getTime() - 86400000);
      if (wd === 6) d = new Date(d.getTime() + 86400000);
      const today = Date.UTC(+p.year, +p.month - 1, +p.day, 9);
      if (d.getTime() >= today) return { date: d, days: Math.round((d.getTime() - today) / 86400000) };
      m++; if (m > 12) { m = 1; y++; }
    }
  }

  function build(root) {
    const g = F.weather(D.weather.now.code);
    const today = D.weather.days[0];
    const sarPerUsd = D.prices.fx.SAR;
    const goldGram = (D.prices.XAU / OUNCE_G) * sarPerUsd;
    const silverGram = (D.prices.XAG / OUNCE_G) * sarPerUsd;
    const eurSar = sarPerUsd / D.prices.fx.EUR;

    const prices = [
      ["الذهب · أونصة", `<span class="ltr">$${F.num(D.prices.XAU, 0)}</span>`, `الغرام ٢٤: ${F.num(goldGram, 1)} ر.س`],
      ["الفضة · أونصة", `<span class="ltr">$${F.num(D.prices.XAG, 2)}</span>`, `الغرام: ${F.num(silverGram, 2)} ر.س`],
      ["اليورو", `${F.num(eurSar, 3)} <small style="font-size:20px;font-weight:400">ر.س</small>`, `الدولار: ${F.num(sarPerUsd, 2)} ر.س`],
      ["بيتكوين", `<span class="ltr">$${F.num(D.prices.BTC, 0)}</span>`, ""],
      ["إيثريوم", `<span class="ltr">$${F.num(D.prices.ETH, 0)}</span>`, ""]
    ];

    const days = D.weather.days.map((d, i) => {
      const w = F.weather(d.code);
      const n = i === 0 ? "اليوم" : i === 1 ? "بكرة" : F.weekday(d.date);
      return `<div class="s-day"><div class="n">${n}</div>${icon(w[1])}<div class="t">${F.num(d.max)}° <span>${F.num(d.min)}°</span></div></div>`;
    }).join("");

    const news = D.news.concat(D.news).concat(D.news).map((t) => `<span>${t}</span>`).join("");

    root.innerHTML = `
      <div class="shade saver-shade"></div>
      <div class="saver-content soft-shadow">
        <div class="s-date">
          <div class="s-hijri" data-k="hijri"></div>
          <div class="s-greg" data-k="greg"></div>
          <div class="s-now">${icon(g[1])}
            <div class="s-now-temp">${F.num(D.weather.now.temp)}°</div>
            <div class="s-now-desc">${g[0]}<small>العظمى ${F.num(today.max)}° · الصغرى ${F.num(today.min)}°</small></div>
          </div>
        </div>

        <div class="s-prices">
          ${prices.map((p) => `<div class="s-price"><div class="label">${p[0]}</div><div class="s-price-val">${p[1]}</div><div class="s-price-sub">${p[2]}</div></div>`).join("")}
          <div class="s-prices-time">نموذج · لقطة ${F.digits("24/10/2026")}</div>
        </div>

        <div class="s-clock-wrap">
          <div class="s-clock" data-k="clock"></div>
          <div class="s-clock-city">بتوقيت ${D.city.name}</div>
        </div>

        <div class="s-side card">
          <div class="s-side-head">
            <div class="s-side-title">${icon("ball")}<span data-k="league"></span></div>
            <div class="s-dots">${D.leagues.map(() => "<i></i>").join("")}</div>
          </div>
          <div class="s-table" data-k="table"></div>
          <div class="s-side-src">البيانات: TheSportsDB</div>
        </div>

        <div class="s-col">
          <div class="s-hadith card">
            <div class="s-card-title">حديث اليوم</div>
            <p>هنا يطلع حديث من صحيح البخاري أو مسلم، من الملف اللي يراجعه المختص الشرعي قبل النشر.</p>
            <small>المصدر يُكتب تحت كل حديث: الكتاب ورقم الحديث</small>
          </div>
          <div class="s-prayers card" data-k="prayers"></div>
          <div class="s-week card">${days}</div>
        </div>

        <div class="s-ticker">
          <div class="s-ticker-label">الأخبار</div>
          <div class="s-ticker-track"><div class="s-ticker-move">${news}</div></div>
        </div>

        <div class="s-bottom">
          <div class="s-cell"><div class="label">${icon("bell")}الصلاة القادمة</div><div class="s-cell-main" data-k="nextName"></div><div class="s-cell-sub" data-k="nextIn"></div></div>
          <div class="s-cell"><div class="label">${icon("crescent")}<span data-k="ramTitle">رمضان</span></div><div class="s-cell-main" data-k="ramMain"></div><div class="s-cell-sub">حسب تقويم أم القرى</div></div>
          <div class="s-cell"><div class="label">${icon("wallet")}الراتب</div><div class="s-cell-main" data-k="salMain"></div><div class="s-cell-sub" data-k="salSub"></div></div>
          <div class="s-cell"><div class="label">${icon("ball")}مباراة ${D.myTeam} الجاية</div><div class="s-cell-main">${D.nextMatch.home} <small>×</small> ${D.nextMatch.away}</div><div class="s-cell-sub" data-k="match"></div></div>
        </div>
      </div>
      <div class="adhan-glow"></div>
      <div class="adhan-alert">${icon("bell")}<span data-k="alertText"></span></div>
      <div class="credit">الخلفية: رسم رواق · الطقس: Open-Meteo.com · الأسعار: gold-api.com و Frankfurter</div>`;
    return root;
  }

  const $ = (root, k) => root.querySelector(`[data-k="${k}"]`);

  function renderClock(root, now) {
    const c = F.clock(now);
    const ds = (s) => [...s].map((ch) => `<span class="d">${ch}</span>`).join("");
    // ص/م على يسار الوقت (مثل ما ينقرا "٢:٣٥ م" بالعربي)
    $(root, "clock").innerHTML = `<span class="ampm">${c.ampm}</span>${ds(c.h)}<span class="d colon">:</span>${ds(c.m)}`;
  }

  function renderPrayers(root, minNow) {
    const np = nextPrayer(minNow);
    $(root, "prayers").innerHTML = D.prayers.map((p) => {
      const t = F.hhmm(p.time);
      const cls = p.id === np.p.id ? "next" : prayerMinutes(p) <= minNow ? "past" : "";
      return `<div class="s-pr ${cls}"><div class="n">${p.name}</div><div class="t">${t.text}<small>${t.ampm}</small></div></div>`;
    }).join("");
    const t = F.hhmm(np.p.time);
    $(root, "nextName").innerHTML = `${np.p.name} <small>${t.text} ${t.ampm}</small>`;
    $(root, "nextIn").textContent = "بعد " + F.duration(np.mins);
    return np;
  }

  function renderCountdowns(root, now) {
    const r = daysToRamadan(now);
    if (r && r.inRamadan) {
      $(root, "ramTitle").textContent = "رمضان";
      $(root, "ramMain").textContent = "اليوم " + F.digits(r.day);
    } else if (r) {
      $(root, "ramTitle").textContent = "رمضان " + F.digits(r.year);
      $(root, "ramMain").innerHTML = `باقي ${F.digits(r.days)} <small>يوم</small>`;
    }
    const s = nextSalary(now);
    $(root, "salMain").innerHTML = s.days === 0 ? "اليوم" : `باقي ${F.digits(s.days)} <small>${s.days >= 3 && s.days <= 10 ? "أيام" : "يوم"}</small>`;
    $(root, "salSub").textContent = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(s.date) + " · متوقع";
    const at = new Date(D.nextMatch.at);
    $(root, "match").textContent = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { timeZone: F.TZ, weekday: "long", hour: "numeric", minute: "2-digit" }).format(at) + " · " + D.nextMatch.league;
    $(root, "hijri").textContent = F.hijri(now);
    $(root, "greg").textContent = F.gregorian(now) + " م";
  }

  let leagueIdx = 0;
  function renderLeague(root, animate) {
    const L = D.leagues[leagueIdx];
    const table = $(root, "table");
    const paint = () => {
      $(root, "league").textContent = L.name;
      table.innerHTML = `<div class="s-row s-row-head"><span></span><span>الفريق</span><span class="pl">لعب</span><span class="pt">نقاط</span></div>` +
        L.table.map((r, i) => `<div class="s-row ${r[0] === D.myTeam ? "mine" : ""}"><span class="rk">${F.digits(i + 1)}</span><span class="clip">${r[0]}</span><span class="pl">${F.digits(r[2])}</span><span class="pt">${F.digits(r[1])}</span></div>`).join("");
      root.querySelectorAll(".s-dots i").forEach((d, i) => d.classList.toggle("on", i === leagueIdx));
      table.classList.remove("fade");
    };
    if (!animate) return paint();
    table.classList.add("fade");
    setTimeout(paint, 500);
  }

  // حماية من حرق الشاشة: نحرك المحتوى كم بكسل كل ٤ دقايق، بتسلسل ثابت
  const SHIFTS = [[0, 0], [6, -4], [-5, 5], [4, 6], [-6, -3], [3, -6], [-3, 4]];
  let shiftIdx = 0;

  let root, lastMinute = -1, forceAlert = false;
  window.Saver = {
    init(el) {
      root = build(el);
      renderLeague(root, false);
      setInterval(() => { leagueIdx = (leagueIdx + 1) % D.leagues.length; renderLeague(root, true); }, 8000);
      setInterval(() => {
        shiftIdx = (shiftIdx + 1) % SHIFTS.length;
        root.querySelector(".saver-content").style.transform = `translate(${SHIFTS[shiftIdx][0]}px, ${SHIFTS[shiftIdx][1]}px)`;
      }, 4 * 60 * 1000);
      this.tick(true);
    },
    tick(force) {
      const now = new Date();
      const min = F.minutesOfDay(now);
      if (!force && min === lastMinute) return;
      lastMinute = min;
      renderClock(root, now);
      const np = renderPrayers(root, min);
      renderCountdowns(root, now);
      // التنبيه قبل الأذان بـ ١٠ دقايق (قابلة للتعديل في الإعدادات لاحقاً)
      const alertOn = forceAlert || (np.mins <= 10 && np.mins > 0);
      document.getElementById("stage").classList.toggle("alert", alertOn && App.current === "saver");
      $(root, "alertText").textContent = `باقي ${F.duration(forceAlert ? 10 : np.mins)} على أذان ${np.p.name}`;
    },
    setForceAlert(v) { forceAlert = v; this.tick(true); },
    nextPrayer
  };
})();
