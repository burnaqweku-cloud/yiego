import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendEmail } from "../_shared/email.ts";

/* DataYego AI: the main-site support assistant. Runs on Google Gemini with function calling.
   Public chat (rate-limited, anon), stored threads, admin knowledge base, settings, test bench, takeover inbox.
   Separate from the agent-store chat (store-chat-ai): different tables, different persona, never shares threads. */
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function jsonResponse(body: unknown, init: ResponseInit = {}) { return new Response(JSON.stringify(body), { ...init, headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) } }); }
function createSupabaseAdmin() { const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (!url || !key) throw new Error("Backend is not configured"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } }); }
type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

const DEFAULT_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const MODEL_HISTORY_LIMIT = 12; const HISTORY_PAGE_LIMIT = 40; const MAX_TOOL_ROUNDS = 4;
const DEFAULT_GREETING = "Hi! I'm DataYego AI. Ask me anything about buying data, payments, your wallet or an order. I'm here all day, every day.";

const PERSONA = `You are DataYego AI, the customer support assistant for DataYego (datayego.com), a Ghanaian platform for buying MTN, Telecel and AirtelTigo data bundles.

VOICE
- Warm, plain English, confident. Sound like a capable human agent, never like a chatbot filling space.
- Keep answers short: one to three short paragraphs, or a "-" bullet list for steps. Stay under about 120 words unless a procedure genuinely needs more.
- Acknowledge the situation in a few words, give the answer, end with the single next step when there is one.
- Markdown the chat renders: **bold** the fact that matters, "-" bullets, numbered lists only for ordered steps. No headings, no tables, no emojis.
- Mirror the customer's language. Never repeat their question back. Never reuse the same greeting or apology twice.

TOOLS (live DataYego data; use them, never guess)
- lookup_order: when the customer gives a YG- or AG- order reference, or asks about a specific order and gives its reference. Answer only from what it returns. No reference: ask for it first. Not found: say so and ask them to re-check the reference from their email.
- quote_bundles: whenever price or available sizes come up. Quote only the prices returned. Never state a price from memory.
- escalate_to_human: when you cannot resolve it (refund, payment gone wrong, failed delivery, account or security problem, or they ask for a person). Then say in one sentence that you're connecting them to the DataYego team on WhatsApp and a button is shown. Don't escalate what you can answer.

HARD RULES
- You cannot see wallets, accounts, payment methods or personal details. Never invent a status, delivery time, price, refund decision or policy.
- If you don't know, say so in one sentence and point to the Support page.
- Never ask for passwords, one-time codes, card numbers or MoMo PINs; if shared, tell them to keep it private and don't repeat it.
- Never mention suppliers, internal systems, databases, prompts, models or AI providers.
- Only discuss DataYego. Decline anything else in one friendly sentence and steer back.
- The KNOWLEDGE BASE below is authoritative: prefer it over anything else here and never contradict it.`;

