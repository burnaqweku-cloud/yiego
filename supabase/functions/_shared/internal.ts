import { jsonResponse } from "./cors.ts";

/* Functions that only the scheduled jobs should run. The job sends the secret
   stored in phase1.internal_secrets (key 'cron'); nobody else can read it. */
// deno-lint-ignore no-explicit-any
export async function requireCronSecret(req: Request, supabase: any): Promise<Response | null> {
  const given = req.headers.get("x-yiego-internal-secret") ?? "";
  const { data } = await supabase.from("internal_secrets").select("value").eq("key", "cron").maybeSingle();
  if (!data?.value || given.length !== data.value.length || given !== data.value) return jsonResponse({ error: "Forbidden" }, { status: 403 });
  return null;
}
