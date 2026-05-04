import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditAgentProfit } from "../_shared/agent-profit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RUN_KEY = "profit_wallet_backfill_v2_all_history";
const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // ─── Check DB lock: skip if already completed ───
    const { data: existingRun } = await supabase
      .from("backfill_runs")
      .select("*")
      .eq("run_key", RUN_KEY)
      .maybeSingle();

    if (existingRun?.status === "completed") {
      console.log(`[auto-backfill-v2] Already completed. Skipping.`);
      return new Response(JSON.stringify({ status: "already_completed", summary: existingRun.summary }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingRun?.status === "running") {
      const startedAt = new Date(existingRun.started_at).getTime();
      if (Date.now() - startedAt < 15 * 60 * 1000) {
        console.log(`[auto-backfill-v2] Already running. Skipping.`);
        return new Response(JSON.stringify({ status: "already_running" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("backfill_runs").update({ status: "retrying", started_at: new Date().toISOString() }).eq("id", existingRun.id);
    }

    // ─── Acquire lock ───
    if (!existingRun) {
      const { error: lockErr } = await supabase.from("backfill_runs").insert({
        run_key: RUN_KEY,
        status: "running",
      });
      if (lockErr) {
        if (lockErr.code === "23505") {
          return new Response(JSON.stringify({ status: "lock_conflict" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw lockErr;
      }
    }

    // ─── Scan ALL uncredited paid agent orders (always offset 0 since rows get marked) ───
    let totalCredited = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalEligible = 0;
    let totalCreditedAmount = 0;
    let hasMore = true;
    let iterations = 0;
    const MAX_ITERATIONS = 20; // safety limit

    while (hasMore && iterations < MAX_ITERATIONS) {
      iterations++;
      // Always query from offset 0 — processed rows get marked profit_credited=true and drop out
      const { data: orders, error: queryErr } = await supabase
        .from("agent_orders")
        .select("order_id, agent_id, profit_ghs, agent_profit_at_purchase, agent_selling_price, agent_cost_price, payment_status, profit_credited")
        .eq("payment_status", "paid")
        .eq("profit_credited", false)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (queryErr) throw queryErr;

      if (!orders || orders.length === 0) {
        hasMore = false;
        break;
      }

      const eligible = orders.filter((o: any) => {
        const profit = Number(o.agent_profit_at_purchase ?? o.profit_ghs) || 0;
        return profit > 0;
      });

      totalEligible += eligible.length;

      console.log(`[auto-backfill-v2] Iteration ${iterations}: ${orders.length} rows, ${eligible.length} eligible`);

      let batchProcessed = 0;

      for (const o of eligible) {
        try {
          const result = await creditAgentProfit(supabase, o.order_id, "auto_backfill_v2");
          batchProcessed++;
          if (result.action === "credited") {
            totalCredited++;
            totalCreditedAmount += result.amount || 0;
          } else if (result.action === "error") {
            totalErrors++;
            console.error(`[auto-backfill-v2] Error crediting ${o.order_id}: ${result.reason}`);
          } else {
            totalSkipped++;
          }
        } catch (e) {
          totalErrors++;
          console.error(`[auto-backfill-v2] Exception crediting ${o.order_id}:`, e);
        }
      }

      // Mark zero-profit orders as credited so they don't keep appearing
      const zeroProfit = orders.filter((o: any) => {
        const profit = Number(o.agent_profit_at_purchase ?? o.profit_ghs) || 0;
        return profit <= 0;
      });
      for (const o of zeroProfit) {
        await supabase.from("agent_orders").update({
          profit_credited: true,
          profit_credited_at: new Date().toISOString(),
        }).eq("order_id", o.order_id);
        totalSkipped++;
        batchProcessed++;
      }

      // If nothing was processed in this batch, stop to avoid infinite loop
      if (batchProcessed === 0) {
        console.log(`[auto-backfill-v2] No progress in iteration ${iterations}, stopping`);
        hasMore = false;
      }

      if (orders.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    totalCreditedAmount = Math.round(totalCreditedAmount * 100) / 100;

    const summary = {
      total_eligible: totalEligible,
      credited: totalCredited,
      skipped: totalSkipped,
      errors: totalErrors,
      total_credited_amount: totalCreditedAmount,
      ran_at: new Date().toISOString(),
      scope: "all_history",
    };

    console.log(`[auto-backfill-v2] RESULT:`, JSON.stringify(summary));

    // ─── Mark completed ───
    await supabase.from("backfill_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      summary,
    }).eq("run_key", RUN_KEY);

    // ─── Audit log ───
    await supabase.from("audit_logs").insert({
      actor_id: "00000000-0000-0000-0000-000000000000",
      action: "auto_backfill_agent_profits_v2",
      entity_type: "agent_wallet",
      metadata: summary,
    });

    return new Response(JSON.stringify({ status: "completed", summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auto-backfill-v2] Error:", err);

    await supabase.from("backfill_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      summary: { error: String(err) },
    }).eq("run_key", RUN_KEY);

    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
