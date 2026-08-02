import { callDataMartGH } from "../_shared/datamartgh.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return jsonResponse({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid session" }, { status: 401 });
    }

    const { data: admin } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!admin) {
      return jsonResponse({ error: "Admin access required" }, { status: 403 });
    }

    const url = new URL(req.url);
    const network = url.searchParams.get("network");
    const path = network ? `/data-packages?network=${encodeURIComponent(network)}` : "/data-packages";
    const result = await callDataMartGH(path);

    return jsonResponse(result.payload, { status: result.status });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
