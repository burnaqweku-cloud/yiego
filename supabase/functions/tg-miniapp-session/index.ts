// Mints a short-lived (5 min) session JWT for the Mini App, given
// a freshly verified initData payload. The Mini App caches this JWT
// and sends it as Authorization: Bearer <jwt> on subsequent API calls.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verifyInitData,
  signSession,
  TG_MINIAPP_CORS,
} from "../_shared/tg-miniapp-auth.ts";

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

  let verified;
  try {
    verified = await verifyInitData(initData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tg-miniapp-session] verify failed:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 401,
      headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" },
    });
  }

  const chatId = verified.user.id;

  // Look up the linked DataSika user_id (if any) so the session knows.
  let userId: string | null = null;
  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supa
      .from("telegram_links")
      .select("user_id")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (error) console.warn("[tg-miniapp-session] link lookup error:", error.message);
    userId = (data?.user_id as string | undefined) ?? null;
  } catch (e) {
    console.warn("[tg-miniapp-session] link lookup threw:", e);
  }

  const token = await signSession({ chat_id: chatId, user_id: userId });
  return new Response(
    JSON.stringify({
      ok: true,
      token,
      expires_in: 300,
      chat_id: chatId,
      user_id: userId,
      user: {
        first_name: verified.user.first_name ?? null,
        last_name: verified.user.last_name ?? null,
        username: verified.user.username ?? null,
      },
      start_param: verified.start_param ?? null,
    }),
    { status: 200, headers: { ...TG_MINIAPP_CORS, "Content-Type": "application/json" } },
  );
});
