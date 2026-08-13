// Sends a one-time welcome email to a newly signed-up user. Called by the
// client right after sign-up with the new session token. Idempotent: it stamps
// a one-time flag on the profile so a retry or double-render can't re-send.
// Dormant without a Resend key (sendWelcomeEmail returns { skipped }).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { sendWelcomeEmail } from "../_shared/email.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });

    const supabase = createSupabaseAdmin();
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });

    const email = auth.user.email;
    if (!email) return jsonResponse({ status: "skipped", reason: "no_email" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, welcome_email_sent_at")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profile?.welcome_email_sent_at) {
      return jsonResponse({ status: "skipped", reason: "already_sent" });
    }

    const rawName = (profile?.full_name as string | undefined) ?? (auth.user.user_metadata?.full_name as string | undefined) ?? "";
    const firstName = rawName.trim().split(/\s+/)[0] ?? "";

    const result = await sendWelcomeEmail(email, firstName);

    // Stamp the flag only on a real send, so a dormant (no-key) run doesn't
    // permanently suppress the welcome email once the key is configured.
    if (!result.skipped && result.ok) {
      await supabase.from("profiles").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", auth.user.id);
    }

    return jsonResponse({ status: result.skipped ? "skipped" : result.ok ? "sent" : "error", detail: result });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
