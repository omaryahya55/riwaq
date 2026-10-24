/*
 * السيرفر الوسيط لرواق (Cloudflare Worker). وش يسوي:
 * - يخزّن الطقس لكل مدينة (طلب واحد كل نص ساعة مهما كثر المستخدمين) عشان حد Open-Meteo
 * - يحفظ مفتاح TheSportsDB المدفوع (env.SPORTS_KEY) بعيد عن التطبيق، ويخزن النتائج
 * - يقرا خلاصات RSS للتطبيق (HTTPS بس، وحجم محدود)
 * ما يحفظ أي بيانات عن المستخدمين، وما فيه سجلات بأسماء أو مواقع.
 *
 * التطبيق يستخدمه لما CONFIG.proxyBase = رابط هذا السيرفر.
 */

const TTL = { weather: 1800, air: 3600, price: 300, fx: 21600, sports: 10800, rss: 900 };
const MAX_RSS = 1024 * 1024;

const ORIGINS = ["https://appassets.androidplatform.net"];

function cors(req) {
  const o = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": o && ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET",
    "Vary": "Origin"
  };
}

// نسمح بس بالأسماء المعروفة في الطلب، ونقرّب الإحداثيات (منطقة كم كيلو) عشان التخزين يشمل المدينة كلها
function weatherQuery(url) {
  const p = url.searchParams;
  const lat = Number(p.get("latitude")), lon = Number(p.get("longitude"));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const q = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2) });
  for (const k of ["current", "daily", "timezone", "forecast_days"]) if (p.get(k)) q.set(k, p.get(k).slice(0, 200));
  return q.toString();
}

async function cached(req, ctx, upstream, ttl, init) {
  const cache = caches.default;
  const key = new Request(upstream, { method: "GET" });
  let res = await cache.match(key);
  if (!res) {
    const r = await fetch(upstream, init);
    if (!r.ok) return new Response("upstream " + r.status, { status: 502, headers: cors(req) });
    res = new Response(r.body, r);
    res.headers.set("Cache-Control", "public, max-age=" + ttl);
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  const out = new Response(res.body, res);
  Object.entries(cors(req)).forEach(([k, v]) => out.headers.set(k, v));
  return out;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method !== "GET") return new Response("method", { status: 405 });
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/weather") {
      const q = weatherQuery(url); if (!q) return new Response("bad", { status: 400 });
      return cached(req, ctx, "https://api.open-meteo.com/v1/forecast?" + q, TTL.weather);
    }
    if (path === "/air") {
      const q = weatherQuery(url); if (!q) return new Response("bad", { status: 400 });
      return cached(req, ctx, "https://air-quality-api.open-meteo.com/v1/air-quality?" + q, TTL.air);
    }
    const price = path.match(/^\/price\/(XAU|XAG|BTC|ETH)$/);
    if (price) return cached(req, ctx, "https://api.gold-api.com/price/" + price[1], TTL.price);
    if (path === "/fx") return cached(req, ctx, "https://api.frankfurter.dev/v2/rates?base=USD&quotes=SAR,EUR,GBP,AED,KWD", TTL.fx);

    // TheSportsDB: ثلاث نقاط بس، والمفتاح من الأسرار
    const sp = path.match(/^\/sports\/(lookuptable|eventsnext|eventslast)\.php$/);
    if (sp) {
      const q = new URLSearchParams();
      for (const k of ["l", "s", "id"]) { const v = url.searchParams.get(k); if (v && /^[0-9-]{1,12}$/.test(v)) q.set(k, v); }
      const key = env.SPORTS_KEY || "123";
      return cached(req, ctx, `https://www.thesportsdb.com/api/v1/json/${key}/${sp[1]}.php?${q}`, TTL.sports);
    }

    if (path === "/rss") {
      let target;
      try { target = new URL(url.searchParams.get("url") || ""); } catch (e) { return new Response("bad url", { status: 400 }); }
      if (target.protocol !== "https:") return new Response("https only", { status: 400 });
      const res = await cached(req, ctx, target.toString(), TTL.rss, { headers: { "User-Agent": "Riwaq/1.0" } });
      const len = Number(res.headers.get("Content-Length") || 0);
      if (len > MAX_RSS) return new Response("too large", { status: 413, headers: cors(req) });
      return res;
    }
    return new Response("not found", { status: 404 });
  }
};
