// Mini App: Link a Telegram chat to a DataSika account.
//
// Auth: requires a valid Mini App session JWT (Bearer) issued by
// tg-miniapp-session. The chat_id is taken from the JWT — never from
// the request body — so a user can only link THEIR OWN chat.
//
// Identifier resolution mirrors the website (/auth) login flow:
//   - if it contains "@" → treat as email, use directly
//   - otherwise → treat as username, resolve via the
//     `resolve_username_login` RPC (same one the website uses)
//
// Welcome bonus:
//   AFTER a successful first-ever link, we grant 100 points as an
//   "organic welcome" bonus IF the user has no telegram_referrals
//   row (so they didn't arrive via a referrer who will pay them).
//   Implemented as `admin_adjust` (allowed reason) with a unique
//   reference_id `tg_welcome:<user_id>` so it can never be granted
//   twice (the ledger has a unique-on-reference dedupe pattern at
//   the worker level — and we also pre-check the ledger directly).
//
// Notes:
// - Anon-key client only validates the password (no session persisted).
// - Service-role client does the link upsert + welcome grant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireMiniAppSession,
  TG_MINIAPP_CORS,
} from "../_shared/tg-miniapp-auth.ts";

const WELCOME_POINTS = 100;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
  });
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function looksLikePhone(s: string): boolean {
  // crude — used only to give a friendlier hint, not for auth
  const digits = s.replace(/[^\d+]/g, "");
  return /^\+?\d{9,}$/.test(digits);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TG_MINIAPP_CORS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // 1. Verify Mini App session
  let claims;
  try {
    claims = await requireMiniAppSession(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 401);
  }
  const chatId = claims.chat_id;

  // 2. Parse + validate body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const identifierRaw = String(body?.identifier ?? "").trim();
  const password = String(body?.password ?? "");
  if (!identifierRaw || !password) {
    return jsonResponse({ ok: false, error: "Username/email and password are required" }, 400);
  }
  if (password.length < 6 || password.length > 200) {
    return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
  }

  const supaAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 3. Resolve identifier → email (mirrors website /auth flow)
  let email: string | null = null;
  let resolvedFromUsername = false;

  if (looksLikeEmail(identifierRaw)) {
    email = identifierRaw.toLowerCase();
  } else {
    // Friendly hint: phone-only inputs aren't supported on the website either
    if (looksLikePhone(identifierRaw)) {
      return jsonResponse(
        { ok: false, error: "Sign in with your username or email — phone login isn't supported here." },
        400,
      );
    }

    // Same RPC the website uses (see /auth → resolve-username function)
    const { data, error } = await supaAdmin.rpc("resolve_username_login", {
      p_username: identifierRaw,
    });
    if (error) {
      console.error("[tg-miniapp-link] resolve_username_login error:", error.message);
      return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
    }
    const resolved = Array.isArray(data) ? data[0] : null;
    if (!resolved?.email) {
      // Generic — no enumeration
      return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
    }
    if (resolved.is_suspended) {
      const reason = resolved.suspended_reason ? `: ${resolved.suspended_reason}` : ". Contact support for help.";
      return jsonResponse({ ok: false, error: `Account suspended${reason}` }, 403);
    }
    email = String(resolved.email).toLowerCase();
    resolvedFromUsername = true;
  }

  // 4. Validate password (separate anon client — no session persisted)
  const supaAnon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: signIn, error: signInErr } = await supaAnon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signIn?.user?.id) {
    return jsonResponse({ ok: false, error: "Invalid credentials" }, 401);
  }
  const userId = signIn.user.id;

  // Best-effort: revoke the throwaway session
  try {
    if (signIn.session?.access_token) {
      await supaAnon.auth.signOut();
    }
  } catch (_) { /* ignore */ }

  // 5. Check whether this is a truly first-ever link for this user
  //    (must run BEFORE the upsert)
  let isFirstEverLink = false;
  try {
    const { count, error: existingErr } = await supaAdmin
      .from("telegram_links")
      .select("chat_id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (existingErr) {
      console.error("[tg-miniapp-link] existing-links lookup error:", existingErr.message);
    } else {
      isFirstEverLink = (count ?? 0) === 0;
    }
  } catch (e) {
    console.error("[tg-miniapp-link] existing-links lookup threw:", e);
  }

  // 6. Look up profile for nice display name + phone
  const { data: profile } = await supaAdmin
    .from("profiles")
    .select("full_name, phone")
    .eq("id", userId)
    .maybeSingle();

  // 7. Upsert telegram_links — chat_id is unique
  const { error: linkErr } = await supaAdmin
    .from("telegram_links")
    .upsert(
      {
        chat_id: chatId,
        user_id: userId,
        phone: profile?.phone ?? null,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "chat_id" },
    );

  if (linkErr) {
    console.error("[tg-miniapp-link] link upsert error:", linkErr.message);
    return jsonResponse({ ok: false, error: "Could not save link, try again" }, 500);
  }

  // 8. Welcome bonus — fail-loud, non-blocking
  let welcomeGranted = false;
  if (isFirstEverLink) {
    try {
      // Skip if user has any referral row (referrer pays them via the worker)
      const { count: refCount, error: refErr } = await supaAdmin
        .from("telegram_referrals")
        .select("id", { count: "exact", head: true })
        .eq("referee_user_id", userId);
      if (refErr) {
        console.error("[tg-miniapp-link][welcome] referral lookup error:", refErr.message);
      } else if ((refCount ?? 0) > 0) {
        console.log("[tg-miniapp-link][welcome] skipped — user has referral row", { userId });
      } else {
        // Idempotency guard: pre-check ledger for an existing welcome grant.
        // reference_id is unique enough that a duplicate insert attempt is
        // also fine — but checking first lets us log a clean skip.
        const welcomeRef = `tg_welcome:${userId}`;
        const { count: ledgerCount, error: ledgerErr } = await supaAdmin
          .from("telegram_points_ledger")
          .select("id", { count: "exact", head: true })
          .eq("reason", "admin_adjust")
          .eq("reference_id", welcomeRef);
        if (ledgerErr) {
          console.error("[tg-miniapp-link][welcome] ledger pre-check error:", ledgerErr.message);
        } else if ((ledgerCount ?? 0) > 0) {
          console.log("[tg-miniapp-link][welcome] already granted", { userId, welcomeRef });
        } else {
          // Grant — fail-loud
          const { data: grantData, error: grantErr } = await supaAdmin.rpc("grant_telegram_points", {
            p_user_id: userId,
            p_delta: WELCOME_POINTS,
            p_reason: "admin_adjust",
            p_reference_id: welcomeRef,
          });
          if (grantErr) {
            console.error("[tg-miniapp-link][welcome] RPC error", { userId }, grantErr);
          } else if (!grantData || grantData.success !== true) {
            console.error("[tg-miniapp-link][welcome] grant rejected", { userId }, grantData);
          } else {
            console.log("[tg-miniapp-link][welcome] ok", { userId, new_balance: grantData.new_balance });
            welcomeGranted = true;
          }
        }
      }
    } catch (e) {
      // Non-blocking: swallow so the link itself still succeeds
      console.error("[tg-miniapp-link][welcome] threw, link still succeeded:", e);
    }
  }

  return jsonResponse({
    ok: true,
    user_id: userId,
    full_name: profile?.full_name ?? null,
    resolved_from_username: resolvedFromUsername,
    welcome_points_granted: welcomeGranted ? WELCOME_POINTS : 0,
  });
});
