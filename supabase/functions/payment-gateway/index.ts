/* Admin → Finance → Payment gateway card. Read-only status: which gateway is switched on, whether
   Flutterwave is configured and whether its key is a TEST key (so the card can say "admins only,
   nothing delivered"). Changing the switch is a database RPC (master_set_payment_gateway). */
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { configuredGateway } from "../_shared/gateway.ts";
import { flutterwaveConfigured, flutterwaveIsTestKey } from "../_shared/flutterwave.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const supabase = createSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });
    const { data: role } = await supabase.rpc("admin_role", { p_user: authData.user.id });
    if (!role) return jsonResponse({ error: "Admin access required" }, { status: 403 });

    const provider = await configuredGateway(supabase);
    const fwConfigured = flutterwaveConfigured();
    const fwTest = fwConfigured && flutterwaveIsTestKey();
    const webhookHashSet = Boolean(Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH")?.trim());
    const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
    // Who is actually being charged through Flutterwave right now, given the guards in gateway.ts.
    const effective = provider === "flutterwave" && fwConfigured ? (fwTest ? "admins_only_test" : "everyone") : "nobody";
    return jsonResponse({
      status: "success",
      provider,
      is_master: role === "master",
      paystack: { configured: Boolean(Deno.env.get("PAYSTACK_SECRET_KEY")?.trim()) },
      flutterwave: { configured: fwConfigured, test_key: fwTest, webhook_hash_set: webhookHashSet, webhook_url: `${base}/functions/v1/flutterwave-webhook`, effective },
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
});
