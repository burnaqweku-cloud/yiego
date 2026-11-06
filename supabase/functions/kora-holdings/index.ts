import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { koraConfigured, koraIsTestKey, readKoraBalances } from "../_shared/kora.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Read-only provider cash. No ledger posting, payouts or additional deductions. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization");
  if (!token?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  try {
    const db = createSupabaseAdmin();
    const { data: auth, error } = await db.auth.getUser(token.slice(7));
    if (error || !auth.user) return json({ error: "Invalid session" }, 401);
    const { data: role, error: roleError } = await db.rpc("admin_role", { p_user: auth.user.id });
    if (roleError || !["master", "admin", "staff"].includes(String(role))) return json({ error: "Admin access required" }, 403);
    if (!koraConfigured()) return json({ configured: false, items: null, included_in_profit: false });
    const result = await readKoraBalances();
    const ghs = result.items?.find((item) => item.currency === "GHS");
    const complete = result.ok && !!ghs && !koraIsTestKey();
    return json({ configured: true, test: koraIsTestKey(), read_at: new Date().toISOString(), ...result,
      ok: complete, included_in_profit: complete,
      total_held: complete && ghs ? Math.round((ghs.available + ghs.pending) * 100) / 100 : null }, complete ? 200 : 502);
  } catch { return json({ error: "Kora balances could not be confirmed" }, 502); }
});