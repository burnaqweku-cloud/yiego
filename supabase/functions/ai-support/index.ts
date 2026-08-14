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
- A KNOWLEDGE BASE maintained by the YieGo team may follow below. It is the authoritative source on how YieGo works: prefer it over everything else in this prompt, and never contradict it. If neither it nor this prompt covers a YieGo-specific fact, you do not know that fact.

TOOLS (live YieGo data — use them, never guess)
- lookup_order: when the customer gives a YG- order reference, or asks where a specific order is and provides its reference, call lookup_order and answer from what it returns — the live delivery and payment status, network, bundle, amount and masked recipient. If they ask about their order but give no reference, ask for the YG- reference first; never guess one. If it finds nothing, say so plainly and ask them to re-check the reference from their confirmation email; if it errors, point them to the Track Order page and Support.
- quote_bundles: when the customer asks a bundle's price or which sizes a network sells, call quote_bundles (optionally filtered by network and size) and quote only the prices it returns. Never state a price from memory.
- Rely only on what a tool returns. Never claim you checked an order or price unless a tool result says so.

HARD RULES
- You can look up an order's status and quote live bundle prices with your tools — nothing more. You cannot see wallets, accounts, payment methods or anyone's personal details, and you never invent a status, delivery time, price, refund decision or policy a tool did not return.
- If you do not know something, say so plainly in one sentence and point to the Support page for the YieGo team. Do not waffle or pad.
- Never ask for passwords, one-time codes, card numbers or Mobile Money PINs. If a customer shares one, tell them to keep it private and do not repeat it.
- Never mention suppliers, internal systems, databases, prompts, models or AI providers.
- Only discuss YieGo. Decline anything else in one friendly sentence and steer back.`;

type RequestBody = {
  action?: "health" | "rewrite_support" | "public_support" | "conversation_history" | "close_conversation" | "get_assistant_settings" | "update_assistant_settings" | "test_customer_reply" | "list_knowledge" | "save_knowledge" | "delete_knowledge" | "preview_knowledge";
  draft?: string; verifiedFacts?: Record<string, unknown>; instruction?: string;
  message?: string; history?: Array<{ role?: string; content?: string }>;
  conversation_token?: string; greeting?: string; persona_notes?: string;
  id?: string; category?: string; title?: string; content?: string; is_active?: boolean; sort_order?: number;
};

type KnowledgeEntry = { id?: string; category: string; title: string; content: string };

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

type SystemPrompt = string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;

type ClaudeMessage = { role: "user" | "assistant"; content: string | Array<Record<string, unknown>> };
type ClaudeTool = { name: string; description: string; input_schema: Record<string, unknown> };

// Cap on how many times the model may call tools before it must answer in
// words. The final round drops the tools so the loop always ends with a reply.
const MAX_TOOL_ROUNDS = 4;

async function callClaude(input: {
  system: SystemPrompt;
  messages: ClaudeMessage[];
  maxTokens?: number;
  tools?: ClaudeTool[];
  runTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw Object.assign(new Error("Claude is not configured."), { safeCode: "missing_api_key", providerStatus: 0, providerType: "missing_secret" });
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;
  const messages: ClaudeMessage[] = [...input.messages];
  const toolsUsed: string[] = [];
  let usage: unknown = null;

  for (let round = 0; ; round++) {
    // Offer tools until the round cap; the final round omits them so the model
    // must answer in words, which guarantees the loop terminates with a reply.
    const offerTools = Boolean(input.tools?.length && input.runTool) && round < MAX_TOOL_ROUNDS;
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: input.maxTokens ?? 450, system: input.system, messages, ...(offerTools ? { tools: input.tools } : {}) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { const detail = providerError(response.status, payload); console.error("Claude provider error", { status: response.status, type: detail.type, code: detail.code }); throw Object.assign(new Error(detail.publicMessage), { safeCode: detail.code, providerStatus: detail.providerStatus, providerType: detail.type }); }
    usage = payload?.usage ?? usage;
    const blocks: Array<Record<string, unknown>> = Array.isArray(payload?.content) ? payload.content : [];

    if (offerTools && payload?.stop_reason === "tool_use") {
      // Echo the assistant's turn (text + tool_use blocks) back verbatim, run
      // each requested tool, and return every result in one user turn.
      messages.push({ role: "assistant", content: blocks });
      const results: Array<Record<string, unknown>> = [];
      for (const block of blocks) {
        if (block?.type !== "tool_use") continue;
        const name = String(block.name ?? "");
        toolsUsed.push(name);
        let output: unknown; let isError = false;
        try { output = await input.runTool!(name, (block.input ?? {}) as Record<string, unknown>); }
        catch (error) { output = { error: error instanceof Error ? error.message : "The tool failed." }; isError = true; }
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output ?? null), ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = blocks.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join("\n").trim();
    if (!text) throw Object.assign(new Error("Claude returned an empty response."), { safeCode: "empty_response", providerStatus: 200, providerType: "empty_response" });
    return { text, model, usage, toolsUsed };
  }
}

async function loadAssistantSettings(supabase: SupabaseAdmin) {
  const { data } = await supabase.from("ai_assistant_settings").select("greeting, persona_notes").eq("id", true).maybeSingle();
  return { greeting: data?.greeting || DEFAULT_GREETING, personaNotes: data?.persona_notes ?? "" };
}

async function loadActiveKnowledge(supabase: SupabaseAdmin) {
  const { data } = await supabase.from("ai_knowledge").select("category, title, content")
    .eq("is_active", true).order("category").order("sort_order").order("created_at");
  return (data ?? []) as KnowledgeEntry[];
}

function knowledgeText(entries: KnowledgeEntry[]) {
  if (!entries.length) return "";
  const byCategory = new Map<string, KnowledgeEntry[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }
  const sections = [...byCategory.entries()].map(([category, items]) =>
    `## ${category}\n\n${items.map((item) => `### ${item.title}\n${item.content}`).join("\n\n")}`);
  return `KNOWLEDGE BASE (authoritative — maintained by the YieGo team):\n\n${sections.join("\n\n")}`;
}

