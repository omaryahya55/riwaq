/*
 * الخلفية حسب وقت اليوم (فجر، نهار، عصر، مغرب، ليل):
 * - صور حقيقية (الافتراضي، من web/js/backgrounds.js)، وبالليل نرسم القمر فوقها
 * - أو رسمة (SVG): سماء وكثبان تتغير ألوانها، فيها شمس بالنهار وقمر بالليل (CONFIG.bgStyle = "drawn")
 * ما فيها صور ناس (البريف: الهدف).
 */
(function () {
  const P = {
    night:  { sky: ["#05070F", "#0B1226", "#1A2140"], glow: "#3A4A7A", glowA: 0.35, sun: null, moon: [1160, 150],
              dunes: ["#1B2340", "#141B33", "#0E1427", "#090E1C"], stars: 1, clouds: 0.06 },
    fajr:   { sky: ["#141836", "#3D3560", "#B87566"], glow: "#F0A07A", glowA: 0.55, sun: null, moon: null,
              dunes: ["#5A4560", "#3F3150", "#2A2140", "#1A1530"], stars: 0.35, clouds: 0.3 },
    day:    { sky: ["#3F6F99", "#8FB3C9", "#E6D3AE"], glow: "#FFF1D0", glowA: 0.6, sun: [1160, 170], moon: null,
              dunes: ["#D7B98A", "#C59E6B", "#A97F50", "#80603B"], stars: 0, clouds: 0.5 },
    asr:    { sky: ["#2A2140", "#8A4A48", "#EAA35A"], glow: "#FFC77A", glowA: 0.75, sun: [700, 610], moon: null,
              dunes: ["#B2714E", "#8E5440", "#663B33", "#3F2528"], stars: 0, clouds: 0.32 },
    dusk:   { sky: ["#0F1430", "#33284A", "#8C5762"], glow: "#D98B6E", glowA: 0.5, sun: null, moon: [1160, 160],
              dunes: ["#3A2E4A", "#2A2240", "#1C1832", "#121024"], stars: 0.6, clouds: 0.14 }
  };

  // كثبان بمنحنيات ناعمة. كل طبقة أقرب = أغمق وأوطى
  const DUNES = [
    "M0 760 C 220 700, 420 690, 640 735 S 1060 800, 1300 742 S 1720 690, 1920 730 L1920 1080 L0 1080Z",
    "M0 835 C 260 770, 520 760, 760 812 S 1180 880, 1440 820 S 1800 780, 1920 800 L1920 1080 L0 1080Z",
    "M0 915 C 300 850, 560 880, 820 905 S 1260 950, 1520 900 S 1820 870, 1920 885 L1920 1080 L0 1080Z",
    "M0 990 C 340 945, 700 975, 980 990 S 1500 1010, 1920 975 L1920 1080 L0 1080Z"
  ];

  function stars(density) {
    if (!density) return "";
    let seed = 7, out = "";
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.round(140 * density);
    for (let i = 0; i < n; i++) {
      const x = rnd() * 1920, y = rnd() * 620, r = rnd() < 0.08 ? 1.6 : 0.6 + rnd() * 0.7;
      out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`;
    }
    return out;
  }

  /*
   * غيوم ناعمة في طبقة لحالها فوق الرسمة (مو داخلها): الحركة تحرّك الطبقة بس، فما تنعاد رسمة الخلفية كاملة.
   * كل صف بعرض شاشتين يمشي ببطء ويرجع لنفس المكان بدون قفزة، ويتحدث مرة بالثانية (base.css) عشان يخف على التلفزيون.
   */
  function clouds(opacity) {
    if (!opacity) return "";
    const band = (y, s) => [[120, 0], [620, 40], [1100, -20], [1560, 30]]
      .map(([x, dy]) => `<g transform="translate(${x} ${y + dy}) scale(${s})"><ellipse cx="0" cy="0" rx="190" ry="34" fill="url(#cloudG)"/><ellipse cx="70" cy="-22" rx="120" ry="38" fill="url(#cloudG)"/><ellipse cx="-80" cy="-12" rx="100" ry="28" fill="url(#cloudG)"/></g>`).join("");
    const grad = `<defs><radialGradient id="cloudG"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
    const row = (y, s, cls) => `<div class="cloud ${cls}"><svg viewBox="0 0 3840 440" width="3840" height="440" xmlns="http://www.w3.org/2000/svg">${grad}${band(y, s)}<g transform="translate(1920 0)">${band(y, s)}</g></svg></div>`;
    return `<div class="cloud-layer" style="opacity:${opacity}">${row(190, 1.1, "c1")}${row(330, 0.8, "c2")}</div>`;
  }

  // صورة حقيقية للفترة (web/js/backgrounds.js)، وفوقها تظليل عشان الكلام ينقرا، والقمر بالليل
  function photo(el, period) {
    const b = window.BACKGROUNDS && BACKGROUNDS[period];
    if (!b || !/^img\/bg\/[a-z]+\.jpg$/.test(b.src)) return false;
    const p = P[period] || P.night;
    const moon = period === "night" && p.moon
      ? `<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="moonGlow"><stop offset="0" stop-color="#C9D6FF" stop-opacity=".22"/><stop offset="1" stop-color="#C9D6FF" stop-opacity="0"/></radialGradient></defs><circle cx="${p.moon[0]}" cy="${p.moon[1]}" r="160" fill="url(#moonGlow)"/><path d="M${p.moon[0] + 22} ${p.moon[1] - 40} a44 44 0 1 0 22 78 a36 36 0 1 1 -22 -78z" fill="#F4EBD6" opacity=".92"/></svg>` : "";
    el.innerHTML = `<img class="bg-photo" src="${b.src}" alt=""><div class="bg-tint bg-${period}"></div>${moon}`;
    Scene.credit = b.credit;
    return true;
  }

  function render(el, period) {
    if (window.CONFIG && CONFIG.bgStyle !== "drawn" && photo(el, period)) return;
    Scene.credit = "";
    const p = P[period] || P.night;
    const sun = p.sun ? `<circle cx="${p.sun[0]}" cy="${p.sun[1]}" r="300" fill="url(#sunGlow)"/><circle cx="${p.sun[0]}" cy="${p.sun[1]}" r="46" fill="#FFF4DC" opacity=".95"/>` : "";
    const moon = p.moon ? `<circle cx="${p.moon[0]}" cy="${p.moon[1]}" r="160" fill="url(#moonGlow)"/><path d="M${p.moon[0] + 22} ${p.moon[1] - 40} a44 44 0 1 0 22 78 a36 36 0 1 1 -22 -78z" fill="#F4EBD6" opacity=".9"/>` : "";
    el.innerHTML = `
<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".55" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/>
    </linearGradient>
    <radialGradient id="horizon" cx=".4" cy=".72" r=".7">
      <stop offset="0" stop-color="${p.glow}" stop-opacity="${p.glowA}"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sunGlow"><stop offset="0" stop-color="#FFE7B0" stop-opacity=".55"/><stop offset="1" stop-color="#FFE7B0" stop-opacity="0"/></radialGradient>
    <radialGradient id="moonGlow"><stop offset="0" stop-color="#C9D6FF" stop-opacity=".18"/><stop offset="1" stop-color="#C9D6FF" stop-opacity="0"/></radialGradient>
    ${p.dunes.map((c, i) => `<linearGradient id="d${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${p.dunes[Math.min(i + 1, 3)]}"/></linearGradient>`).join("")}
  </defs>
  <rect width="1920" height="1080" fill="url(#sky)"/>
  <g>${stars(p.stars)}</g>
  <rect width="1920" height="1080" fill="url(#horizon)"/>
  ${sun}${moon}
  ${DUNES.map((d, i) => `<path d="${d}" fill="url(#d${i})"/>`).join("")}
</svg>${clouds(p.clouds)}`;
  }

  // وش الفترة الحين حسب أوقات الصلاة. m = دقايق كل وقت من بداية اليوم
  function periodAt(minNow, m) {
    if (minNow >= m.fajr - 20 && minNow < m.sunrise + 25) return "fajr";
    if (minNow >= m.sunrise + 25 && minNow < m.asr + 60) return "day";
    if (minNow >= m.asr + 60 && minNow < m.maghrib + 15) return "asr";
    if (minNow >= m.maghrib + 15 && minNow < m.isha + 30) return "dusk";
    return "night";
  }

  window.Scene = { render, periodAt, periods: Object.keys(P), credit: "" };
})();
