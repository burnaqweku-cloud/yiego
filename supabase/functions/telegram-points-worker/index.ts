// deno-lint-ignore-file no-explicit-any
// telegram-points-worker
//
// Runs every minute via pg_cron. Scans for pending Telegram referrals whose
// referee has placed at least one DELIVERED bot order, then atomically
// claims + grants points + notifies. Idempotent by design:
//   • claim_telegram_referral CAS-flips status pending→qualified
//   • mark_telegram_referral_rewarded CAS-flips qualified→rewarded
//   • grant_telegram_points uses ledger reference_id to skip duplicates
// A second tick within the same minute on the same row is a no-op.
//
// HARD CONSTRAINTS:
//   • Touches ONLY this new module + telegram-bot/_shared (already shared).
//   • Never modifies orders, payments, wallets, or website code.
//   • Per-referral try/catch — one failure never blocks the batch.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage, esc } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Reward amounts (points)
const REFERRER_REWARD = 400;
const REFEREE_REWARD = 100;

// Safety cap per tick to avoid runaway batches
const MAX_BATCH = 50;

// ── Defense-in-depth grant wrapper ────────────────────────────────────
// Mirrors grantPointsSafe in telegram-bot-core.ts. Throws on any failure
// (Postgres error OR JSON success=false) so the caller cannot accidentally
// claim success on silent failure.
type GrantReason =
  | "referral_referrer" | "referral_referee" | "purchase"
  | "checkin" | "streak_bonus" | "redemption" | "expiry" | "admin_adjust";

class GrantPointsError extends Error {
  code: string;
  detail: unknown;
  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

// Telegram-user-keyed grant. Points belong to the Telegram user; linked
// DataSika user_id is optional metadata. Mirrors grantPointsSafeTg in core.
async function grantPointsSafeTg(
  supa: any,
  telegramUserId: number,
  delta: number,
  reason: GrantReason,
  referenceId: string | null,
  linkedUserId: string | null,
) {
  const ctx = { telegram_user_id: telegramUserId, delta, reason, reference_id: referenceId };
  console.log("[points-worker][grantPointsSafeTg] attempt", ctx);
  const { data, error } = await supa.rpc("grant_telegram_points_v2", {
    p_telegram_user_id: telegramUserId,
    p_delta: delta,
    p_reason: reason,
    p_reference_id: referenceId,
    p_user_id: linkedUserId,
  });
  if (error) {
    console.error("[points-worker][grantPointsSafeTg] RPC error", ctx, error);
    throw new GrantPointsError("RPC_ERROR", error.message || "RPC error", error);
  }
  if (!data || data.success !== true) {
    const code = (data?.error as string) || "SERVER_ERROR";
    console.error("[points-worker][grantPointsSafeTg] rejected", ctx, data);
    throw new GrantPointsError(code, data?.message || code, data);
  }
  console.log("[points-worker][grantPointsSafeTg] ok", { ...ctx, new_balance: data.new_balance });
  return data;
}

interface PendingCandidate {
  referral_id: string;
  referrer_chat_id: number;
  referee_chat_id: number;
  referee_user_id: string | null;
  qualifying_order_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "missing_supabase_env" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supa = createClient(supabaseUrl, supabaseServiceKey);

  // Kill-switch: respect points_system_enabled
  const { data: cfg } = await supa
    .from("telegram_points_config")
    .select("points_system_enabled")
    .eq("id", true)
    .maybeSingle();

