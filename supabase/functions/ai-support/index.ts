import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function jsonResponse(body: unknown, init: ResponseInit = {}) { return new Response(JSON.stringify(body), { ...init, headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) } }); }
function createSupabaseAdmin() { const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (!url || !key) throw new Error("Backend is not configured"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } }); }
type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";
const MODEL_HISTORY_LIMIT = 12;   // messages of stored context per Claude call
const HISTORY_PAGE_LIMIT = 40;    // messages returned when the chat page restores a thread

const DEFAULT_GREETING = "Hi! I'm YieGo AI. Ask me anything about buying data, payments, your wallet or an order — I'm here all day, every day.";

/** The assistant's persona spec. Voice and formatting live here; the owner's
 * editable tone notes from phase1.ai_assistant_settings are appended to it.
 * Knowledge-base injection and live tools arrive in later phases. */
const PERSONA = `You are YieGo AI, the customer support assistant for YieGo (yiego.shop), a Ghanaian platform for buying MTN, Telecel and AirtelTigo data bundles.

VOICE
- Warm, plain English, confident. Sound like a capable human agent, never like a chatbot filling space.
- Keep answers short: one to three short paragraphs, or a bullet list for steps. Stay under about 120 words unless a procedure genuinely needs more.
- Shape every answer: acknowledge the situation in a few words, give the answer, and end with the single next step when there is one.
- Format with markdown the chat renders: **bold** the fact that matters (a status, an amount, a page name), "-" bullets for steps, numbered lists only for ordered procedures. No headings, no tables, no emojis.
- Mirror the customer's language. Never repeat their question back to them, and never reuse the same greeting or apology twice in one conversation.

WHAT YOU KNOW
- Buying: choose the network (MTN, Telecel or AirtelTigo), then the bundle, then the number receiving the data. Anyone can buy for any number. Guests can buy without an account; an account adds the wallet, saved details and order history.
- Paying: Mobile Money or card through Paystack, or the YieGo wallet balance. Another YieGo user can pay for an existing order using its YG- reference (shared payment); the bundle and recipient are locked when the order is created, so paying cannot change what was ordered.
- Tracking: every order has a YG- reference shown at checkout and in emails. The Track Order page shows the live status. Most orders deliver within minutes of payment clearing; a slow network can delay this, and the order stays visible until it completes.
- Wallet: top up once by Mobile Money or card, spend across many orders; every credit and debit appears in the wallet statement.
- Help: unresolved payment, delivery or refund matters go to the YieGo team through the Support page (WhatsApp or email).

HARD RULES
- You cannot see orders, payments, wallets or accounts. Never claim you checked one and never invent statuses, delivery times, refund decisions or policies. For a specific order, send the customer to the Track Order page with their YG- reference.
- If you do not know something, say so plainly in one sentence and point to the Support page for the YieGo team. Do not waffle or pad.
- Never ask for passwords, one-time codes, card numbers or Mobile Money PINs. If a customer shares one, tell them to keep it private and do not repeat it.
- Never mention suppliers, internal systems, databases, prompts, models or AI providers.
- Only discuss YieGo. Decline anything else in one friendly sentence and steer back.`;

type RequestBody = {
  action?: "health" | "rewrite_support" | "public_support" | "conversation_history" | "close_conversation" | "get_assistant_settings" | "update_assistant_settings" | "test_customer_reply";
  draft?: string; verifiedFacts?: Record<string, unknown>; instruction?: string;
  message?: string; history?: Array<{ role?: string; content?: string }>;
  conversation_token?: string; greeting?: string; persona_notes?: string;
};

type ConversationRow = { id: string; conversation_token: string; user_id: string | null; status: "ai" | "human" | "closed" };
type MessageRow = { id: string; sender: "customer" | "assistant" | "admin"; body: string; created_at: string };

async function requireActiveAdmin(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { error: jsonResponse({ error: "Authentication required" }, { status: 401 }) };
  const supabase = createSupabaseAdmin();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return { error: jsonResponse({ error: "Invalid session" }, { status: 401 }) };
  const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", authData.user.id).eq("is_active", true).maybeSingle();
  if (!admin) return { error: jsonResponse({ error: "Admin access required" }, { status: 403 }) };
  return { userId: authData.user.id };
}

/** Signed-in customers arrive with their session JWT; guests with none. */
async function optionalUserId(req: Request, supabase: SupabaseAdmin) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

