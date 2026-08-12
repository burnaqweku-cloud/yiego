import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function jsonResponse(body: unknown, init: ResponseInit = {}) { return new Response(JSON.stringify(body), { ...init, headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) } }); }
function createSupabaseAdmin() { const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (!url || !key) throw new Error("Backend is not configured"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "phase1" } }); }

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

type RequestBody = { action?: "health" | "rewrite_support" | "public_support"; draft?: string; verifiedFacts?: Record<string, unknown>; instruction?: string; message?: string; history?: Array<{ role?: string; content?: string }>; };

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
async function enforcePublicRateLimit(req: Request, supabase: ReturnType<typeof createSupabaseAdmin>) {
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
      const history = Array.isArray(body.history) ? body.history.slice(-8).map((item) => ({ role: item.role === "assistant" ? "assistant" as const : "user" as const, content: String(item.content ?? "").slice(0, 1500) })).filter((item) => item.content) : [];
      const system = `You are YieGo's 24/7 AI support assistant for a Ghanaian data-bundle platform. Be concise, calm and helpful. Explain general ordering, payment, wallet, tracking, pending-order, shared-payment and dispute processes. Never claim to have checked an order, payment, wallet, account or delivery unless verified data was supplied by the system. Never invent transaction results, delivery times, refunds, supplier causes or policies. Never request passwords, one-time codes, card numbers, mobile-money PINs or API keys. For a specific order, ask the customer to use Track Order with their YG reference. For unresolved account, payment or delivery matters, direct them to Contact Support. Do not mention internal suppliers, databases, APIs or technical infrastructure. Return only the customer-facing answer.`;
      const result = await callClaude({ system, messages: [...history, { role: "user", content: message }], maxTokens: 500 });
      return jsonResponse({ status: "success", message: result.text, model: result.model });
    }
    const auth = await requireActiveAdmin(req); if (auth.error) return auth.error;
    if (action === "health") {
      const result = await callClaude({ system: "You are a connection test. Follow the instruction exactly.", messages: [{ role: "user", content: "Reply with exactly: YIEGO_AI_READY" }], maxTokens: 20 });
      return jsonResponse({ status: result.text.includes("YIEGO_AI_READY") ? "ready" : "unexpected_response", provider: "anthropic", model: result.model });
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
