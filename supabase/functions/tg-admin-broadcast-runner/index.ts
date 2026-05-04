// Cron-driven broadcast runner. Picks one queued/scheduled broadcast,
// sends to its recipients in rate-limited batches (~25/sec, total cap per tick).
// Idempotent via tg_admin_broadcast_recipients(status='pending').

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMessage } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RATE_PER_SEC = 25;
const MAX_PER_TICK = 800; // ~32s of throughput
const TICK_BUDGET_MS = 50_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const start = Date.now();
  let totalSent = 0;
  let totalFailed = 0;

  try {
    while (Date.now() - start < TICK_BUDGET_MS && totalSent + totalFailed < MAX_PER_TICK) {
      // Claim a job
      const { data: claimed, error: claimErr } = await supa.rpc("tg_admin_claim_broadcast");
      if (claimErr) {
        console.error("[broadcast-runner] claim failed", claimErr);
        break;
      }
      const broadcastId = claimed as string | null;
      if (!broadcastId) break;

      // Load the broadcast template
      const { data: bc } = await supa
        .from("tg_admin_broadcasts")
        .select("id, message, button_label, button_url")
        .eq("id", broadcastId)
        .single();

      if (!bc) continue;

      const reply_markup = bc.button_label && bc.button_url
        ? { inline_keyboard: [[{ text: bc.button_label, url: bc.button_url }]] }
        : undefined;

      // Pull pending recipients in chunks
      let pendingRemaining = true;
      while (
        pendingRemaining &&
        Date.now() - start < TICK_BUDGET_MS &&
        totalSent + totalFailed < MAX_PER_TICK
      ) {
        const { data: rcps } = await supa
          .from("tg_admin_broadcast_recipients")
          .select("id, chat_id")
          .eq("broadcast_id", broadcastId)
          .eq("status", "pending")
          .limit(RATE_PER_SEC);

        if (!rcps || rcps.length === 0) {
          pendingRemaining = false;
          break;
        }

        const tickStart = Date.now();
        for (const r of rcps) {
          try {
            const res = await sendMessage(Number(r.chat_id), bc.message, { reply_markup });
            if (res.ok) {
              await supa
                .from("tg_admin_broadcast_recipients")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("id", r.id);
              totalSent++;
            } else {
              await supa
                .from("tg_admin_broadcast_recipients")
                .update({ status: "failed", error: JSON.stringify(res.data ?? {}).slice(0, 500) })
                .eq("id", r.id);
              totalFailed++;
            }
          } catch (e) {
            await supa
              .from("tg_admin_broadcast_recipients")
              .update({ status: "failed", error: String((e as Error).message ?? e).slice(0, 500) })
              .eq("id", r.id);
            totalFailed++;
          }
        }

        // Update aggregate counters
        await supa
          .from("tg_admin_broadcasts")
          .update({ sent_count: totalSent, failed_count: totalFailed })
          .eq("id", broadcastId);

        // Pace ~RATE_PER_SEC/sec
        const elapsed = Date.now() - tickStart;
        if (elapsed < 1000) await new Promise((r) => setTimeout(r, 1000 - elapsed));
      }

      // If everything consumed, mark complete
      const { count: stillPending } = await supa
        .from("tg_admin_broadcast_recipients")
        .select("*", { count: "exact", head: true })
        .eq("broadcast_id", broadcastId)
        .eq("status", "pending");

      if ((stillPending ?? 0) === 0) {
        await supa
          .from("tg_admin_broadcasts")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", broadcastId);
      } else {
        // Leave running so next tick resumes
        await supa
          .from("tg_admin_broadcasts")
          .update({ status: "queued" })
          .eq("id", broadcastId);
        break;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: totalSent, failed: totalFailed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[broadcast-runner]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