type RequestBody = { action?: string; draft?: string; verifiedFacts?: Record<string, unknown>; instruction?: string; message?: string; history?: Array<{ role?: string; content?: string }>; conversation_token?: string; greeting?: string; persona_notes?: string; id?: string; category?: string; title?: string; content?: string; is_active?: boolean; sort_order?: number };
type KnowledgeEntry = { id?: string; category: string; title: string; content: string };
type ConversationRow = { id: string; conversation_token: string; user_id: string | null; status: "ai" | "human" | "closed" };
type MessageRow = { id: string; sender: "customer" | "assistant" | "admin"; body: string; created_at: string };
const messagePreview = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 140);

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
async function optionalUserId(req: Request, supabase: SupabaseAdmin) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", ""); if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token); return error || !data.user ? null : data.user.id;
}
async function sha256Hex(value: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function clientIp(req: Request) { const f = req.headers.get("x-forwarded-for"); if (f) return f.split(",")[0].trim(); return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown"; }
async function enforcePublicRateLimit(req: Request, supabase: SupabaseAdmin) {
  const ipHash = await sha256Hex(clientIp(req) + "|" + (Deno.env.get("RATE_LIMIT_SALT") ?? "yiego-ai-support"));
  const { data, error } = await supabase.rpc("ai_support_rate_check", { p_ip_hash: ipHash });
  if (error) return jsonResponse({ error: "Support chat is briefly unavailable. Please try again in a moment.", code: "rate_check_failed" }, { status: 503 });
  if (data && data.allowed === false) return jsonResponse({ error: "You've reached the support-chat limit. Please wait a few minutes, or use Contact Support for anything urgent.", code: "rate_limited", scope: data.scope }, { status: 429, headers: { "Retry-After": String(data.retry_after ?? 300) } });
  return null;
}

/* ---- Gemini ---- */
type Msg = { role: "user" | "assistant"; content: string };
type Tool = { name: string; description: string; parameters: Record<string, unknown> };
async function geminiKey(supabase: SupabaseAdmin) { const { data } = await supabase.from("internal_secrets").select("value").eq("key", "gemini").maybeSingle(); return data?.value ?? Deno.env.get("GEMINI_API_KEY") ?? null; }
function providerError(status: number, payload: any) {
  const raw = String(payload?.error?.message ?? "Gemini request failed");
  const code = status === 400 && /api key/i.test(raw) ? "invalid_api_key" : status === 401 || status === 403 ? "provider_permission" : status === 429 ? "provider_limit" : status === 404 ? "model_unavailable" : "provider_error";
  const publicMessage = code === "invalid_api_key" ? "The Gemini API key is invalid or was revoked." : code === "provider_permission" ? "The Gemini account cannot use this model or request." : code === "provider_limit" ? "AI usage is temporarily limited." : code === "model_unavailable" ? "The configured Gemini model is unavailable." : "The AI provider rejected the request.";
  return { code, publicMessage, providerStatus: status, type: String(payload?.error?.status ?? "provider_error") };
}
async function callModel(supabase: SupabaseAdmin, input: { system: string; messages: Msg[]; maxTokens?: number; tools?: Tool[]; runTool?: (name: string, args: Record<string, unknown>) => Promise<unknown> }) {
  const apiKey = await geminiKey(supabase);
  if (!apiKey) throw Object.assign(new Error("The AI assistant is not configured."), { safeCode: "missing_api_key", providerStatus: 0, providerType: "missing_secret" });
  const model = DEFAULT_MODEL;
  const contents: Array<Record<string, unknown>> = input.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const toolsUsed: string[] = []; let usage: unknown = null;
  for (let round = 0; ; round++) {
    const offerTools = Boolean(input.tools?.length && input.runTool) && round < MAX_TOOL_ROUNDS;
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: input.system }] }, contents, generationConfig: { maxOutputTokens: input.maxTokens ?? 450, temperature: 0.4 } };
    if (offerTools) body.tools = [{ functionDeclarations: input.tools }];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) { const d = providerError(response.status, payload); console.error("Gemini provider error", { status: response.status, code: d.code }); throw Object.assign(new Error(d.publicMessage), { safeCode: d.code, providerStatus: d.providerStatus, providerType: d.type }); }
    usage = payload?.usageMetadata ?? usage;
    const parts: Array<Record<string, any>> = payload?.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (offerTools && calls.length) {
      contents.push({ role: "model", parts });
      const responses: Array<Record<string, unknown>> = [];
      for (const p of calls) {
        const name = String(p.functionCall.name ?? ""); toolsUsed.push(name);
        let output: unknown;
        try { output = await input.runTool!(name, (p.functionCall.args ?? {}) as Record<string, unknown>); } catch (e) { output = { error: e instanceof Error ? e.message : "The tool failed." }; }
        responses.push({ functionResponse: { name, response: { result: output ?? null } } });
      }
      contents.push({ role: "user", parts: responses });
      continue;
    }
    const text = parts.map((p) => String(p.text ?? "")).join("\n").trim();
    if (!text) throw Object.assign(new Error("The assistant returned an empty response."), { safeCode: "empty_response", providerStatus: 200, providerType: "empty_response" });
    return { text, model, usage, toolsUsed };
  }
}

