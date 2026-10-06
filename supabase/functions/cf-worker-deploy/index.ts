import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";

/* Deploys the datayego-stores Cloudflare Worker (cron secret). The Worker serves every store host
   (slug.datayego.com and custom domains) from the app at datayego.com, and rewrites the HTML's
   link-preview tags so WhatsApp/Facebook/Telegram show the STORE's name, tagline and logo.
   Also rewrites datayego.com/s/<slug> pages the same way. A store with no logo gets no image at all
   (image meta and icon links removed, icon paths answer 404), never DataYego's banner or icon.
   NOTE: cf-domains' "setup" action still carries the old Worker text; this function is the one to run. */
const ZONE = "datayego.com"; const WORKER = "datayego-stores";
const WORKER_JS = `const SUPA = "https://nhxgebulvqhtiiotetoo.supabase.co"; const ANON = "sb_publishable_tAbh99C5tny6sMAiu6ZYrg_BWjkRIAX";
export default { async fetch(request) {
  const url = new URL(request.url); const host = url.hostname.toLowerCase();
  const apex = host === "${ZONE}" || host === "www.${ZONE}";
  const sm = apex ? url.pathname.match(/^\\/s\\/([a-z0-9-]+)(?:\\/|$)/i) : null;
  if (apex && !sm) return fetch(request);
  // The store this request is for: its own host, or slug.${ZONE} for datayego.com/s/<slug> links.
  const storeHost = sm ? sm[1].toLowerCase() + ".${ZONE}" : host;
  const og = () => fetch(SUPA + "/rest/v1/rpc/store_og", { method: "POST", headers: { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json", "Content-Profile": "phase1" }, body: JSON.stringify({ p_host: storeHost }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // Favicon paths: WhatsApp and browsers fetch these directly, so serve the store's logo there.
  const ICONS = ["/favicon.ico", "/favicon.png", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/yiego-icon-192.png", "/yiego-icon-512.png"];
  if (!apex && request.method === "GET" && ICONS.includes(url.pathname)) {
    const m = await og();
    if (m && m.image) { const img = await fetch(m.image); if (img.ok) { const h = new Headers(img.headers); h.set("cache-control", "public, max-age=3600"); return new Response(img.body, { status: 200, headers: h }); } }
    if (m && m.name) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=600" } });
  }
  let res;
  if (apex) res = await fetch(request);
  else {
    const target = new URL(url.pathname + url.search, "https://${ZONE}");
    const headers = new Headers(request.headers); headers.set("x-store-host", host); headers.delete("host");
    res = await fetch(target.toString(), { method: request.method, headers, body: ["GET","HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual" });
  }
  const out = new Headers(res.headers);
  const loc = out.get("location"); if (!apex && loc && loc.startsWith("https://${ZONE}")) out.set("location", loc.replace("https://${ZONE}", "https://" + host));
  if (request.method === "GET" && (res.headers.get("content-type") || "").includes("text/html")) {
    const meta = await og();
    if (meta && meta.name) {
      const title = meta.name + " \\u2014 MTN, Telecel & AirtelTigo data"; const desc = meta.description || ""; const img = meta.image || "";
      const set = (attr, val) => ({ element(e) { e.setAttribute(attr, val); } }); const drop = { element(e) { e.remove(); } };
      let rw = new HTMLRewriter()
        .on("title", { element(e) { e.setInnerContent(title); } })
        .on('meta[property="og:title"]', set("content", title)).on('meta[name="twitter:title"]', set("content", title))
        .on('meta[property="og:description"]', set("content", desc)).on('meta[name="description"]', set("content", desc)).on('meta[name="twitter:description"]', set("content", desc))
        .on('meta[property="og:url"]', set("content", url.origin + url.pathname)).on('meta[property="og:site_name"]', set("content", meta.name))
        .on('meta[name="application-name"]', set("content", meta.name)).on('meta[name="apple-mobile-web-app-title"]', set("content", meta.name))
        .on('meta[name="twitter:card"]', set("content", "summary"));
      rw = img ? rw.on('meta[property="og:image"]', set("content", img)).on('meta[name="twitter:image"]', set("content", img)).on('link[rel="icon"]', set("href", img)).on('link[rel="apple-touch-icon"]', set("href", img))
               : rw.on('meta[property^="og:image"]', drop).on('meta[name^="twitter:image"]', drop).on('link[rel="icon"]', drop).on('link[rel="apple-touch-icon"]', drop).on('link[rel="shortcut icon"]', drop).on('link[rel="mask-icon"]', drop);
      out.delete("content-length");
      return rw.transform(new Response(res.body, { status: res.status, headers: out }));
    }
  }
  return new Response(res.body, { status: res.status, headers: out });
} }`;

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase); if (denied) return denied;
    const { data: sec } = await supabase.from("internal_secrets").select("value").eq("key", "cloudflare").maybeSingle();
    const { data: acc } = await supabase.from("cloudflare_config").select("value").eq("key", "account_id").maybeSingle();
    if (!sec?.value || !acc?.value) return jsonResponse({ error: "cloudflare_not_configured" }, { status: 500 });
    const fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify({ main_module: "worker.mjs", compatibility_date: "2025-01-01" })], { type: "application/json" }));
    fd.append("worker.mjs", new Blob([WORKER_JS], { type: "application/javascript+module" }), "worker.mjs");
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc.value}/workers/scripts/${WORKER}`, { method: "PUT", headers: { Authorization: `Bearer ${sec.value}` }, body: fd });
    const payload = await r.json().catch(() => null);
    return jsonResponse({ ok: r.ok && payload?.success !== false, status: r.status, errors: payload?.errors ?? null });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
