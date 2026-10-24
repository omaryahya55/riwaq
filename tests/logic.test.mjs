// اختبارات الحسابات المهمة. التشغيل: node --test tests/
// تحمّل ملفات الشاشة نفسها (web/js) في بيئة معزولة بدون متصفح، وتتأكد من نتائجها.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../web/", import.meta.url);

function load(files, config) {
  const ctx = {
    console, Intl, Date, Math, JSON, URLSearchParams, setTimeout, setInterval, clearTimeout,
    location: { search: "", hash: "" },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => null, querySelector: () => null },
    fetch: () => Promise.reject(new Error("no network in tests"))
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(readFileSync(new URL(f, ROOT), "utf8"), ctx, { filename: f });
  if (config) Object.assign(ctx.CONFIG, config);
  return ctx;
}

const RIYADH = { name: "الرياض", lat: 24.7136, lon: 46.6753, tz: "Asia/Riyadh", country: "SA" };

test("الأرقام العربية والفواصل", () => {
  const w = load(["js/config.js", "js/format.js"]);
  assert.equal(w.F.digits("12:05"), "١٢:٠٥");
  assert.equal(w.F.num(3996.9, 1), "٣٬٩٩٦٫٩");
  assert.equal(w.F.duration(39), "٣٩ دقيقة");
  assert.equal(w.F.duration(5), "٥ دقايق");
  assert.equal(w.F.duration(125), "٢ س ٥ د");
});

test("مواعيد الراتب تطابق جدول وزارة المالية 2026 (أيام الجمعة والسبت)", () => {
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/teams-ar.js", "js/prayer.js", "js/data.js", "js/content.js", "js/saver.js"], { city: RIYADH });
  const { nextMonthly } = w.Saver._test;
  const iso = (d) => d.toISOString().slice(0, 10);
  // من الجدول الرسمي (قسم ٣ب في البريف): فبراير ٢٦ (الجمعة←الخميس)، مارس ٢٦، يونيو ٢٨ (السبت←الأحد)، أكتوبر ٢٧، نوفمبر ٢٦، ديسمبر ٢٧
  const cases = [["2026-02-01", "2026-02-26"], ["2026-03-01", "2026-03-26"], ["2026-06-01", "2026-06-28"],
                 ["2026-10-24", "2026-10-27"], ["2026-11-01", "2026-11-26"], ["2026-12-01", "2026-12-27"]];
  for (const [from, want] of cases) {
    assert.equal(iso(nextMonthly(new Date(from + "T09:00:00+03:00"), 27, "salary").date), want, "from " + from);
  }
  // مايو ٢٠٢٦ صار ٢٤ بسبب العيد (إجازة رسمية): القاعدة ما تعرفها، وعشان كذا نكتب "متوقع"
  assert.equal(iso(nextMonthly(new Date("2026-05-01T09:00:00+03:00"), 27, "salary").date), "2026-05-27");
});

test("العد لرمضان ١٤٤٨ من ٢٤ أكتوبر ٢٠٢٦ = ١٠٧ يوم (أم القرى)", () => {
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/teams-ar.js", "js/prayer.js", "js/data.js", "js/content.js", "js/saver.js"], { city: RIYADH });
  const r = w.Saver._test.daysToHijri(new Date("2026-10-24T09:00:00+03:00"), 9, 1);
  assert.equal(r.days, 107);
  assert.equal(r.year, 1448);
});

test("تعديل الهجري ±١ يوم يغيّر التاريخ", () => {
  const w = load(["js/config.js", "js/format.js"], { city: RIYADH, hijriOffset: 1 });
  const base = load(["js/config.js", "js/format.js"], { city: RIYADH });
  const d = new Date("2026-10-24T09:00:00+03:00");
  assert.equal(w.F.hijriParts(d).d, base.F.hijriParts(d).d + 1);
});

