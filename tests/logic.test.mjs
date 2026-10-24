// اختبارات الحسابات المهمة. التشغيل: node --test tests/
// تحمّل ملفات الشاشة نفسها (web/js) في بيئة معزولة بدون متصفح، وتتأكد من نتائجها.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../web/", import.meta.url);

function load(files, config, extra) {
  const ctx = {
    console, Intl, Date, Math, JSON, URLSearchParams, setTimeout, setInterval, clearTimeout,
    location: { search: "", hash: "" },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => null, querySelector: () => null },
    fetch: () => Promise.reject(new Error("no network in tests"))
  };
  Object.assign(ctx, extra || {});
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

test("توزيع الأذكار والأحاديث على أوقاتها (حصن المسلم + الموسوعة)", async () => {
  const json = JSON.parse(readFileSync(new URL("content/approved.json", ROOT), "utf8"));
  const fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(json) });
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/prayer.js", "js/content.js"], null, { fetch });
  Object.assign(w.CONFIG, { city: RIYADH });
  await new Promise((r) => setTimeout(r, 20));
  const at = (s) => new Date(s + "+03:00");
  const ctx = (s) => w.Content.current(at(s)).item.context;
  const wins = (s) => w.Content._test.windows(at(s)).flatMap((x) => x.ctx);
  // الإثنين ٢٦ أكتوبر ٢٠٢٦ في الرياض: الظهر ١١:٣٨ تقريباً، المغرب ١٧:١٨
  assert.equal(ctx("2026-10-26T11:40:00"), "adhan");
  assert.ok(["mosque", "prayer"].includes(ctx("2026-10-26T11:50:00")));
  assert.equal(ctx("2026-10-26T12:15:00"), "afterPrayer");
  assert.ok(wins("2026-10-26T13:30:00").includes("meal"), "الغدا");
  assert.ok(wins("2026-10-26T20:30:00").includes("meal"), "العشا");
  assert.ok(w.Content._test.fastingDay(at("2026-10-26T10:00:00")), "الإثنين يوم صيام");
  assert.ok(["iftar", "fasting"].includes(ctx("2026-10-26T17:10:00")), "قبل المغرب في يوم صيام");
  assert.ok(wins("2026-10-26T23:30:00").includes("sleep"));
  // بدون وقت خاص: حديث اليوم أو فضل الصحابة أو دعاء اليوم، وكلها عليها مرجع
  const c = w.Content.current(at("2026-10-27T10:00:00"));
  assert.ok(c && c.title && c.item.source);
  // حصن المسلم: العنوان عنوان الباب، وتحته التخريج
  const hisn = json.items.find((x) => x.sourceId === "hisn-1");
  assert.equal(w.Content.credit(hisn, true).reference, hisn.reference);
  assert.ok(hisn.title.length > 3);
  // من القرآن الكريم: مقاطع كاملة من Tanzil، ومعها اسم السورة ورابط التحقق
  const q = json.items.filter((x) => x.type === "quran");
  assert.ok(q.length >= 20 && q.every((x) => x.source.startsWith("سورة") && x.verifyUrl.startsWith("https://tanzil.net/")));
  assert.ok(w.Content.today(at("2026-10-27T10:00:00")).some((x) => x.type === "quran"));
});

test("رسالة الجوال: مفتاح البوت لازم يكون بالشكل الصحيح", () => {
  const w = load(["js/config.js", "js/messages.js"]);
  assert.ok(w.PhoneMsg._test.tokenOk("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ"));
  assert.ok(!w.PhoneMsg._test.tokenOk("123:abc"));
  assert.ok(!w.PhoneMsg._test.tokenOk("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ/../x"));
});

