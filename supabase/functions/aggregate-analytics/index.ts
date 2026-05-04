import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Aggregate last 45 days (covers all dashboard ranges)
    const days = 45;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    const startISO = startDate.toISOString();

    // --- Page views aggregation ---
    const PAGE_SIZE = 1000;
    let allPageViews: any[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("page_views")
        .select("session_id, created_at")
        .gte("created_at", startISO)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) { console.error("pv fetch error:", error); break; }
      if (!data || data.length === 0) break;
      allPageViews.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Group page views by day
    const pvByDay = new Map<string, { views: number; sessions: Set<string> }>();
    for (const pv of allPageViews) {
      const day = pv.created_at.slice(0, 10);
      if (!pvByDay.has(day)) pvByDay.set(day, { views: 0, sessions: new Set() });
      const entry = pvByDay.get(day)!;
      entry.views++;
      entry.sessions.add(pv.session_id);
    }

    // --- Orders aggregation ---
    let allOrders: any[] = [];
    offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("orders")
        .select("amount_ghs, status, network, order_source, created_at")
        .gte("created_at", startISO)
        .eq("is_checkpoint", false)
        .neq("order_source", "admin_bulk")
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) { console.error("orders fetch error:", error); break; }
      if (!data || data.length === 0) break;
      allOrders.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Also include agent_orders
    offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("agent_orders")
        .select("agent_selling_price, status, network, order_source, created_at")
        .gte("created_at", startISO)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) { console.error("agent_orders fetch error:", error); break; }
      if (!data || data.length === 0) break;
      allOrders.push(
        ...data.map((o: any) => ({
          amount_ghs: o.agent_selling_price,
          status: o.status,
          network: o.network,
          order_source: o.order_source,
          created_at: o.created_at,
        }))
      );
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Group orders by day
    const ordersByDay = new Map<
      string,
      {
        total_orders: number;
        total_revenue: number;
        total_delivered: number;
        total_failed: number;
        by_network: Record<string, number>;
        by_source: Record<string, number>;
      }
    >();

    for (const o of allOrders) {
      const day = o.created_at.slice(0, 10);
      if (!ordersByDay.has(day)) {
        ordersByDay.set(day, {
          total_orders: 0,
          total_revenue: 0,
          total_delivered: 0,
          total_failed: 0,
          by_network: {},
          by_source: {},
        });
      }
      const entry = ordersByDay.get(day)!;
      entry.total_orders++;
      if (["Paid", "Processing", "Delivered"].includes(o.status)) {
        entry.total_revenue += Number(o.amount_ghs) || 0;
      }
      if (o.status === "Delivered") entry.total_delivered++;
      if (o.status === "Failed") entry.total_failed++;
      const net = o.network || "unknown";
      entry.by_network[net] = (entry.by_network[net] || 0) + 1;
      const src = o.order_source || "direct";
      entry.by_source[src] = (entry.by_source[src] || 0) + 1;
    }

    // Merge all days and upsert
    const allDays = new Set([...pvByDay.keys(), ...ordersByDay.keys()]);
    const rows = Array.from(allDays).map((day) => {
      const pv = pvByDay.get(day);
      const ord = ordersByDay.get(day);
      return {
        date: day,
        page_views: pv?.views ?? 0,
        unique_visitors: pv?.sessions.size ?? 0,
        total_orders: ord?.total_orders ?? 0,
        total_revenue: ord?.total_revenue ?? 0,
        total_delivered: ord?.total_delivered ?? 0,
        total_failed: ord?.total_failed ?? 0,
        orders_by_network: ord?.by_network ?? {},
        orders_by_source: ord?.by_source ?? {},
        updated_at: new Date().toISOString(),
      };
    });

    // Upsert in batches
    const BATCH = 50;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from("analytics_daily_metrics")
        .upsert(batch, { onConflict: "date" });
      if (error) {
        console.error("upsert error:", error);
      } else {
        upserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, days: rows.length, upserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("aggregate-analytics error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