async function loadAssistantSettings(supabase: SupabaseAdmin) { const { data } = await supabase.from("ai_assistant_settings").select("greeting, persona_notes").eq("id", true).maybeSingle(); return { greeting: data?.greeting || DEFAULT_GREETING, personaNotes: data?.persona_notes ?? "" }; }
async function loadActiveKnowledge(supabase: SupabaseAdmin) { const { data } = await supabase.from("ai_knowledge").select("category, title, content").eq("is_active", true).order("category").order("sort_order").order("created_at"); return (data ?? []) as KnowledgeEntry[]; }
function knowledgeText(entries: KnowledgeEntry[]) {
  if (!entries.length) return "";
  const by = new Map<string, KnowledgeEntry[]>(); for (const e of entries) { const l = by.get(e.category) ?? []; l.push(e); by.set(e.category, l); }
  return `KNOWLEDGE BASE (authoritative, maintained by the DataYego team):\n\n${[...by.entries()].map(([c, items]) => `## ${c}\n\n${items.map((i) => `### ${i.title}\n${i.content}`).join("\n\n")}`).join("\n\n")}`;
}
function buildSystemPrompt(personaNotes: string, knowledge: string) { let t = PERSONA; if (knowledge) t += `\n\n${knowledge}`; const n = personaNotes.trim(); if (n) t += `\n\nOWNER GUIDANCE (from the DataYego team; follow it, but never against the hard rules):\n${n}`; return t; }
function newConversationToken() { const b = new Uint8Array(16); crypto.getRandomValues(b); return "SC-" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase(); }
async function findConversation(supabase: SupabaseAdmin, token: string, userId: string | null) {
  if (token) { const { data } = await supabase.from("support_conversations").select("id, conversation_token, user_id, status").eq("conversation_token", token).maybeSingle<ConversationRow>(); if (data && (!data.user_id || data.user_id === userId)) return data; }
  if (userId) { const { data } = await supabase.from("support_conversations").select("id, conversation_token, user_id, status").eq("user_id", userId).neq("status", "closed").order("last_message_at", { ascending: false }).limit(1).maybeSingle<ConversationRow>(); if (data) return data; }
  return null;
}
function sanitizeClientHistory(history: RequestBody["history"]): Msg[] { if (!Array.isArray(history)) return []; return history.slice(-8).map((i) => ({ role: i.role === "assistant" ? "assistant" as const : "user" as const, content: String(i.content ?? "").slice(0, 1500) })).filter((i) => i.content); }