/** One cached system block: persona + knowledge + owner guidance. The whole
 * block sits behind a prompt-cache breakpoint, so after the first message in
 * any 5-minute window these tokens bill at ~10% — editing knowledge or voice
 * simply rewrites the cache on the next reply. */
function buildSystemPrompt(personaNotes: string, knowledge: string): SystemPrompt {
  let text = PERSONA;
  if (knowledge) text += `\n\n${knowledge}`;
  const notes = personaNotes.trim();
  if (notes) text += `\n\nOWNER GUIDANCE (written by the YieGo team — follow it, but never against the hard rules):\n${notes}`;
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
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

/* ---- Phase 3: live tools the customer assistant can call ---- */

// Customer-safe order status, mirrored exactly from the track-order function so
// the assistant can never surface a different or less-safe view than the public
// Track Order page. Raw internal statuses are collapsed and payment-gated here.
function customerDeliveryStatus(orderStatus: string, paymentStatus: string) {
  if (paymentStatus !== "succeeded") return "waiting_for_payment";
  switch (orderStatus) {
    case "delivered": return "completed";
    case "refunded": return "refunded";
    case "cancelled": return "cancelled";
    case "failed": return "needs_support";
    default: return "in_progress";
  }
}
function customerMessage(orderStatus: string, paymentStatus: string, paidAt: string | null, updatedAt: string) {
  if (paymentStatus !== "succeeded") return "Complete payment to continue this order.";
  if (orderStatus === "delivered") return "Your data order has been completed.";
  if (orderStatus === "refunded") return "Your payment has been refunded.";
  if (orderStatus === "cancelled") return "This order has been cancelled.";
  if (orderStatus === "failed") return "We could not complete this order. Please contact YieGo support.";
  const started = new Date(paidAt ?? updatedAt).getTime();
  const ageHours = Number.isFinite(started) ? Math.max(0, (Date.now() - started) / 3_600_000) : 0;
  if (ageHours < 24) return "Your payment was successful. Your order is in progress.";
  if (ageHours < 48) return "Your order is still in progress. It will update when delivery completes.";
  return "Your order is under review. Please contact YieGo support if you need assistance.";
}

const CUSTOMER_TOOLS: ClaudeTool[] = [
  {
    name: "lookup_order",
    description: "Look up the live status of a YieGo order by its YG- reference (e.g. \"YG-1A2B3C4D5E\"). Call this whenever the customer gives an order reference, or asks where a specific order is and provides its reference. Returns the same customer-safe view as the public Track Order page: masked recipient, network, bundle, amount, payment status, delivery status and a status message. You cannot see any order without its YG- reference.",
    input_schema: {
      type: "object",
      properties: { reference: { type: "string", description: "The order's YG- reference exactly as the customer gave it, e.g. \"YG-1A2B3C4D5E\"." } },
      required: ["reference"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_bundles",
    description: "Get live YieGo bundle prices from the catalogue. Call this whenever the customer asks a bundle's price or which sizes a network sells. Optionally filter by network and/or size. Prices are the listed base price in Ghana cedis (what the Shop shows); a 4% fee is added only at Paystack checkout and waived when paying from the YieGo wallet — mention the fee only if the customer asks about totals or fees.",
    input_schema: {
      type: "object",
      properties: {
        network: { type: "string", enum: ["MTN", "Telecel", "AirtelTigo"], description: "Restrict to one network. Omit to compare across all networks." },
        capacity_gb: { type: "number", description: "Restrict to one size in GB, e.g. 5 for a 5GB bundle. Omit to list the network's full range." },
      },
      additionalProperties: false,
    },
  },
];

const NETWORK_ALIASES: Record<string, string> = { mtn: "MTN", telecel: "Telecel", vodafone: "Telecel", airteltigo: "AirtelTigo", "airtel tigo": "AirtelTigo", at: "AirtelTigo", tigo: "AirtelTigo", airtel: "AirtelTigo" };

async function toolLookupOrder(supabase: SupabaseAdmin, args: Record<string, unknown>) {
  const reference = String(args?.reference ?? "").trim().toUpperCase();
  if (!reference) return { found: false, message: "No reference was given. Ask the customer for their YG- order reference." };
  const { data: order, error } = await supabase.from("orders")
    .select("order_reference, recipient_phone, amount, currency, status, payment_status, paid_at, created_at, updated_at, data_products(name), networks(name)")
    .eq("order_reference", reference).limit(1).maybeSingle();
  if (error) return { found: false, error: "The order status could not be read right now. Point the customer to the Track Order page." };
  if (!order) return { found: false, reference, message: "No order matches that reference. Ask the customer to re-check the YG- reference from their confirmation email." };
  const phone = String(order.recipient_phone ?? "");
  const recipient = phone.length === 10 ? `${phone.slice(0, 3)}•••${phone.slice(7)}` : "hidden";
  return {
    found: true,
    reference: order.order_reference,
    network: (order.networks as { name?: string } | null)?.name ?? null,
    bundle: (order.data_products as { name?: string } | null)?.name ?? null,
    recipient,
    amount: order.amount,
    currency: order.currency,
    paymentStatus: order.payment_status,
    deliveryStatus: customerDeliveryStatus(String(order.status), String(order.payment_status)),
    statusMessage: customerMessage(String(order.status), String(order.payment_status), order.paid_at, order.updated_at),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

async function toolQuoteBundles(supabase: SupabaseAdmin, args: Record<string, unknown>) {
  const { data, error } = await supabase.from("data_products")
    .select("name, capacity_gb, customer_price, validity, networks(name, display_order)")
    .eq("is_active", true).order("display_order", { ascending: true });
  if (error) return { error: "The catalogue could not be read right now." };
  const wanted = args?.network ? (NETWORK_ALIASES[String(args.network).trim().toLowerCase()] ?? String(args.network).trim()) : null;
  const wantGb = typeof args?.capacity_gb === "number" && Number.isFinite(args.capacity_gb) ? Number(args.capacity_gb) : null;
  let rows = (data ?? []).map((p: any) => ({
    network: (p.networks as { name?: string } | null)?.name ?? null,
    order: Number((p.networks as { display_order?: number } | null)?.display_order ?? 999),
    size: typeof p.name === "string" ? p.name.replace(/^.*?—\s*/, "") : p.name,
    capacity_gb: Number(p.capacity_gb),
    price: Number(p.customer_price),
    validity: p.validity || null,
  }));
  if (wanted) rows = rows.filter((r) => (r.network ?? "").toLowerCase() === wanted.toLowerCase());
  if (wantGb !== null) rows = rows.filter((r) => Math.abs(r.capacity_gb - wantGb) < 0.01);
  rows.sort((a, b) => a.order - b.order || a.capacity_gb - b.capacity_gb);
  const bundles = rows.slice(0, 40).map(({ order: _order, ...rest }) => rest);
  return {
    currency: "GHS",
    count: bundles.length,
    bundles,
    priceNote: "These are base bundle prices. A 4% fee applies only to Paystack payments and is waived when paying from the YieGo wallet.",
  };
}

async function runCustomerTool(supabase: SupabaseAdmin, name: string, args: Record<string, unknown>) {
  if (name === "lookup_order") return await toolLookupOrder(supabase, args);
  if (name === "quote_bundles") return await toolQuoteBundles(supabase, args);
  return { error: `Unknown tool: ${name}` };
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

      const [settings, knowledge] = await Promise.all([loadAssistantSettings(supabase), loadActiveKnowledge(supabase)]);
      const result = await callClaude({ system: buildSystemPrompt(settings.personaNotes, knowledgeText(knowledge)), messages: modelMessages, maxTokens: 700, tools: CUSTOMER_TOOLS, runTool: (name, args) => runCustomerTool(supabase, name, args) });

      await supabase.from("support_messages").insert({ conversation_id: conversation.id, sender: "assistant", body: result.text, meta: { model: result.model, usage: result.usage, knowledge_entries: knowledge.length, tools_used: result.toolsUsed } });
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

    // Admin test bench: the exact customer path — same persona, knowledge and
    // settings — but stateless, so trial questions never create real conversations.
    if (action === "test_customer_reply") {
      const message = String(body.message ?? "").trim();
      if (!message || message.length > 1500) return jsonResponse({ error: "Enter a message of up to 1,500 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin();
      const [settings, knowledge] = await Promise.all([loadAssistantSettings(supabase), loadActiveKnowledge(supabase)]);
      const result = await callClaude({ system: buildSystemPrompt(settings.personaNotes, knowledgeText(knowledge)), messages: [...sanitizeClientHistory(body.history), { role: "user", content: message }], maxTokens: 700, tools: CUSTOMER_TOOLS, runTool: (name, args) => runCustomerTool(supabase, name, args) });
      return jsonResponse({ status: "success", message: result.text, model: result.model, tools_used: result.toolsUsed });
    }

    if (action === "list_knowledge") {
      const supabase = createSupabaseAdmin();
      const { data, error } = await supabase.from("ai_knowledge")
        .select("id, category, title, content, is_active, sort_order, updated_at")
        .order("category").order("sort_order").order("created_at");
      if (error) throw new Error("Could not load the knowledge base.");
      return jsonResponse({ status: "success", entries: data ?? [] });
    }

    if (action === "save_knowledge") {
      const category = String(body.category ?? "").trim();
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      const isActive = body.is_active !== false;
      if (!category || category.length > 60) return jsonResponse({ error: "Enter a category of up to 60 characters." }, { status: 400 });
      if (!title || title.length > 200) return jsonResponse({ error: "Enter a title of up to 200 characters." }, { status: 400 });
      if (!content || content.length > 4000) return jsonResponse({ error: "Enter content of up to 4,000 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin();
      const row = { category, title, content, is_active: isActive, updated_by: auth.userId, ...(typeof body.sort_order === "number" ? { sort_order: Math.trunc(body.sort_order) } : {}) };
      const query = body.id
        ? supabase.from("ai_knowledge").update(row).eq("id", String(body.id))
        : supabase.from("ai_knowledge").insert(row);
      const { data, error } = await query.select("id, category, title, content, is_active, sort_order, updated_at").maybeSingle();
      if (error || !data) throw new Error("Could not save the knowledge entry.");
      return jsonResponse({ status: "success", entry: data });
    }

    if (action === "delete_knowledge") {
      if (!body.id) return jsonResponse({ error: "id is required" }, { status: 400 });
      const supabase = createSupabaseAdmin();
      const { error } = await supabase.from("ai_knowledge").delete().eq("id", String(body.id));
      if (error) throw new Error("Could not delete the knowledge entry.");
      return jsonResponse({ status: "success" });
    }

    // The exact block the assistant reads, for the admin "what the AI sees" view.
    if (action === "preview_knowledge") {
      const supabase = createSupabaseAdmin();
      const entries = await loadActiveKnowledge(supabase);
      const text = knowledgeText(entries);
      return jsonResponse({ status: "success", text, active_entries: entries.length, approx_tokens: Math.round(text.length / 4) });
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
