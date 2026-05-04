import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Checks if the system is online. Returns null if online, or a Response if offline.
 * Add this at the top of any order/payment edge function.
 */
export async function checkSystemOnline(
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["system_online", "system_status_message"]);

  const map: Record<string, string> = {};
  (data || []).forEach((r: any) => { map[r.key] = r.value; });

  const isOnline = map.system_online !== "false";

  if (!isOnline) {
    const message = map.system_status_message || "System is currently offline. Please try again later.";
    return new Response(
      JSON.stringify({
        error: message,
        code: "SYSTEM_OFFLINE",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return null; // System is online, proceed
}

/**
 * Checks if a specific network is available for new orders.
 * Returns null if available, or a Response if unavailable.
 */
export async function checkNetworkAvailable(
  network: string,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", [`network_available_${network}`, `network_message_${network}`]);

  const map: Record<string, string> = {};
  (data || []).forEach((r: any) => { map[r.key] = r.value; });

  const isAvailable = map[`network_available_${network}`] !== "false";

  if (!isAvailable) {
    const message = map[`network_message_${network}`] || `${network} orders are temporarily unavailable. Please try again later.`;
    return new Response(
      JSON.stringify({
        error: message,
        code: "NETWORK_UNAVAILABLE",
        network,
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return null; // Network is available
}