  if (cfg && cfg.points_system_enabled === false) {
    return new Response(
      JSON.stringify({ ok: true, skipped: "points_system_disabled" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Step 1: pull pending OR qualified-but-not-rewarded referrals.
  // Pending → needs claim then grant. Qualified → claim was done previously
  // but grant or mark-rewarded failed; retry safely via ledger idempotency.
  const { data: workRows, error: pendingErr } = await supa
    .from("telegram_referrals")
    .select("id, status, referrer_chat_id, referee_chat_id, referrer_telegram_user_id, referee_telegram_user_id, referrer_user_id, referee_user_id, qualifying_order_id")
    .in("status", ["pending", "qualified"])
    .is("rewarded_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (pendingErr) {
    console.error("[points-worker] pending fetch failed:", pendingErr);
    return new Response(
      JSON.stringify({ error: "pending_fetch_failed", detail: pendingErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!workRows || workRows.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, granted: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Step 2: For each row, find the referee's first PAID order (or reuse the
  // one already stamped on a qualified row).
  const candidates: PendingCandidate[] = [];

  for (const row of workRows) {
    try {
      let qualifyingOrderId: string | null = row.qualifying_order_id ?? null;
      let refereeUserIdFromOrder: string | null = row.referee_user_id ?? null;

      if (!qualifyingOrderId) {
        const { data: order } = await supa
          .from("orders")
          .select("order_id, user_id, telegram_chat_id, status, payment_status")
          .eq("telegram_chat_id", row.referee_chat_id)
          .ilike("payment_status", "paid")
          .in("status", ["Pending", "Processing", "Paid", "Delivered"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!order) continue;
        qualifyingOrderId = order.order_id;
        refereeUserIdFromOrder = order.user_id ?? row.referee_user_id ?? null;
      }

      candidates.push({
        referral_id: row.id,
        referrer_chat_id: Number(row.referrer_chat_id),
        referee_chat_id: Number(row.referee_chat_id),
        referee_user_id: refereeUserIdFromOrder,
        qualifying_order_id: qualifyingOrderId!,
      });
    } catch (e) {
      console.error("[points-worker] candidate scan failed:", row.id, e);
    }
  }

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, processed: workRows.length, granted: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Step 3: process each candidate — claim, grant, mark rewarded, notify
  let granted = 0;
  const errors: { referral_id: string; error: string }[] = [];

  for (const c of candidates) {
    try {
      // 3a. Atomic CAS claim — flips pending→qualified (v2: also fills tg_user_id columns)
      const { data: claimed, error: claimErr } = await supa.rpc(
        "claim_telegram_referral_v2",
        {
          p_referral_id: c.referral_id,
          p_qualifying_order_id: c.qualifying_order_id,
          p_referee_user_id: c.referee_user_id,
          p_referee_telegram_user_id: c.referee_chat_id,
        },
      );

      if (claimErr) {
        console.error("[points-worker] claim error:", c.referral_id, claimErr);
        errors.push({ referral_id: c.referral_id, error: claimErr.message });
        continue;
      }

      let claimedRow = Array.isArray(claimed) && claimed.length > 0 ? claimed[0] : null;
      if (!claimedRow) {
        // Already qualified on a prior tick — re-fetch the row so we can
        // retry the grant + mark-rewarded steps. Idempotent via ledger.
        const { data: existing } = await supa
          .from("telegram_referrals")
          .select("referrer_telegram_user_id, referee_telegram_user_id, referrer_user_id, referee_user_id, status, rewarded_at")
          .eq("id", c.referral_id)
          .maybeSingle();
        if (!existing || existing.status === "rewarded" || existing.rewarded_at) continue;
        claimedRow = existing;
      }

      const referrerUserId: string | null = claimedRow.referrer_user_id;
      const refereeUserId: string | null = claimedRow.referee_user_id ?? c.referee_user_id;
      const referrerTgUid: number = Number(claimedRow.referrer_telegram_user_id ?? c.referrer_chat_id);
      const refereeTgUid: number = Number(claimedRow.referee_telegram_user_id ?? c.referee_chat_id);

      // 3b. Grant points to referrer (telegram-keyed — works even if not linked)
      let referrerGranted = false;
      try {
        await grantPointsSafeTg(supa, referrerTgUid, REFERRER_REWARD, "referral_referrer", c.referral_id, referrerUserId);
        referrerGranted = true;
      } catch (e) {
        const ge = e as GrantPointsError;
        console.error("[points-worker] grant referrer failed:", c.referral_id, ge.code, ge.message);
        errors.push({ referral_id: c.referral_id, error: `referrer_grant: ${ge.code}` });
        continue;
      }
      // Tier-unlock DM (best-effort)
      try {
        const { data: bal } = await supa.from("telegram_points_balances")
          .select("balance, tier_notified_max_gb").eq("telegram_user_id", referrerTgUid).maybeSingle();
        if (bal) {
          const tiers = [1, 2, 5, 10];
          let q = 0; for (const g of tiers) if (bal.balance >= g * 1000) q = g;
          if (q > (bal.tier_notified_max_gb || 0)) {
            await supa.from("telegram_points_balances")
              .update({ tier_notified_max_gb: q }).eq("telegram_user_id", referrerTgUid)
              .lt("tier_notified_max_gb", q);
            await sendMessage(c.referrer_chat_id,
              `🎁 <b>You just unlocked ${q}GB free data!</b>\n\nBalance: <b>${bal.balance.toLocaleString()} pts</b>. Tap /redeem to claim.`);
          }
        }
      } catch (e) { console.error("[points-worker] tier notify (referrer) failed:", e); }

      // 3c. Grant points to referee (telegram-keyed)
      let refereeGranted = false;
      try {
        await grantPointsSafeTg(supa, refereeTgUid, REFEREE_REWARD, "referral_referee", c.referral_id, refereeUserId);
        refereeGranted = true;
      } catch (e) {
        const ge = e as GrantPointsError;
        console.error("[points-worker] grant referee failed:", c.referral_id, ge.code, ge.message);
        errors.push({ referral_id: c.referral_id, error: `referee_grant: ${ge.code}` });
      }

      // 3d. Only mark rewarded once BOTH grants are settled (or referrer granted +
      // referee unlinked — referee will earn on link via separate flow)
      if (referrerGranted) {
        const { error: markErr } = await supa.rpc("mark_telegram_referral_rewarded", {
          p_referral_id: c.referral_id,
        });
        if (markErr) {
          console.error("[points-worker] mark rewarded failed:", c.referral_id, markErr);
          errors.push({ referral_id: c.referral_id, error: `mark: ${markErr.message}` });
          continue;
        }
        granted++;

        // 3e. Fire-and-forget notifications.
        // Privacy: referrer notification has NO first names (plain).
        // Referee notification uses ONLY the referee's own first name.
        // Failures NEVER block accounting.
        let refereeName = "Friend";
        try {
          const { data: nameRows } = await supa
            .from("telegram_links")
            .select("chat_id, first_name")
            .eq("chat_id", c.referee_chat_id);
          let fn = (nameRows?.[0]?.first_name || "").trim();
          if (!fn) {
            const { data: known } = await supa
              .from("telegram_known_users")
              .select("first_name")
              .eq("telegram_user_id", c.referee_chat_id)
              .maybeSingle();
            fn = (known?.first_name || "").trim();
          }
          if (fn) refereeName = fn;
        } catch (e) {
          console.error("[points-worker] name lookup failed:", e);
        }

        try {
          await sendMessage(
            c.referrer_chat_id,
            `🎉 <b>You just earned ${REFERRER_REWARD} points!</b>\n\n` +
              `A friend you referred placed their first DataSika order. Tap /points to see your balance or /redeem to claim free data.`,
            { parse_mode: "HTML" },
          );
        } catch (e) {
          console.error("[points-worker] notify referrer failed:", e);
        }

        if (refereeGranted) {
          try {
            await sendMessage(
              c.referee_chat_id,
              `🎁 <b>Welcome bonus, ${esc(refereeName)}!</b>\n\n` +
                `Your first order is in. <b>${REFEREE_REWARD} points</b> just landed in your account — keep earning to redeem free data.\n\n` +
                `Tap /points to see your balance.`,
              { parse_mode: "HTML" },
            );
          } catch (e) {
            console.error("[points-worker] notify referee failed:", e);
          }
        }
      }
    } catch (e: any) {
      console.error("[points-worker] referral processing failed:", c.referral_id, e);
      errors.push({ referral_id: c.referral_id, error: String(e?.message ?? e) });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      pending_scanned: pendingRows.length,
      candidates: candidates.length,
      granted,
      errors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
