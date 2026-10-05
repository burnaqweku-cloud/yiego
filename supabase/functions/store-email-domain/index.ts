import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/* Let an agent send store emails from their own domain. Wraps Resend's domain API:
   { action: "setup", domain }  -> registers the domain with Resend, stores the DNS records to add
   { action: "status" }         -> asks Resend to verify and stores the result
   { action: "remove" }         -> detaches (emails go back to DataYego's address)
   Agent JWT required. The domain must be one of the agent's connected store domains. */
const RESEND = "https://api.resend.com";

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const key = Deno.env.get("RESEND_API_KEY"); if (!key) return jsonResponse({ error: "Email sending isn't configured." }, { status: 500 });
    const supabase = createSupabaseAdmin();
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth?.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    const { data: agent } = await supabase.from("agents").select("id, store_name, custom_domain, custom_domain_status, email_domain, email_domain_id, email_domain_status").eq("user_id", auth.user.id).maybeSingle();
    if (!agent) return jsonResponse({ error: "Not an agent" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const rs = (path: string, init?: RequestInit) => fetch(`${RESEND}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });

    if (body.action === "setup") {
      const domain = String(body.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return jsonResponse({ error: "Enter a domain like mystore.com." }, { status: 400 });
      if (!(agent.custom_domain_status === "active" && agent.custom_domain && (domain === agent.custom_domain.toLowerCase() || domain.endsWith(`.${agent.custom_domain.toLowerCase()}`)))) return jsonResponse({ error: "Connect this domain to your store first (Store addresses)." }, { status: 400 });
      if (agent.email_domain_id) { await rs(`/domains/${agent.email_domain_id}`, { method: "DELETE" }).catch(() => null); }
      const r = await rs("/domains", { method: "POST", body: JSON.stringify({ name: domain }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.id) return jsonResponse({ error: d?.message ?? "Couldn't register the domain for email." }, { status: 400 });
      const records = (d.records ?? []).map((x: Record<string, unknown>) => ({ type: x.type, name: x.name, value: x.value, ttl: x.ttl ?? "Auto", purpose: x.record }));
      await supabase.from("agents").update({ email_domain: domain, email_domain_id: d.id, email_domain_status: "pending", email_domain_records: records, email_from_name: agent.store_name }).eq("id", agent.id);
      return jsonResponse({ status: "pending", domain, records });
    }

    if (body.action === "status") {
      if (!agent.email_domain_id) return jsonResponse({ status: null });
      await rs(`/domains/${agent.email_domain_id}/verify`, { method: "POST" }).catch(() => null);
      const r = await rs(`/domains/${agent.email_domain_id}`); const d = await r.json().catch(() => null);
      if (!r.ok || !d) return jsonResponse({ error: "Couldn't check the domain." }, { status: 400 });
      const status = d.status === "verified" ? "verified" : d.status === "failed" || d.status === "temporary_failure" ? "failed" : "pending";
      const records = (d.records ?? []).map((x: Record<string, unknown>) => ({ type: x.type, name: x.name, value: x.value, ttl: x.ttl ?? "Auto", purpose: x.record, status: x.status }));
      await supabase.from("agents").update({ email_domain_status: status, email_domain_records: records }).eq("id", agent.id);
      return jsonResponse({ status, domain: agent.email_domain, records });
    }

    if (body.action === "remove") {
      if (agent.email_domain_id) await rs(`/domains/${agent.email_domain_id}`, { method: "DELETE" }).catch(() => null);
      await supabase.from("agents").update({ email_domain: null, email_domain_id: null, email_domain_status: null, email_domain_records: null }).eq("id", agent.id);
      return jsonResponse({ status: null });
    }
    return jsonResponse({ error: "Unsupported action" }, { status: 400 });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
