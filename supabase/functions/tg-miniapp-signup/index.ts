// Mini App: Sign up a brand new DataSika account from inside Telegram,
// then auto-link the new account to the verified chat_id and grant the
// 100-point welcome bonus. Mirrors the website /auth signup exactly:
//   - same field set (full_name, username, phone, email, password)
//   - same validation rules
//   - same uniqueness RPC (check_username_available)
//   - same downstream side-effects (terms acceptance, referral-register,
//     welcome SMS) as Auth.tsx + useAuth.signUp do client-side
//
// Auth: requires a valid Mini App session JWT (Bearer). The chat_id
// comes from the JWT — never from the body. The raw initData is also
// sent in the body so we can re-verify it server-side and securely
// read start_param (which is NOT in the session JWT) to detect a
// referral arrival like ref_<chat_id>.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireMiniAppSession,
  verifyInitData,
  TG_MINIAPP_CORS,
} from "../_shared/tg-miniapp-auth.ts";

const WELCOME_POINTS = 100;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
  });
}

// ── Validation mirrors src/pages/Auth.tsx exactly ──────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9_.]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  full_name?: string;
  username?: string;
  phone?: string;
  email?: string;
  password?: string;
  terms?: string;
}

function validate(input: {
  full_name: string;
  username: string;
  phone: string;
  email: string;
  password: string;
  agreed_to_terms: boolean;
}): FieldErrors | null {
  const errs: FieldErrors = {};

  if (!input.full_name?.trim()) errs.full_name = "Full name is required";

  const u = input.username?.trim() ?? "";
  if (!u) errs.username = "Username is required";
  else if (u.length < 3) errs.username = "Username must be at least 3 characters";
  else if (u.length > 20) errs.username = "Username must be 20 characters or less";
  else if (!USERNAME_RE.test(u)) errs.username = "Only letters, numbers, underscores, and dots allowed";

  if (!input.phone?.trim()) errs.phone = "Phone number is required";

  const e = input.email?.trim() ?? "";
  if (!EMAIL_RE.test(e)) errs.email = "Please enter a valid email address";

  const p = input.password ?? "";
  if (p.length < 8) errs.password = "Password must be at least 8 characters";
  else if (!/[a-zA-Z]/.test(p)) errs.password = "Password must contain at least one letter";
  else if (!/[\d\W_]/.test(p)) errs.password = "Password must contain at least one number or symbol";

  if (!input.agreed_to_terms) {
    errs.terms = "You must agree to the Terms of Service, Privacy Policy, and Disclaimer to continue.";
  }

  return Object.keys(errs).length ? errs : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TG_MINIAPP_CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // 1. Verify Mini App session JWT (chat_id source of truth)
  let claims;
  try {
    claims = await requireMiniAppSession(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 401);
  }
  const chatId = claims.chat_id;

  // 2. Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const input = {
    full_name: String(body?.full_name ?? "").trim(),
    username: String(body?.username ?? "").trim(),
    phone: String(body?.phone ?? "").trim(),
    email: String(body?.email ?? "").trim().toLowerCase(),
    password: String(body?.password ?? ""),
    agreed_to_terms: Boolean(body?.agreed_to_terms),
  };
  const initDataRaw = typeof body?.initData === "string" ? body.initData : "";

  // 3. Validate (mirror website rules)
  const fieldErrors = validate(input);
  if (fieldErrors) {
    return jsonResponse({ ok: false, error: "Please fix the highlighted fields", field_errors: fieldErrors }, 400);
  }

  const supaAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 4. Username uniqueness — SAME RPC the website uses
  try {
    const { data: available, error: uniqErr } = await supaAdmin.rpc("check_username_available", {
      p_username: input.username,
    });
    if (uniqErr) {
      console.error("[tg-miniapp-signup] check_username_available error:", uniqErr.message);
      return jsonResponse({ ok: false, error: "Could not verify username, try again" }, 500);
    }
    if (available === false) {
      return jsonResponse(
        { ok: false, error: "This username is already taken", field_errors: { username: "This username is already taken" } },
        409,
      );
    }
  } catch (e) {
    console.error("[tg-miniapp-signup] uniqueness check threw:", e);
    return jsonResponse({ ok: false, error: "Could not verify username, try again" }, 500);
  }

  // 5. Re-verify initData server-side (do NOT trust client) → read start_param
  let startParam: string | null = null;
  if (initDataRaw) {
    try {
      const verified = await verifyInitData(initDataRaw);
      // Tie verified initData to the JWT chat_id — refuse mismatch
      if (Number(verified.user.id) === Number(chatId)) {
        startParam = verified.start_param ?? null;
      } else {
        console.warn("[tg-miniapp-signup] initData chat mismatch", { jwt: chatId, init: verified.user.id });
      }
    } catch (e) {
      // Non-fatal — referral attribution just won't apply
      console.warn("[tg-miniapp-signup] initData re-verify failed:", e instanceof Error ? e.message : e);
    }
  }

  // 6. Create the auth user (auto-confirmed — matches website behavior)
  //    metadata mirrors useAuth.signUp's `data:` payload exactly so the
  //    handle_new_user DB trigger creates the same profile row shape.
  const { data: created, error: createErr } = await supaAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.full_name,
      phone: input.phone,
      username: input.username,
    },
  });

  if (createErr || !created?.user?.id) {
    const msg = (createErr?.message || "").toLowerCase();
    console.error("[tg-miniapp-signup] createUser error:", createErr?.message);
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate")) {
      // email already in use → guide them to sign in
      return jsonResponse(
        {
          ok: false,
          error: "An account with this email already exists. Please sign in instead.",
          field_errors: { email: "An account with this email already exists" },
          code: "email_taken",
        },
        409,
      );
    }
    if (msg.includes("profiles_username_unique")) {
      return jsonResponse(
        { ok: false, error: "This username is already taken", field_errors: { username: "This username is already taken" } },
        409,
      );
    }
    return jsonResponse({ ok: false, error: createErr?.message || "Could not create account" }, 500);
  }

  const userId = created.user.id;

  // 7. Persist legal-agreement flags (matches Auth.tsx post-signup update)
  try {
    const now = new Date().toISOString();
    await supaAdmin
      .from("profiles")
      .update({
        accepted_terms: true,
        accepted_terms_at: now,
        accepted_terms_version: "v1.0",
        accepted_privacy: true,
        accepted_privacy_at: now,
        accepted_privacy_version: "v1.0",
        accepted_disclaimer: true,
        accepted_disclaimer_at: now,
        accepted_disclaimer_version: "v1.0",
      } as any)
      .eq("id", userId);
  } catch (e) {
    console.error("[tg-miniapp-signup] terms-flag update threw:", e);
  }

  // 8. Auto-link this Telegram chat to the new user
  //    (same upsert tg-miniapp-link does)
  const { error: linkErr } = await supaAdmin
    .from("telegram_links")
    .upsert(
      {
        chat_id: chatId,
        user_id: userId,
        phone: input.phone || null,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "chat_id" },
    );

  if (linkErr) {
    // Don't fail the whole flow — account exists; surface a soft warning.
    console.error("[tg-miniapp-signup] link upsert error:", linkErr.message);
  }

  // 9. Telegram referral attribution (start_param = ref_<chat_id>)
  let referralRecorded = false;
  if (startParam) {
    const m = /^ref_(\d+)$/.exec(startParam);
    if (m) {
      const referrerChatId = Number(m[1]);
      if (Number.isFinite(referrerChatId) && referrerChatId !== chatId) {
        try {
          // Look up referrer's user_id (best-effort)
          const { data: referrerLink } = await supaAdmin
            .from("telegram_links")
            .select("user_id")
            .eq("chat_id", referrerChatId)
            .maybeSingle();

          // Insert (ignore conflicts on referee_chat_id if any UNIQUE exists)
          const { error: refInsertErr } = await supaAdmin
            .from("telegram_referrals")
            .insert({
              referrer_chat_id: referrerChatId,
              referrer_user_id: referrerLink?.user_id ?? null,
              referee_chat_id: chatId,
              referee_user_id: userId,
              status: "pending",
            });
          if (refInsertErr) {
            const m2 = (refInsertErr.message || "").toLowerCase();
            if (m2.includes("duplicate") || m2.includes("unique")) {
              console.log("[tg-miniapp-signup] referral already recorded — skip");
            } else {
              console.error("[tg-miniapp-signup] referral insert error:", refInsertErr.message);
            }
          } else {
            referralRecorded = true;
            console.log("[tg-miniapp-signup] referral recorded", { referrerChatId, refereeChatId: chatId });
          }
        } catch (e) {
          console.error("[tg-miniapp-signup] referral attribution threw:", e);
        }
      }
    }
  }

  // 10. Welcome bonus — 100 pts, idempotent on tg_welcome:<user_id>.
  //     Granted regardless of referral row (referee gets 100 immediate;
  //     referrer gets 400 from the existing worker on first delivered order).
  let welcomeGranted = false;
  try {
    const welcomeRef = `tg_welcome:${userId}`;
    const { count: ledgerCount, error: ledgerErr } = await supaAdmin
      .from("telegram_points_ledger")
      .select("id", { count: "exact", head: true })
      .eq("reason", "admin_adjust")
      .eq("reference_id", welcomeRef);
    if (ledgerErr) {
      console.error("[tg-miniapp-signup][welcome] pre-check error:", ledgerErr.message);
    } else if ((ledgerCount ?? 0) > 0) {
      console.log("[tg-miniapp-signup][welcome] already granted", { userId });
    } else {
      const { data: grantData, error: grantErr } = await supaAdmin.rpc("grant_telegram_points", {
        p_user_id: userId,
        p_delta: WELCOME_POINTS,
        p_reason: "admin_adjust",
        p_reference_id: welcomeRef,
      });
      if (grantErr) {
        console.error("[tg-miniapp-signup][welcome] RPC error:", grantErr);
      } else if (!grantData || grantData.success !== true) {
        console.error("[tg-miniapp-signup][welcome] grant rejected:", grantData);
      } else {
        welcomeGranted = true;
        console.log("[tg-miniapp-signup][welcome] ok", { userId, new_balance: grantData.new_balance });
      }
    }
  } catch (e) {
    console.error("[tg-miniapp-signup][welcome] threw:", e);
  }

  // 11. Fire-and-forget welcome SMS (matches useAuth.signUp behavior)
  if (input.phone) {
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms`;
      // Don't await — non-blocking
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        },
        body: JSON.stringify({
          to: input.phone,
          event_type: "welcome_sms",
          user_id: userId,
          template_vars: { name: input.full_name || "there" },
        }),
      }).catch((e) => console.warn("[tg-miniapp-signup] welcome SMS dispatch failed:", e));
    } catch (e) {
      console.warn("[tg-miniapp-signup] welcome SMS threw:", e);
    }
  }

  return jsonResponse({
    ok: true,
    user_id: userId,
    full_name: input.full_name,
    welcome_points_granted: welcomeGranted ? WELCOME_POINTS : 0,
    referral_recorded: referralRecorded,
  });
});
