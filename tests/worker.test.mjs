// اختبار السيرفر الوسيط (worker/) بدون نشر: نحاكي fetch والتخزين ونتأكد من القواعد.
import { test } from "node:test";
import assert from "node:assert/strict";

const calls = [];
const store = new Map();
globalThis.caches = { default: {
  async match(req) { const r = store.get(req.url); return r ? r.clone() : undefined; },
  async put(req, res) { store.set(req.url, res); }
} };
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).includes("/feed")) return new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>', { status: 200, headers: { "Content-Type": "application/rss+xml" } });
  if (String(url).includes("/page")) return new Response("<html><script>alert(1)</script></html>", { status: 200, headers: { "Content-Type": "text/html" } });
  return new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } });
};

const worker = (await import("../worker/src/index.js")).default;
const ctx = { waitUntil: (p) => p };
const env = { SPORTS_KEY: "SECRET123" };
const req = (path, origin = "https://appassets.androidplatform.net") => new Request("https://proxy.example" + path, { headers: { Origin: origin } });

test("الطقس: يقرّب الإحداثيات ويخزن، والطلب الثاني من التخزين", async () => {
  calls.length = 0;
  const r1 = await worker.fetch(req("/weather?latitude=24.71361&longitude=46.67531&current=temperature_2m"), env, ctx);
  assert.equal(r1.status, 200);
  assert.match(calls[0], /latitude=24\.71&longitude=46\.68/);
  await worker.fetch(req("/weather?latitude=24.7139&longitude=46.6762&current=temperature_2m"), env, ctx);
  assert.equal(calls.length, 1, "نفس المدينة = طلب واحد للمصدر");
  assert.equal(r1.headers.get("Access-Control-Allow-Origin"), "https://appassets.androidplatform.net");
});

test("إحداثيات غلط ترجع 400", async () => {
  const r = await worker.fetch(req("/weather?latitude=999&longitude=0"), env, ctx);
  assert.equal(r.status, 400);
});

test("الدوريات: المفتاح من الأسرار، ونقاط محددة بس", async () => {
  calls.length = 0;
  const ok = await worker.fetch(req("/sports/lookuptable.php?l=4668&s=2026-2027"), env, ctx);
  assert.equal(ok.status, 200);
  assert.match(calls[0], /\/json\/SECRET123\/lookuptable\.php\?l=4668&s=2026-2027$/);
  const bad = await worker.fetch(req("/sports/searchplayers.php?p=x"), env, ctx);
  assert.equal(bad.status, 404);
  calls.length = 0;
  await worker.fetch(req("/sports/eventsnext.php?id=136013;DROP"), env, ctx);
  assert.ok(!calls[0].includes("DROP"), "قيم غريبة تنشال");
});

test("الأسعار: رموز معروفة بس", async () => {
  assert.equal((await worker.fetch(req("/price/XAU"), env, ctx)).status, 200);
  assert.equal((await worker.fetch(req("/price/ABC"), env, ctx)).status, 404);
});

test("RSS: HTTPS بس", async () => {
  assert.equal((await worker.fetch(req("/rss?url=" + encodeURIComponent("http://example.com/feed")), env, ctx)).status, 400);
  assert.equal((await worker.fetch(req("/rss?url=" + encodeURIComponent("https://example.com/feed")), env, ctx)).status, 200);
  // يرجع نص عادي بس، وأي شي مو خلاصة RSS ينرفض (ما يصير وسيط لصفحات)
  const ok = await worker.fetch(req("/rss?url=" + encodeURIComponent("https://example.com/feed")), env, ctx);
  assert.match(ok.headers.get("Content-Type"), /^text\/plain/);
  assert.equal((await worker.fetch(req("/rss?url=" + encodeURIComponent("https://example.com/page")), env, ctx)).status, 415);
});

test("طلبات غير GET ممنوعة", async () => {
  const r = await worker.fetch(new Request("https://proxy.example/fx", { method: "POST" }), env, ctx);
  assert.equal(r.status, 405);
});
