import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";

/* Ask Cloudflare to check a store's custom hostname again now instead of waiting for its next retry (18 Nov 2026).
   Cloudflare's way to do that is a PATCH with the same ssl settings the hostname was created with
   (admin_domain_connect: http DV); the database's pg_net can only GET/POST/DELETE, hence this function.
     POST + internal secret { id: "<custom hostname id>" }   -> Cloudflare's reply (status, ssl, errors) */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const db = createSupabaseAdmin();
    const denied = await requireCronSecret(req, db); if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return jsonResponse({ error: "id must be a custom hostname id" }, { status: 400 });
    const { data: rows } = await db.from("internal_secrets").select("key, value").in("key", ["cloudflare", "cloudflare_zone"]);
    const token = rows?.find((r: { key: string }) => r.key === "cloudflare")?.value;
    const zone = rows?.find((r: { key: string }) => r.key === "cloudflare_zone")?.value;
    if (!token || !zone) return jsonResponse({ error: "cloudflare_not_configured" }, { status: 500 });
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/custom_hostnames/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ssl: { method: "http", type: "dv" } }),
    });
    const p = await res.json().catch(() => null);
    const r = p?.result;
    return jsonResponse({ ok: res.ok && p?.success !== false, http: res.status, hostname: r?.hostname ?? null, status: r?.status ?? null, ssl: r?.ssl?.status ?? null,
      errors: r?.verification_errors ?? null, ssl_errors: r?.ssl?.validation_errors ?? null, cf_errors: p?.errors ?? null }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
});
