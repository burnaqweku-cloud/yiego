// Verifies a Telegram Mini App initData payload (HMAC-SHA-256 against bot token).
// Returns the parsed user on success. Used as a diagnostic / one-shot verifier.
// Public endpoint (no JWT) — security comes from the HMAC verification itself.

import { verifyInitData, TG_MINIAPP_CORS } from "../_shared/tg-miniapp-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: TG_MINIAPP_CORS });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
    });
  }

  let initData = "";
  try {
    const body = await req.json();
    initData = String(body?.initData ?? "");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const verified = await verifyInitData(initData);
    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: verified.user.id,
          first_name: verified.user.first_name ?? null,
          last_name: verified.user.last_name ?? null,
          username: verified.user.username ?? null,
          language_code: verified.user.language_code ?? null,
        },
        auth_date: verified.auth_date,
        start_param: verified.start_param ?? null,
      }),
      { status: 200, headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tg-miniapp-verify] failed:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 401,
      headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
    });
  }
});
