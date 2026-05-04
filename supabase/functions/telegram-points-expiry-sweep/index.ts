// telegram-points-expiry-sweep
// Runs daily via pg_cron. Two phases:
//   1. Send 30-day pre-expiry warning DMs (idempotent via expiry_warning_sent_at).
//   2. Zero out balances inactive 180+ days (records 'expiry' ledger row).
// Body: { mode?: 'warnings_only' | 'expire_only' | 'all' (default 'all') }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let mode = "all";
  try {
    const body = await req.json();
    if (body?.mode) mode = String(body.mode);
  } catch { /* default */ }

  let warningsSent = 0;
  let expired = { users: 0, points: 0 };

  if (mode === "all" || mode === "warnings_only") {
    const { data: warns } = await supa.rpc("telegram_points_expiry_warnings", {
      p_days: 180, p_warn_days: 30, p_max: 200,
    });
    for (const w of (warns || []) as Array<{ user_id: string; chat_id: number; balance: number }>) {
      try {
        await sendMessage(
          w.chat_id,
          [
            "⏳ <b>Heads up — your points are about to expire</b>",
            "",
            `Balance: <b>${w.balance.toLocaleString()} pts</b>`,
            "",
            "Your points will expire in ~30 days unless you earn or redeem within that window.",
            "Quick ways to keep them alive:",
            "• /checkin — daily +5 pts",
            "• /redeem — claim free data",
            "• /refer — invite a friend",
          ].join("\n"),
        );
        await supa.rpc("mark_telegram_expiry_warning_sent", { p_user_id: w.user_id });
        warningsSent++;
      } catch (e) {
        console.error("[expiry-sweep] warn DM failed:", w.user_id, e);
      }
    }
  }

  if (mode === "all" || mode === "expire_only") {
    const { data: result } = await supa.rpc("expire_telegram_inactive_points", {
      p_days: 180, p_max: 500,
    });
    expired = {
      users: (result as any)?.expired_users ?? 0,
      points: (result as any)?.expired_points ?? 0,
    };
  }

  return new Response(
    JSON.stringify({ ok: true, mode, warnings_sent: warningsSent, expired }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