test("راجع محفوظك وذكر الوقت: المقاطع آيات كاملة بالترتيب، والكهف والملك والأذكار في أوقاتها", async () => {
  const quran = JSON.parse(readFileSync(new URL("content/quran.json", ROOT), "utf8"));
  const json = JSON.parse(readFileSync(new URL("content/approved.json", ROOT), "utf8"));
  const fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(String(u).includes("quran.json") ? quran : json) });
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/prayer.js", "js/content.js", "js/quran-meta.js", "js/quran.js"], null, { fetch });
  Object.assign(w.CONFIG, { city: RIYADH, hifz: [67, 112] });
  w.QuranTools._test.setData(quran);
  await new Promise((r) => setTimeout(r, 20));
  const at = (s) => new Date(s + "+03:00");
  // المقاطع: من الملك والإخلاص بس، وكل مقطع يغطي آيات متتالية بدون فراغ
  const ch = w.QuranTools._test.chunks();
  assert.ok(ch.every(([s]) => s === 67 || s === 112));
  const mulk = ch.filter(([s]) => s === 67);
  assert.equal(mulk[0][1], 1); assert.equal(mulk[mulk.length - 1][2], 30);
  for (let i = 1; i < mulk.length; i++) assert.equal(mulk[i][1], mulk[i - 1][2] + 1);
  assert.equal(w.QuranTools.review(at("2026-10-24T10:00:00"), 0).title, "راجع محفوظك");
  const ids = (s) => w.Content.timed(at(s)).map((x) => x.id).join(",");
  // الجمعة ٣٠ أكتوبر ٢٠٢٦ في الرياض: العصر ٢:٥٢ تقريباً، المغرب ٥:١٦
  assert.equal(ids("2026-10-30T09:00:00"), "morning");          // بعد الفجر لين الظهر
  assert.equal(ids("2026-10-30T13:00:00"), "kahf");             // الكهف ١٠ الصبح ← العصر
  assert.equal(ids("2026-10-30T15:30:00"), "maathur,evening");  // بعد العصر: أدعية مأثورة وأذكار المساء
  assert.equal(ids("2026-10-27T23:30:00"), "mulk");             // الملك بعد العشاء
  assert.equal(ids("2026-10-28T00:30:00"), "mulk");             // لين ١ بالليل
  assert.equal(ids("2026-10-28T01:30:00"), "");
  const k = w.Content.timed(at("2026-10-30T13:00:00"))[0].items[0];
  assert.ok(k.source === "سورة الكهف" && k.text.includes("﴿١١٠﴾"), "الكهف كاملة");
});

test("صمت له معنى: من دقيقة قبل الأذان لين ربع ساعة بعد الإقامة", async () => {
  const w = load(["vendor/adhan/adhan.umd.min.js", "js/config.js", "js/format.js", "js/prayer.js", "js/content.js"]);
  Object.assign(w.CONFIG, { city: RIYADH });
  const at = (s) => new Date(s + "+03:00");
  assert.equal(w.Content.prayerPhase(at("2026-10-26T11:45:00")).before, true);   // الظهر ١١:٣٨، الإقامة ١١:٥٨
  assert.equal(w.Content.prayerPhase(at("2026-10-26T12:05:00")).before, false);
  assert.equal(w.Content.prayerPhase(at("2026-10-26T12:20:00")), null);
});

test("فحص الإعدادات: القيم الغلط ترجع للافتراضي وما تطيح الشاشة", () => {
  const w = load(["js/config.js"]);
  const s = w.Config.sanitize({
    city: { name: "<img src=x>", lat: 24.7, lon: 46.7, tz: "Not/AZone", country: "SA" },
    method: "evil", hijriOffset: 9, alertMinutes: -5,
    teams: [{ id: "133604", name: "x" }, { id: "1;alert(1)", name: "y" }],
    newsFeeds: ["http://a.com/rss", "https://b.com/rss", "javascript:alert(1)"],
    icalUrl: "https://x.com/a.ics\"><script>",
    lock: { pin: "12a4", apps: ["com.ok.app", "bad app"] },
    hifz: [1, 200, "x", 67],
    telegram: { token: "x", code: "123", allowed: [{ id: "12345", name: "أبو" }, { id: "abc" }] },
    contentFile: "../../etc/passwd"
  });
  assert.equal(s.city, null, "منطقة زمنية مو موجودة = بدون مدينة");
  assert.equal(s.method, "auto");
  assert.equal(s.hijriOffset, 0);
  assert.equal(s.alertMinutes, 10);
  assert.equal(JSON.stringify(s.teams.map((t) => t.id)), '["133604"]');
  assert.equal(JSON.stringify(s.newsFeeds), '["https://b.com/rss"]');
  assert.equal(s.icalUrl, "");
  assert.equal(s.lock.pin, "");
  assert.equal(JSON.stringify(s.lock.apps), '["com.ok.app"]');
  assert.equal(JSON.stringify(s.hifz), "[1,67]");
  assert.equal(s.telegram.token, ""); assert.equal(s.telegram.allowed.length, 1);
  assert.equal(s.contentFile, undefined);
  const good = w.Config.sanitize({ city: { name: "الرياض", lat: 24.7, lon: 46.7, tz: "Asia/Riyadh", country: "SA" } });
  assert.equal(good.city.tz, "Asia/Riyadh");
});