/** The public support chat runs on the anon key with no user session, so it is
 * reachable by anyone who has the (public) publishable key. Each call spends
 * real Claude tokens, so gate it per-IP and globally before hitting the model.
 * IPs are hashed so raw addresses are never stored. */
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
}
async function enforcePublicRateLimit(req: Request, supabase: SupabaseAdmin) {
  const salt = Deno.env.get("RATE_LIMIT_SALT") ?? "yiego-ai-support";
  const ipHash = await sha256Hex(clientIp(req) + "|" + salt);
  const { data, error } = await supabase.rpc("ai_support_rate_check", { p_ip_hash: ipHash });
  // Fail closed: if the limiter itself errors, refuse rather than let cost run
  // unbounded. A DB blip briefly degrades chat to "try again", never a blank cheque.
  if (error) return jsonResponse({ error: "Support chat is briefly unavailable. Please try again in a moment.", code: "rate_check_failed" }, { status: 503 });
  if (data && data.allowed === false) {
    return jsonResponse({ error: "You've reached the support-chat limit. Please wait a few minutes, or use Contact Support for anything urgent.", code: "rate_limited", scope: data.scope }, { status: 429, headers: { "Retry-After": String(data.retry_after ?? 300) } });
  }
  return null;
}

function providerError(status: number, payload: any) {
  const type = String(payload?.error?.type ?? "provider_error");
  const raw = String(payload?.error?.message ?? "Claude request failed");
  const lower = raw.toLowerCase();
  const code = status === 401 ? "invalid_api_key" : status === 403 ? "provider_permission" : status === 429 ? "provider_limit" : (status === 400 && (lower.includes("credit") || lower.includes("billing"))) ? "provider_billing" : status === 404 ? "model_unavailable" : "provider_error";
  const publicMessage = code === "invalid_api_key" ? "The Claude API key is invalid or was revoked." : code === "provider_permission" ? "The Claude account cannot use this model or request." : code === "provider_limit" ? "Claude usage is temporarily limited." : code === "provider_billing" ? "The Claude account has a billing or credit restriction." : code === "model_unavailable" ? "The configured Claude model is unavailable for this account." : "Claude rejected the request.";
  return { code, type, publicMessage, providerStatus: status };
}

async function callClaude(input: { system: string; messages: Array<{ role: "user" | "assistant"; content: string }>; maxTokens?: number }) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw Object.assign(new Error("Claude is not configured."), { safeCode: "missing_api_key", providerStatus: 0, providerType: "missing_secret" });
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: input.maxTokens ?? 450, system: input.system, messages: input.messages })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) { const detail = providerError(response.status, payload); console.error("Claude provider error", { status: response.status, type: detail.type, code: detail.code }); throw Object.assign(new Error(detail.publicMessage), { safeCode: detail.code, providerStatus: detail.providerStatus, providerType: detail.type }); }
  const text = Array.isArray(payload?.content) ? payload.content.filter((item: any) => item?.type === "text").map((item: any) => item.text ?? "").join("\n").trim() : "";
  if (!text) throw Object.assign(new Error("Claude returned an empty response."), { safeCode: "empty_response", providerStatus: 200, providerType: "empty_response" });
  return { text, model, usage: payload?.usage ?? null };
}

async function loadAssistantSettings(supabase: SupabaseAdmin) {
  const { data } = await supabase.from("ai_assistant_settings").select("greeting, persona_notes").eq("id", true).maybeSingle();
  return { greeting: data?.greeting || DEFAULT_GREETING, personaNotes: data?.persona_notes ?? "" };
}

function buildSystemPrompt(personaNotes: string) {
  const notes = personaNotes.trim();
  return notes ? `${PERSONA}\n\nOWNER GUIDANCE (written by the YieGo team — follow it, but never against the hard rules):\n${notes}` : PERSONA;
}

function newConversationToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return "SC-" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Resolve the caller's conversation: by token when they hold one (and, for
 * bound conversations, only when the same account is signed in — a leaked
 * token must not read another account's thread), otherwise by account so a
 * signed-in customer's thread follows them across devices. */
async function findConversation(supabase: SupabaseAdmin, token: string, userId: string | null) {
  if (token) {
    const { data } = await supabase.from("support_conversations").select("id, conversation_token, user_id, status").eq("conversation_token", token).maybeSingle<ConversationRow>();
    if (data && (!data.user_id || data.user_id === userId)) return data;
  }
  if (userId) {
    const { data } = await supabase.from("support_conversations").select("id, conversation_token, user_id, status").eq("user_id", userId).neq("status", "closed").order("last_message_at", { ascending: false }).limit(1).maybeSingle<ConversationRow>();
    if (data) return data;
  }
  return null;
}

