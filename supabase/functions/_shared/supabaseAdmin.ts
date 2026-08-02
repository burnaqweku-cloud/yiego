import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin environment is not configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "phase1",
    },
  });
}
