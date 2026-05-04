import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditAgentProfit } from "../_shared/agent-profit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth check - admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify admin role
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    // Check admin role
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin"])
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { mode, date_from, date_to, agent_id, network } = body;
    // mode: "preview" | "execute"

    // Build query for uncredited paid agent orders
    let query = supabase
      .from("agent_orders")
      .select("order_id, agent_id, profit_ghs, agent_profit_at_purchase, agent_selling_price, agent_cost_price, network, bundle_size_gb, created_at, status, payment_status, profit_credited")
      .eq("payment_status", "paid")
      .eq("profit_credited", false)
      .order("created_at", { ascending: false })
      .limit(500);

    if (date_from) query = query.gte("created_at", `${date_from}T00:00:00`);
    if (date_to) query = query.lte("created_at", `${date_to}T23:59:59`);
    if (agent_id && agent_id !== "all") query = query.eq("agent_id", agent_id);
    if (network && network !== "all") query = query.eq("network", network);

    const { data: orders, error: queryErr } = await query;
    if (queryErr) {
      return new Response(JSON.stringify({ error: queryErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter: must have profit amount > 0 and valid snapshots
    const eligible = (orders || []).filter((o: any) => {
      const profit = Number(o.agent_profit_at_purchase ?? o.profit_ghs) || 0;
      return profit > 0;
    });

    const totalAmount = eligible.reduce((s: number, o: any) => s + (Number(o.agent_profit_at_purchase ?? o.profit_ghs) || 0), 0);

    if (mode === "preview") {
      return new Response(JSON.stringify({
        count: eligible.length,
        total_amount: Math.round(totalAmount * 100) / 100,
        orders: eligible.map((o: any) => ({
          order_id: o.order_id,
          agent_id: o.agent_id,
          network: o.network,
          bundle_size_gb: o.bundle_size_gb,
          profit: Number(o.agent_profit_at_purchase ?? o.profit_ghs) || 0,
          created_at: o.created_at,
          status: o.status,
        })),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "execute") {
      const results: Array<{ order_id: string; action: string; amount?: number; reason?: string }> = [];

      for (const o of eligible) {
        const result = await creditAgentProfit(supabase, o.order_id, "admin_backfill");
        results.push({
          order_id: o.order_id,
          action: result.action,
          amount: result.amount,
          reason: result.reason,
        });
      }

      const credited = results.filter(r => r.action === "credited");
      const skipped = results.filter(r => r.action === "already_credited" || r.action === "skipped");
      const errors = results.filter(r => r.action === "error");

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id: userId,
        action: "agent_profit_backfill",
        entity_type: "agent_wallet",
        metadata: {
          total_eligible: eligible.length,
          credited: credited.length,
          skipped: skipped.length,
          errors: errors.length,
          total_credited_amount: credited.reduce((s, r) => s + (r.amount || 0), 0),
          filters: { date_from, date_to, agent_id, network },
        },
      });

      return new Response(JSON.stringify({
        total_eligible: eligible.length,
        credited: credited.length,
        skipped: skipped.length,
        errors: errors.length,
        total_credited_amount: Math.round(credited.reduce((s, r) => s + (r.amount || 0), 0) * 100) / 100,
        details: results,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "mode must be 'preview' or 'execute'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[backfill] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