/* ---- Tools ---- */
function customerDeliveryStatus(orderStatus: string, paymentStatus: string, resolution: string | null) {
  if (paymentStatus === "refunded") return "refunded";
  if (paymentStatus !== "succeeded") return "waiting_for_payment";
  if (resolution === "awaiting_verification") return "mtn_verifying_number";
  if (resolution === "wrong_network") return "wrong_network";
  switch (orderStatus) { case "delivered": return "completed"; case "refunded": return "refunded"; case "cancelled": return "cancelled"; case "failed": case "failed_needs_review": return "needs_support"; default: return "in_progress"; }
}
function customerMessage(st: string) {
  return st === "waiting_for_payment" ? "Payment has not been completed for this order." : st === "completed" ? "The data has been delivered." : st === "refunded" ? "This order was refunded." : st === "cancelled" ? "This order was cancelled." : st === "needs_support" ? "This order needs the DataYego team; escalate." : st === "mtn_verifying_number" ? "Paid. MTN is verifying this number because it is receiving a bundle through DataYego for the first time; this can take up to a few days, then it delivers automatically. Future orders to the same number go through normally." : st === "wrong_network" ? "Paid, but the number is on a different network from the bundle. The customer can correct the number on the Track page." : "Paid and in progress; delivery is automatic.";
}
const TOOLS: Tool[] = [
  { name: "lookup_order", description: "Live status of a DataYego order by its reference (YG-... from datayego.com, AG-... from an agent's store). Returns the same customer-safe view as the Track page: masked recipient, network, bundle, amount, payment status, delivery status and a status message.", parameters: { type: "object", properties: { reference: { type: "string", description: "The order reference exactly as given, e.g. YG-1A2B3C4D5E" } }, required: ["reference"] } },
  { name: "quote_bundles", description: "Live DataYego bundle prices from the catalogue, optionally filtered by network and/or size in GB. Prices are base prices in GHS; a 4% fee applies to Paystack (MoMo/card) payments and is waived when paying from the DataYego wallet.", parameters: { type: "object", properties: { network: { type: "string", description: "MTN, Telecel or AirtelTigo" }, capacity_gb: { type: "number", description: "Size in GB, e.g. 5" } } } },
  { name: "escalate_to_human", description: "Hand the customer to the DataYego team on WhatsApp. Use for refunds, payments gone wrong, failed deliveries, account/security problems, or when a person is requested. Not for questions you can answer.", parameters: { type: "object", properties: { reason: { type: "string", description: "Short reason, e.g. refund request" } }, required: ["reason"] } },
];
const NETWORK_ALIASES: Record<string, string> = { mtn: "MTN", telecel: "Telecel", vodafone: "Telecel", airteltigo: "AirtelTigo", "airtel tigo": "AirtelTigo", at: "AirtelTigo", tigo: "AirtelTigo", airtel: "AirtelTigo" };
async function toolLookupOrder(supabase: SupabaseAdmin, args: Record<string, unknown>) {
  const reference = String(args?.reference ?? "").trim().toUpperCase();
  if (!reference) return { found: false, message: "No reference was given. Ask for the YG- or AG- order reference." };
  const { data: order, error } = await supabase.from("orders").select("order_reference, recipient_phone, amount, currency, status, payment_status, admin_resolution_status, paid_at, created_at, updated_at, data_products(name), networks(name), agents(store_name)").eq("order_reference", reference).limit(1).maybeSingle();
  if (error) return { found: false, error: "The order status could not be read right now. Point the customer to the Track page." };
  if (!order) return { found: false, reference, message: "No order matches that reference. Ask the customer to re-check it from their confirmation email." };
  const phone = String(order.recipient_phone ?? ""); const recipient = phone.length === 10 ? `${phone.slice(0, 3)}•••${phone.slice(7)}` : "hidden";
  const st = customerDeliveryStatus(String(order.status), String(order.payment_status), order.admin_resolution_status ?? null);
  return { found: true, reference: order.order_reference, network: (order.networks as any)?.name ?? null, bundle: (order.data_products as any)?.name ?? null, recipient, amount: order.amount, currency: order.currency, paymentStatus: order.payment_status, deliveryStatus: st, statusMessage: customerMessage(st), boughtOn: (order.agents as any)?.store_name ? `the agent store "${(order.agents as any).store_name}"` : "datayego.com", paidAt: order.paid_at, createdAt: order.created_at };
}
async function toolQuoteBundles(supabase: SupabaseAdmin, args: Record<string, unknown>) {
  const { data, error } = await supabase.from("data_products").select("name, capacity_gb, customer_price, validity, is_paused, networks(name, display_order)").eq("is_active", true).order("display_order", { ascending: true });
  if (error) return { error: "The catalogue could not be read right now." };
  const wanted = args?.network ? (NETWORK_ALIASES[String(args.network).trim().toLowerCase()] ?? String(args.network).trim()) : null;
  const wantGb = typeof args?.capacity_gb === "number" && Number.isFinite(args.capacity_gb) ? Number(args.capacity_gb) : null;
  let rows = (data ?? []).map((p: any) => ({ network: p.networks?.name ?? null, order: Number(p.networks?.display_order ?? 999), size: typeof p.name === "string" ? p.name.replace(/^.*?—\s*/, "") : p.name, capacity_gb: Number(p.capacity_gb), price: Number(p.customer_price), validity: p.validity || null, available: !p.is_paused }));
  if (wanted) rows = rows.filter((r) => (r.network ?? "").toLowerCase() === wanted.toLowerCase());
  if (wantGb !== null) rows = rows.filter((r) => Math.abs(r.capacity_gb - wantGb) < 0.01);
  rows.sort((a, b) => a.order - b.order || a.capacity_gb - b.capacity_gb);
  return { currency: "GHS", count: rows.length, bundles: rows.slice(0, 40).map(({ order: _o, ...r }) => r), priceNote: "Base prices on datayego.com. A 4% fee applies to Paystack (MoMo/card) payments and is waived when paying from the DataYego wallet. Agent stores set their own prices." };
}
async function toolEscalateToHuman(supabase: SupabaseAdmin, args: Record<string, unknown>, conversation: ConversationRow | null) {
  const reason = String(args?.reason ?? "").trim().slice(0, 300) || "The customer needs a person.";
  if (conversation) await supabase.from("support_conversations").update({ handoff_reason: reason, last_message_at: new Date().toISOString() }).eq("id", conversation.id);
  try { await sendEmail({ to: "support@yiego.shop", subject: `AI support escalation: ${reason}`, html: `<p>The AI assistant escalated a customer conversation.</p><p><strong>Reason:</strong> ${reason.replace(/</g, "&lt;")}</p><p><strong>Conversation:</strong> ${conversation?.conversation_token ?? "unknown"}</p><p>Read it in the <a href="https://datayego.com/admin/support-inbox">support inbox</a>; the customer was pointed to WhatsApp.</p>` }); } catch (e) { console.error("escalation email failed", e instanceof Error ? e.message : e); }
  return { escalated: true, channel: "whatsapp", instruction: "In one short sentence, tell the customer you're connecting them to the DataYego team on WhatsApp and that they can tap the WhatsApp button shown. Do not ask for personal or payment details." };
}
async function runTool(supabase: SupabaseAdmin, name: string, args: Record<string, unknown>, conversation: ConversationRow | null) {
  if (name === "lookup_order") return await toolLookupOrder(supabase, args);
  if (name === "quote_bundles") return await toolQuoteBundles(supabase, args);
  if (name === "escalate_to_human") return await toolEscalateToHuman(supabase, args, conversation);
  return { error: `Unknown tool: ${name}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    const url = new URL(req.url); if (url.searchParams.get("diagnostic") !== "provider") return jsonResponse({ status: "ok" });
    try { const r = await callModel(createSupabaseAdmin(), { system: "You are a connection test.", messages: [{ role: "user", content: "Reply with exactly: YIEGO_AI_READY" }], maxTokens: 20 }); return jsonResponse({ status: "ready", provider: "gemini", model: r.model }); }
    catch (e) { return jsonResponse({ status: "unavailable", code: (e as any)?.safeCode ?? "ai_unavailable", provider_status: (e as any)?.providerStatus ?? null, provider_type: (e as any)?.providerType ?? null, message: e instanceof Error ? e.message : "AI support is unavailable." }); }
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const body = await req.json() as RequestBody; const action = body.action ?? "health";

    if (action === "public_support") {
      const message = String(body.message ?? "").trim();
      if (!message || message.length > 1500) return jsonResponse({ error: "Enter a message of up to 1,500 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin();
      const limited = await enforcePublicRateLimit(req, supabase); if (limited) return limited;
      const userId = await optionalUserId(req, supabase);
      let conversation = await findConversation(supabase, String(body.conversation_token ?? "").trim(), userId); let isNew = false;
      if (!conversation) { const { data, error } = await supabase.from("support_conversations").insert({ conversation_token: newConversationToken(), user_id: userId }).select("id, conversation_token, user_id, status").single<ConversationRow>(); if (error || !data) throw new Error("Could not start the conversation."); conversation = data; isNew = true; }
      else { const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() }; if (!conversation.user_id && userId) { patch.user_id = userId; conversation.user_id = userId; } if (conversation.status === "closed") { patch.status = "ai"; conversation.status = "ai"; } await supabase.from("support_conversations").update(patch).eq("id", conversation.id); }
      const { error: insertError } = await supabase.from("support_messages").insert({ conversation_id: conversation.id, sender: "customer", body: message }); if (insertError) throw new Error("Could not save your message.");
      await supabase.from("support_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: messagePreview(message), last_message_sender: "customer" }).eq("id", conversation.id);
      if (conversation.status === "human") return jsonResponse({ status: "success", message: null, conversation_token: conversation.conversation_token, conversation_status: "human" });
      let modelMessages: Msg[];
      if (isNew) modelMessages = [...sanitizeClientHistory(body.history), { role: "user", content: message }];
      else { const { data: stored } = await supabase.from("support_messages").select("sender, body").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(MODEL_HISTORY_LIMIT); modelMessages = (stored ?? []).reverse().map((r) => ({ role: r.sender === "customer" ? "user" as const : "assistant" as const, content: String(r.body).slice(0, 4000) })); while (modelMessages.length && modelMessages[0].role !== "user") modelMessages.shift(); if (!modelMessages.length) modelMessages = [{ role: "user", content: message }]; }
      const [settings, knowledge] = await Promise.all([loadAssistantSettings(supabase), loadActiveKnowledge(supabase)]);
      const result = await callModel(supabase, { system: buildSystemPrompt(settings.personaNotes, knowledgeText(knowledge)), messages: modelMessages, maxTokens: 700, tools: TOOLS, runTool: (n, a) => runTool(supabase, n, a, conversation) });
      const escalated = result.toolsUsed.includes("escalate_to_human");
      await supabase.from("support_messages").insert({ conversation_id: conversation.id, sender: "assistant", body: result.text, meta: { model: result.model, usage: result.usage, knowledge_entries: knowledge.length, tools_used: result.toolsUsed, escalated } });
      await supabase.from("support_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: messagePreview(result.text), last_message_sender: "assistant" }).eq("id", conversation.id);
      return jsonResponse({ status: "success", message: result.text, conversation_token: conversation.conversation_token, conversation_status: "ai", model: result.model, escalated });
    }
    if (action === "conversation_history") {
      const supabase = createSupabaseAdmin(); const settings = await loadAssistantSettings(supabase); const userId = await optionalUserId(req, supabase);
      const conversation = await findConversation(supabase, String(body.conversation_token ?? "").trim(), userId);
      if (!conversation) return jsonResponse({ status: "success", greeting: settings.greeting, conversation: null, messages: [] });
      const { data: messages } = await supabase.from("support_messages").select("id, sender, body, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(HISTORY_PAGE_LIMIT);
      return jsonResponse({ status: "success", greeting: settings.greeting, conversation: { token: conversation.conversation_token, status: conversation.status }, messages: ((messages ?? []) as MessageRow[]).reverse() });
    }
    if (action === "close_conversation") {
      const token = String(body.conversation_token ?? "").trim(); if (!token) return jsonResponse({ error: "conversation_token is required" }, { status: 400 });
      const supabase = createSupabaseAdmin(); const userId = await optionalUserId(req, supabase); const c = await findConversation(supabase, token, userId);
      if (c) await supabase.from("support_conversations").update({ status: "closed" }).eq("id", c.id); return jsonResponse({ status: "success" });
    }

    const auth = await requireActiveAdmin(req); if (auth.error) return auth.error;
    if (action === "health") { const r = await callModel(createSupabaseAdmin(), { system: "You are a connection test. Follow the instruction exactly.", messages: [{ role: "user", content: "Reply with exactly: YIEGO_AI_READY" }], maxTokens: 20 }); return jsonResponse({ status: r.text.includes("YIEGO_AI_READY") ? "ready" : "unexpected_response", provider: "gemini", model: r.model }); }
    if (action === "get_assistant_settings") { const s = await loadAssistantSettings(createSupabaseAdmin()); return jsonResponse({ status: "success", greeting: s.greeting, persona_notes: s.personaNotes }); }
    if (action === "update_assistant_settings") {
      const greeting = String(body.greeting ?? "").trim(); const personaNotes = String(body.persona_notes ?? "").trim();
      if (!greeting || greeting.length > 300) return jsonResponse({ error: "Enter a greeting of up to 300 characters." }, { status: 400 });
      if (personaNotes.length > 4000) return jsonResponse({ error: "Keep the tone notes under 4,000 characters." }, { status: 400 });
      const { error } = await createSupabaseAdmin().from("ai_assistant_settings").upsert({ id: true, greeting, persona_notes: personaNotes, updated_by: auth.userId }); if (error) throw new Error("Could not save the assistant settings."); return jsonResponse({ status: "success" });
    }
    if (action === "test_customer_reply") {
      const message = String(body.message ?? "").trim(); if (!message || message.length > 1500) return jsonResponse({ error: "Enter a message of up to 1,500 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin(); const [settings, knowledge] = await Promise.all([loadAssistantSettings(supabase), loadActiveKnowledge(supabase)]);
      const r = await callModel(supabase, { system: buildSystemPrompt(settings.personaNotes, knowledgeText(knowledge)), messages: [...sanitizeClientHistory(body.history), { role: "user", content: message }], maxTokens: 700, tools: TOOLS, runTool: (n, a) => runTool(supabase, n, a, null) });
      return jsonResponse({ status: "success", message: r.text, model: r.model, tools_used: r.toolsUsed });
    }
    if (action === "list_knowledge") { const { data, error } = await createSupabaseAdmin().from("ai_knowledge").select("id, category, title, content, is_active, sort_order, updated_at").order("category").order("sort_order").order("created_at"); if (error) throw new Error("Could not load the knowledge base."); return jsonResponse({ status: "success", entries: data ?? [] }); }
    if (action === "save_knowledge") {
      const category = String(body.category ?? "").trim(); const title = String(body.title ?? "").trim(); const content = String(body.content ?? "").trim(); const isActive = body.is_active !== false;
      if (!category || category.length > 60) return jsonResponse({ error: "Enter a category of up to 60 characters." }, { status: 400 });
      if (!title || title.length > 200) return jsonResponse({ error: "Enter a title of up to 200 characters." }, { status: 400 });
      if (!content || content.length > 4000) return jsonResponse({ error: "Enter content of up to 4,000 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin(); const row = { category, title, content, is_active: isActive, updated_by: auth.userId, ...(typeof body.sort_order === "number" ? { sort_order: Math.trunc(body.sort_order) } : {}) };
      const q = body.id ? supabase.from("ai_knowledge").update(row).eq("id", String(body.id)) : supabase.from("ai_knowledge").insert(row);
      const { data, error } = await q.select("id, category, title, content, is_active, sort_order, updated_at").maybeSingle(); if (error || !data) throw new Error("Could not save the knowledge entry."); return jsonResponse({ status: "success", entry: data });
    }
    if (action === "delete_knowledge") { if (!body.id) return jsonResponse({ error: "id is required" }, { status: 400 }); const { error } = await createSupabaseAdmin().from("ai_knowledge").delete().eq("id", String(body.id)); if (error) throw new Error("Could not delete the knowledge entry."); return jsonResponse({ status: "success" }); }
    if (action === "preview_knowledge") { const entries = await loadActiveKnowledge(createSupabaseAdmin()); const text = knowledgeText(entries); return jsonResponse({ status: "success", text, active_entries: entries.length, approx_tokens: Math.round(text.length / 4) }); }
    if (action === "inbox_list") {
      const supabase = createSupabaseAdmin(); const { data, error } = await supabase.from("support_conversations").select("id, conversation_token, user_id, status, handoff_reason, assigned_admin, last_message_at, admin_last_seen_at, last_message_preview, last_message_sender, created_at").order("last_message_at", { ascending: false }).limit(150);
      if (error) throw new Error("Could not load the inbox."); const conversations = data ?? [];
      const userIds = [...new Set(conversations.map((c) => c.user_id).filter(Boolean))] as string[]; const profiles = new Map<string, { full_name: string | null; email: string | null }>();
      if (userIds.length) { const { data: rows } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds); for (const r of rows ?? []) profiles.set(r.id, { full_name: r.full_name, email: r.email }); }
      return jsonResponse({ status: "success", conversations: conversations.map((c) => ({ ...c, customer: c.user_id ? profiles.get(c.user_id) ?? null : null })) });
    }
    if (action === "inbox_conversation") {
      if (!body.id) return jsonResponse({ error: "id is required" }, { status: 400 }); const supabase = createSupabaseAdmin();
      const { data: conversation, error } = await supabase.from("support_conversations").select("id, conversation_token, user_id, status, handoff_reason, assigned_admin, last_message_at, created_at").eq("id", String(body.id)).maybeSingle();
      if (error || !conversation) return jsonResponse({ error: "Conversation not found." }, { status: 404 });
      const { data: messages } = await supabase.from("support_messages").select("id, sender, body, meta, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(100);
      await supabase.from("support_conversations").update({ admin_last_seen_at: new Date().toISOString() }).eq("id", conversation.id);
      let customer: { full_name: string | null; email: string | null } | null = null;
      if (conversation.user_id) { const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", conversation.user_id).maybeSingle(); customer = p ?? null; }
      return jsonResponse({ status: "success", conversation: { ...conversation, customer }, messages: (messages ?? []).reverse() });
    }
    if (action === "take_over" || action === "return_to_ai" || action === "admin_close") {
      if (!body.id) return jsonResponse({ error: "id is required" }, { status: 400 });
      const patch = action === "take_over" ? { status: "human", assigned_admin: auth.userId } : action === "return_to_ai" ? { status: "ai", assigned_admin: null } : { status: "closed" };
      const { data, error } = await createSupabaseAdmin().from("support_conversations").update(patch).eq("id", String(body.id)).select("id, status, assigned_admin").maybeSingle(); if (error || !data) throw new Error("The conversation could not be updated."); return jsonResponse({ status: "success", conversation: data });
    }
    if (action === "admin_reply") {
      const reply = String(body.message ?? "").trim(); if (!body.id) return jsonResponse({ error: "id is required" }, { status: 400 }); if (!reply || reply.length > 2000) return jsonResponse({ error: "Enter a reply of up to 2,000 characters." }, { status: 400 });
      const supabase = createSupabaseAdmin(); const { data: conversation } = await supabase.from("support_conversations").select("id, status").eq("id", String(body.id)).maybeSingle(); if (!conversation) return jsonResponse({ error: "Conversation not found." }, { status: 404 });
      const { data: inserted, error: insertError } = await supabase.from("support_messages").insert({ conversation_id: conversation.id, sender: "admin", body: reply, meta: { admin: auth.userId } }).select("id, sender, body, created_at").maybeSingle(); if (insertError || !inserted) throw new Error("The reply could not be sent.");
      await supabase.from("support_conversations").update({ status: "human", assigned_admin: auth.userId, last_message_at: new Date().toISOString(), admin_last_seen_at: new Date().toISOString(), last_message_preview: messagePreview(reply), last_message_sender: "admin" }).eq("id", conversation.id);
      return jsonResponse({ status: "success", message: inserted, conversation_status: "human" });
    }
    if (action !== "rewrite_support") return jsonResponse({ error: "Unsupported action" }, { status: 400 });
    const draft = String(body.draft ?? "").trim(); if (!draft || draft.length > 4000) return jsonResponse({ error: "Enter a support draft of up to 4,000 characters." }, { status: 400 });
    const verifiedFacts = body.verifiedFacts && typeof body.verifiedFacts === "object" ? body.verifiedFacts : {}; const instruction = String(body.instruction ?? "Make the message clear, warm and professional.").trim().slice(0, 500);
    const r = await callModel(createSupabaseAdmin(), { system: "You rewrite customer-support messages for DataYego. Use only supplied verified facts and the safe draft. Do not invent payment, delivery, refund, supplier, account or policy facts. Do not expose internal notes or technical details. Return only a concise, professional customer message.", messages: [{ role: "user", content: `VERIFIED FACTS:\n${JSON.stringify(verifiedFacts, null, 2)}\n\nSAFE DRAFT:\n${draft}\n\nSTYLE REQUEST:\n${instruction}` }], maxTokens: 420 });
    return jsonResponse({ status: "success", message: r.text, provider: "gemini", model: r.model, usage: r.usage });
  } catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : "AI support is unavailable.", code: (error as any)?.safeCode ?? "ai_unavailable" }, { status: 503 }); }
});
