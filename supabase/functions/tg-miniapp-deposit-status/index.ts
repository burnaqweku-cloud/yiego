// Mini App: Poll the status of a wallet deposit by reference.
//
// Auth: Mini App session JWT (Bearer). The wallet_transactions row is
// scoped to the caller's user_id from JWT claims — a chat can only poll
// its own deposits.
//
// Returns: { status: "pending" | "confirmed" | "failed" | "unknown",
//            balance_ghs: number, base_amount: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireMiniAppSession,
  TG_MINIAPP_CORS,
} from "../_shared/tg-miniapp-auth.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TG_MINIAPP_CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let claims;
  try {
    claims = await requireMiniAppSession(req);
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, 401);
  }
  const userId = claims.user_id ?? null;
  if (!userId) {
    return jsonResponse({ ok: false, error: "This chat isn't linked." }, 403);
  }

  const url = new URL(req.url);
  const reference = (url.searchParams.get("reference") || "").trim();
  if (!reference || reference.length > 64) {
    return jsonResponse({ ok: false, error: "Missing or invalid reference" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Service unavailable." }, 500);
  }
  const supa = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: txn, error: txnErr } = await supa
    .from("wallet_transactions")
    .select("status, amount_ghs, type, user_id")
    .eq("reference", reference)
    .eq("user_id", userId)
    .eq("type", "deposit")
    .maybeSingle();
  if (txnErr) {
    console.error("[tg-miniapp-deposit-status] wallet_transactions read:", txnErr);
    return jsonResponse({ ok: false, error: "Lookup failed" }, 500);
  }

  let status: "pending" | "confirmed" | "failed" | "unknown" = "unknown";
  let baseAmount = 0;
  if (txn) {
    baseAmount = Number(txn.amount_ghs) || 0;
    const s = String(txn.status || "").toLowerCase();
    if (s === "confirmed" || s === "completed") status = "confirmed";
    else if (s === "failed" || s === "cancelled") status = "failed";
    else status = "pending";
  }

  const { data: wallet } = await supa
    .from("wallets")
    .select("balance_ghs")
    .eq("user_id", userId)
    .maybeSingle();
  const balance = Number(wallet?.balance_ghs ?? 0);

  return jsonResponse({
    ok: true,
    status,
    base_amount: baseAmount,
    balance_ghs: balance,
  });
});
