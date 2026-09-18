import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/* Polls each supplier's wallet balance and records it as a reading, so a
   top-up is detected even when no order goes out. Each supplier's balance
   endpoint is tried in turn; the first that answers with a number wins and
   is remembered in suppliers.metadata.balance_path for next time. */

type Probe = { path: string; pick: (p: any) => number | null };
const num = (v: unknown) => { if (v == null || String(v).trim() === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const PROBES: Record<string, { base: string; auth: () => HeadersInit; paths: Probe[] }> = {
  databundleshub: {
    base: (Deno.env.get("DATABUNDLESHUB_BASE_URL") ?? "https://www.databundleshub.com").replace(/\/$/, ""),
    auth: () => ({ Authorization: `Bearer ${Deno.env.get("DATABUNDLESHUB_API_KEY") ?? ""}`, Accept: "application/json" }),
    paths: [
      { path: "/api/developer/balance", pick: (p) => num(p?.data?.balance ?? p?.data?.walletBalance ?? p?.balance) },
      { path: "/api/developer/wallet", pick: (p) => num(p?.data?.balance ?? p?.data?.walletBalance ?? p?.balance) },
    ],
  },
  instantdatagh: {
    base: (Deno.env.get("INSTANTDATAGH_BASE_URL") ?? "https://instantdatagh.com/api.php").replace(/\/$/, ""),
    auth: () => ({ "x-api-key": Deno.env.get("INSTANTDATAGH_API_KEY") ?? "", Accept: "application/json" }),
    paths: [{ path: "/balance", pick: (p) => num(p?.data?.balance_raw ?? p?.balance_raw ?? String(p?.data?.balance ?? p?.balance ?? "").replace(/[^\d.-]/g, "")) }],
  },
  datamartgh: {
    base: (Deno.env.get("DATAMARTGH_BASE_URL") ?? "https://api.datamartgh.shop/api/developer").replace(/\/$/, ""),
    auth: () => ({ "X-API-Key": Deno.env.get("DATAMARTGH_API_KEY") ?? "", Accept: "application/json" }),
    paths: [
      { path: "/balance", pick: (p) => num(p?.data?.balance ?? p?.data?.walletBalance ?? p?.balance) },
      { path: "/wallet/balance", pick: (p) => num(p?.data?.balance ?? p?.data?.walletBalance ?? p?.balance) },
      { path: "/agent-balance", pick: (p) => num(p?.data?.balance ?? p?.balance) },
    ],
  },
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const supabase = createSupabaseAdmin();
  const results: Record<string, unknown> = {};
  const { data: suppliers } = await supabase.from("suppliers").select("id, code, metadata").in("code", Object.keys(PROBES));

  for (const s of suppliers ?? []) {
    const cfg = PROBES[s.code];
    const known = s.metadata?.balance_path as string | undefined;
    const order = known ? [cfg.paths.find((p) => p.path === known), ...cfg.paths.filter((p) => p.path !== known)].filter(Boolean) as Probe[] : cfg.paths;
    let outcome: Record<string, unknown> = { supplier: s.code, balance: null, tried: [] as string[] };
    for (const probe of order) {
      const started = Date.now();
      let status = 0; let payload: any = null;
      try {
        const res = await fetch(cfg.base + probe.path, { headers: cfg.auth(), signal: AbortSignal.timeout(12_000) });
        status = res.status; payload = await res.json().catch(() => null);
      } catch (e) { payload = { error: e instanceof Error ? e.message : String(e) }; }
      const balance = status === 200 ? probe.pick(payload) : null;
      (outcome.tried as string[]).push(`${probe.path}:${status}`);
      await supabase.from("supplier_api_logs").insert({ supplier_id: s.id, action: "check_balance", endpoint: probe.path, response_payload: payload ?? {}, http_status: status, call_status: balance != null ? "success" : "error", duration_ms: Date.now() - started, error_message: balance == null ? "no balance in response" : null });
      if (balance != null) {
        const { data } = await supabase.rpc("finance_note_supplier_balance", { p_supplier_code: s.code, p_balance: balance, p_observed_at: new Date().toISOString(), p_source: "poll", p_raw: payload, p_detect: true });
        if (!known) await supabase.from("suppliers").update({ metadata: { ...(s.metadata ?? {}), balance_path: probe.path } }).eq("id", s.id);
        outcome = { ...outcome, balance, path: probe.path, noted: data };
        break;
      }
    }
    results[s.code] = outcome;
  }
  return jsonResponse(results);
});