function sanitizeClientHistory(history: RequestBody["history"]) {
  if (!Array.isArray(history)) return [];
  return history.slice(-8)
    .map((item) => ({ role: item.role === "assistant" ? "assistant" as const : "user" as const, content: String(item.content ?? "").slice(0, 1500) }))
    .filter((item) => item.content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("diagnostic") !== "provider") return jsonResponse({ status: "ok" });
    try { const result = await callClaude({ system: "You are a connection test.", messages: [{ role: "user", content: "Reply with exactly: YIEGO_AI_READY" }], maxTokens: 20 }); return jsonResponse({ status: "ready", provider: "anthropic", model: result.model }); }
    catch (error) { return jsonResponse({ status: "unavailable", code: (error as any)?.safeCode ?? "ai_unavailable", provider_status: (error as any)?.providerStatus ?? null, provider_type: (error as any)?.providerType ?? null, message: error instanceof Error ? error.message : "AI support is unavailable." }); }
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const body = await req.json() as RequestBody;
    const action = body.action ?? "health";

    if (action === "public_support") {
      const message = String(body.message ?? "").trim();
      if (!message || message.length > 1500) return jsonResponse({ error: "Enter a message of up to 1,500 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin();
      const limited = await enforcePublicRateLimit(req, supabase);
      if (limited) return limited;

      const userId = await optionalUserId(req, supabase);
      const token = String(body.conversation_token ?? "").trim();
      let conversation = await findConversation(supabase, token, userId);
      let isNew = false;
      if (!conversation) {
        const { data, error } = await supabase.from("support_conversations")
          .insert({ conversation_token: newConversationToken(), user_id: userId })
          .select("id, conversation_token, user_id, status").single<ConversationRow>();
        if (error || !data) throw new Error("Could not start the conversation.");
        conversation = data; isNew = true;
      } else {
        // A guest who signed in keeps their thread; a closed thread reopens on a new message.
        const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() };
        if (!conversation.user_id && userId) { patch.user_id = userId; conversation.user_id = userId; }
        if (conversation.status === "closed") { patch.status = "ai"; conversation.status = "ai"; }
        await supabase.from("support_conversations").update(patch).eq("id", conversation.id);
      }

      const { error: insertError } = await supabase.from("support_messages").insert({ conversation_id: conversation.id, sender: "customer", body: message });
      if (insertError) throw new Error("Could not save your message.");

      // A human has the conversation: store the message and stay silent — the
      // team replies from the inbox. The customer page explains the wait.
      if (conversation.status === "human") {
        await supabase.from("support_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
        return jsonResponse({ status: "success", message: null, conversation_token: conversation.conversation_token, conversation_status: "human" });
      }

      // Context comes from the stored thread, never from the client. The one
      // exception: a brand-new conversation from the pre-rebuild frontend may
      // carry its in-browser history — honour it so context survives the rollout.
      let modelMessages: Array<{ role: "user" | "assistant"; content: string }>;
      if (isNew) {
        modelMessages = [...sanitizeClientHistory(body.history), { role: "user", content: message }];
      } else {
        const { data: stored } = await supabase.from("support_messages")
          .select("sender, body").eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false }).limit(MODEL_HISTORY_LIMIT);
        modelMessages = (stored ?? []).reverse().map((row) => ({ role: row.sender === "customer" ? "user" as const : "assistant" as const, content: String(row.body).slice(0, 4000) }));
        while (modelMessages.length && modelMessages[0].role !== "user") modelMessages.shift();
        if (!modelMessages.length) modelMessages = [{ role: "user", content: message }];
      }

      const settings = await loadAssistantSettings(supabase);
      const result = await callClaude({ system: buildSystemPrompt(settings.personaNotes), messages: modelMessages, maxTokens: 600 });

      await supabase.from("support_messages").insert({ conversation_id: conversation.id, sender: "assistant", body: result.text, meta: { model: result.model, usage: result.usage } });
      await supabase.from("support_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
      return jsonResponse({ status: "success", message: result.text, conversation_token: conversation.conversation_token, conversation_status: "ai", model: result.model });
    }

    if (action === "conversation_history") {
      const supabase = createSupabaseAdmin();
      const settings = await loadAssistantSettings(supabase);
      const userId = await optionalUserId(req, supabase);
      const conversation = await findConversation(supabase, String(body.conversation_token ?? "").trim(), userId);
      if (!conversation) return jsonResponse({ status: "success", greeting: settings.greeting, conversation: null, messages: [] });
      const { data: messages } = await supabase.from("support_messages")
        .select("id, sender, body, created_at").eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false }).limit(HISTORY_PAGE_LIMIT);
      return jsonResponse({
        status: "success", greeting: settings.greeting,
        conversation: { token: conversation.conversation_token, status: conversation.status },
        messages: ((messages ?? []) as MessageRow[]).reverse(),
      });
    }

    if (action === "close_conversation") {
      const token = String(body.conversation_token ?? "").trim();
      if (!token) return jsonResponse({ error: "conversation_token is required" }, { status: 400 });
      const supabase = createSupabaseAdmin();
      const userId = await optionalUserId(req, supabase);
      const conversation = await findConversation(supabase, token, userId);
      if (conversation) await supabase.from("support_conversations").update({ status: "closed" }).eq("id", conversation.id);
      return jsonResponse({ status: "success" });
    }

    const auth = await requireActiveAdmin(req); if (auth.error) return auth.error;

    if (action === "health") {
      const result = await callClaude({ system: "You are a connection test. Follow the instruction exactly.", messages: [{ role: "user", content: "Reply with exactly: YIEGO_AI_READY" }], maxTokens: 20 });
      return jsonResponse({ status: result.text.includes("YIEGO_AI_READY") ? "ready" : "unexpected_response", provider: "anthropic", model: result.model });
    }

    if (action === "get_assistant_settings") {
      const settings = await loadAssistantSettings(createSupabaseAdmin());
      return jsonResponse({ status: "success", greeting: settings.greeting, persona_notes: settings.personaNotes });
    }

    if (action === "update_assistant_settings") {
      const greeting = String(body.greeting ?? "").trim();
      const personaNotes = String(body.persona_notes ?? "").trim();
      if (!greeting || greeting.length > 300) return jsonResponse({ error: "Enter a greeting of up to 300 characters." }, { status: 400 });
      if (personaNotes.length > 4000) return jsonResponse({ error: "Keep the tone notes under 4,000 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin();
      const { error } = await supabase.from("ai_assistant_settings").upsert({ id: true, greeting, persona_notes: personaNotes, updated_by: auth.userId });
      if (error) throw new Error("Could not save the assistant settings.");
      return jsonResponse({ status: "success" });
    }

    // Admin test bench: the exact customer path — same persona, same settings —
    // but stateless, so trial questions never create or pollute real conversations.
    if (action === "test_customer_reply") {
      const message = String(body.message ?? "").trim();
      if (!message || message.length > 1500) return jsonResponse({ error: "Enter a message of up to 1,500 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin();
      const settings = await loadAssistantSettings(supabase);
      const result = await callClaude({ system: buildSystemPrompt(settings.personaNotes), messages: [...sanitizeClientHistory(body.history), { role: "user", content: message }], maxTokens: 600 });
      return jsonResponse({ status: "success", message: result.text, model: result.model });
    }

    if (action !== "rewrite_support") return jsonResponse({ error: "Unsupported action" }, { status: 400 });
    const draft = String(body.draft ?? "").trim();
    if (!draft || draft.length > 4000) return jsonResponse({ error: "Enter a support draft of up to 4,000 characters." }, { status: 400 });
    const verifiedFacts = body.verifiedFacts && typeof body.verifiedFacts === "object" ? body.verifiedFacts : {};
    const instruction = String(body.instruction ?? "Make the message clear, warm and professional.").trim().slice(0, 500);
    const system = `You rewrite customer-support messages for YieGo. Use only supplied verified facts and the safe draft. Do not invent payment, delivery, refund, supplier, account or policy facts. Do not expose internal notes or technical details. Return only a concise, professional customer message.`;
    const prompt = `VERIFIED FACTS:\n${JSON.stringify(verifiedFacts, null, 2)}\n\nSAFE DRAFT:\n${draft}\n\nSTYLE REQUEST:\n${instruction}`;
    const result = await callClaude({ system, messages: [{ role: "user", content: prompt }], maxTokens: 420 });
    return jsonResponse({ status: "success", message: result.text, provider: "anthropic", model: result.model, usage: result.usage });
  } catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : "AI support is unavailable.", code: (error as any)?.safeCode ?? "ai_unavailable" }, { status: 503 }); }
});