test("أوقات الصلاة للرياض (أم القرى) تطابق Aladhan لين دقيقة", () => {
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/prayer.js"], { city: RIYADH });
  const t = w.Prayer.timesFor(new Date("2026-10-24T09:00:00+03:00"), 0);
  const hm = (d) => d.toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });
  const got = Object.fromEntries(t.map((p) => [p.id, hm(p.at)]));
  // Aladhan method=4 لنفس اليوم والمكان (سحبناه 2026-10-24)
  const want = { fajr: "04:37", sunrise: "05:56", dhuhr: "11:38", asr: "14:54", maghrib: "17:19", isha: "18:49" };
  const mins = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
  for (const k of Object.keys(want)) assert.ok(Math.abs(mins(got[k]) - mins(want[k])) <= 1, `${k}: ${got[k]} vs ${want[k]}`);
});

test("العشاء في رمضان (أم القرى) = ١٢٠ دقيقة بعد المغرب", () => {
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/prayer.js"], { city: RIYADH });
  const t = w.Prayer.timesFor(new Date("2027-02-20T09:00:00+03:00"), 0); // منتصف رمضان ١٤٤٨
  const at = (id) => t.find((p) => p.id === id).at;
  assert.equal(Math.round((at("isha") - at("maghrib")) / 60000), 120);
});

test("الطريقة حسب الدولة", () => {
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/prayer.js"], { city: { ...RIYADH, country: "EG" } });
  assert.equal(w.Prayer.methodId(), "Egyptian");
  w.CONFIG.city.country = "FR";
  assert.equal(w.Prayer.methodId(), "MuslimWorldLeague");
  w.CONFIG.method = "UmmAlQura";
  assert.equal(w.Prayer.methodId(), "UmmAlQura");
});

test("لون الفريق الغامق يتفتّح لين ينقرا", () => {
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/teams-ar.js", "js/prayer.js", "js/data.js", "js/content.js", "js/saver.js"], { city: RIYADH });
  const out = w.Saver._test.readable("#081c4e");
  const [r, g, b] = out.match(/\d+/g).map(Number);
  assert.ok(r + g + b > 300, out);
  assert.equal(w.Saver._test.readable("#fedc00"), "rgb(254,220,0)");
});

test("التقويم: موعد عادي، ويوم كامل، ومتكرر أسبوعي، ومنطقة زمنية", () => {
  const w = load(["js/config.js", "js/format.js", "js/calendar.js"], { city: RIYADH });
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "SUMMARY:اجتماع العائلة", "DTSTART:20261025T170000Z", "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY:يوم كامل", "DTSTART;VALUE=DATE:20261026", "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY:درس الأحد والثلاثاء", "DTSTART;TZID=Asia/Riyadh:20261025T200000", "RRULE:FREQ=WEEKLY;BYDAY=SU,TU;COUNT=4", "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY:ملغي", "DTSTART:20261025T100000Z", "STATUS:CANCELLED", "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY:نص\, فيه فاصلة", "DTSTART:20261027T060000Z", "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  const now = new Date("2026-10-25T09:00:00+03:00");
  const list = w.ICal.upcoming(ics, "Asia/Riyadh", now, 14, 20);
  const titles = list.map((e) => e.title);
  assert.ok(!titles.includes("ملغي"));
  assert.ok(titles.includes("نص, فيه فاصلة"));
  const lessons = list.filter((e) => e.title.startsWith("درس"));
  assert.equal(lessons.length, 4, "COUNT=4");
  // أول درس: الأحد ٨ مساءً بتوقيت الرياض = ١٧:٠٠ UTC
  assert.equal(new Date(lessons[0].at).toISOString(), "2026-10-25T17:00:00.000Z");
  assert.equal(new Date(lessons[1].at).getUTCDay(), 2, "الثلاثاء");
  const allDay = list.find((e) => e.title === "يوم كامل");
  assert.ok(allDay.allDay);
  // مرتبة بالوقت
  for (let i = 1; i < list.length; i++) assert.ok(list[i].at >= list[i - 1].at);
});
