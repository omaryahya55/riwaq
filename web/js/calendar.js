/*
 * مواعيد تقويم قوقل (أو أي تقويم iCal) عن طريق "العنوان السري" بدون تسجيل دخول (البريف قسم ٣د).
 * الرابط سرّي: ينحفظ على التلفزيون بس، وما يمر على السيرفر الوسيط أبداً، وما ينكتب في أي سجل.
 * يدعم المواعيد المتكررة البسيطة (يومي، أسبوعي بأيام محددة، شهري، سنوي) مع INTERVAL و COUNT و UNTIL.
 */
(function () {
  const DAY = 86400000;
  const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  // سطور iCal الطويلة تنقسم، والسطر اللي يبدأ بمسافة تكملة للي قبله
  function unfold(text) {
    return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  }

  const unescape = (s) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

  // الوقت في منطقة زمنية معيّنة → UTC
  function zoned(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    try {
      const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
      const p = {}; f.formatToParts(new Date(guess)).forEach((x) => (p[x.type] = +x.value));
      const asLocal = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
      return new Date(guess - (asLocal - guess));
    } catch (e) { return new Date(guess); }
  }

  // DTSTART بأشكاله: ...Z (UTC) أو TZID=... أو VALUE=DATE (يوم كامل)
  function parseDate(params, value, fallbackTz) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (!h) return { at: zoned(+y, +mo, +d, 0, 0, 0, fallbackTz), allDay: true };
    if (z) return { at: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
    const tz = (params.match(/TZID=([^;:]+)/) || [])[1] || fallbackTz;
    return { at: zoned(+y, +mo, +d, +h, +mi, +s, tz), allDay: false };
  }

  function parse(text, tz) {
    const events = [];
    let ev = null;
    for (const line of unfold(text)) {
      if (line === "BEGIN:VEVENT") { ev = {}; continue; }
      if (line === "END:VEVENT") { if (ev && ev.start && ev.title) events.push(ev); ev = null; continue; }
      if (!ev) continue;
      const i = line.indexOf(":");
      if (i < 0) continue;
      const head = line.slice(0, i), value = line.slice(i + 1);
      const name = head.split(";")[0].toUpperCase();
      if (name === "SUMMARY") ev.title = unescape(value).slice(0, 120);
      else if (name === "DTSTART") Object.assign(ev, (() => { const r = parseDate(head, value, tz); return r ? { start: r.at, allDay: r.allDay } : {}; })());
      else if (name === "RRULE") ev.rrule = Object.fromEntries(value.split(";").map((kv) => kv.split("=")));
      else if (name === "STATUS" && value === "CANCELLED") ev.cancelled = true;
    }
    return events.filter((e) => !e.cancelled);
  }

  // كل مرات الموعد بين from و to (المتكرر يتوسع، بحد أقصى)
  function occurrences(ev, from, to) {
    if (!ev.rrule) return ev.start >= from && ev.start < to ? [ev.start] : [];
    const r = ev.rrule, freq = r.FREQ, interval = Math.max(1, +r.INTERVAL || 1);
    const count = +r.COUNT || Infinity;
    const until = r.UNTIL ? (parseDate("", r.UNTIL, "UTC") || {}).at : null;
    const days = r.BYDAY ? r.BYDAY.split(",").map((x) => WD[x.slice(-2)]).filter((x) => x !== undefined) : null;
    const out = [];
    let n = 0;
    for (let k = 0; k < 800 && n < count; k++) {
      let base;
      const s = ev.start;
      if (freq === "DAILY") base = [new Date(s.getTime() + k * interval * DAY)];
      else if (freq === "WEEKLY") {
        const weekStart = new Date(s.getTime() + k * interval * 7 * DAY);
        base = (days || [s.getUTCDay()]).map((wd) => new Date(weekStart.getTime() + ((wd - s.getUTCDay() + 7) % 7) * DAY)).sort((a, b) => a - b);
      } else if (freq === "MONTHLY") { const d = new Date(s); d.setUTCMonth(s.getUTCMonth() + k * interval); base = [d]; }
      else if (freq === "YEARLY") { const d = new Date(s); d.setUTCFullYear(s.getUTCFullYear() + k * interval); base = [d]; }
      else return ev.start >= from && ev.start < to ? [ev.start] : [];
      for (const d of base) {
        if (d < s) continue;
        if (until && d > until) return out;
        if (n >= count) return out;
        n++;
        if (d >= to) return out;
        if (d >= from) out.push(d);
      }
    }
    return out;
  }

  /** المواعيد الجاية خلال days يوم، مرتبة، أقصى max */
  function upcoming(text, tz, now, days, max) {
    const to = new Date(now.getTime() + days * DAY);
    const list = [];
    for (const ev of parse(text, tz)) {
      // موعد اليوم الكامل يبقى ظاهر طول يومه
      const from = ev.allDay ? new Date(now.getTime() - DAY) : now;
      for (const at of occurrences(ev, from, to)) list.push({ title: ev.title, at: at.getTime(), allDay: !!ev.allDay });
    }
    return list.sort((a, b) => a.at - b.at).slice(0, max || 5);
  }

  window.ICal = { parse, upcoming, occurrences, zoned };
})();
