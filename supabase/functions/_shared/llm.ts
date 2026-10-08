/* One model layer for every DataYego assistant (ai-support, agent-assistant, store-chat-ai).
   Provider and model come from phase1.site_settings key 'ai_provider':
     { "provider": "groq" | "openrouter" | "mistral" | "gemini", "model": "openai/gpt-oss-120b" }
   Keys live in phase1.internal_secrets under the provider's name (groq, openrouter, mistral, gemini).
   groq / openrouter / mistral speak the OpenAI chat format (tools included); gemini keeps its own shape.
   Switching provider is a settings change, no redeploy. */

// deno-lint-ignore no-explicit-any
type Db = any;
export type LlmMsg = { role: "user" | "assistant"; content: string };
export type LlmTool = { name: string; description: string; parameters: Record<string, unknown> };
export type LlmResult = { text: string; model: string; provider: string; usage: unknown; toolsUsed: string[] };
export class LlmError extends Error { code: string; providerStatus: number; retryAfter: number | null = null; constructor(message: string, code: string, providerStatus = 0) { super(message); this.code = code; this.providerStatus = providerStatus; } }

const DEFAULTS: Record<string, { url: string; model: string }> = {
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-120b" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-2.5-flash" },
  mistral: { url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-large-latest" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash" },
};

export async function llmConfig(db: Db): Promise<{ provider: string; model: string; key: string | null; keyId: string | null }> {
  const { data: s } = await db.from("site_settings").select("value").eq("key", "ai_provider").maybeSingle();
  const provider = String(s?.value?.provider ?? "groq"); const model = String(s?.value?.model ?? DEFAULTS[provider]?.model ?? DEFAULTS.groq.model);
  const picked = await pickKey(db, provider);
  return { provider, model, key: picked?.key ?? null, keyId: picked?.id ?? null };
}
/* Key pool: several keys per provider (phase1.ai_provider_keys), least-recently-used first, a key that hit
   a rate limit cools down for the seconds the provider asked for. One limit-hit retries at once on the next key. */
async function pickKey(db: Db, provider: string): Promise<{ id: string; key: string } | null> {
  const { data } = await db.rpc("ai_key_pick", { p_provider: provider });
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.key) return { id: String(row.id), key: String(row.key) };
  const { data: k } = await db.from("internal_secrets").select("value").eq("key", provider).maybeSingle();
  return k?.value ? { id: "", key: String(k.value) } : null;
}
async function reportKey(db: Db, id: string | null, ok: boolean, cooldownSeconds: number | null = null, error: string | null = null) {
  if (!id) return;
  try { await db.rpc("ai_key_report", { p_id: id, p_ok: ok, p_cooldown_seconds: cooldownSeconds, p_error: error }); } catch { /* bookkeeping only */ }
}
function retryAfterSeconds(r: Response, raw: string) {
  const h = Number(r.headers.get("retry-after")); if (Number.isFinite(h) && h > 0) return Math.ceil(h);
  const m = raw.match(/try again in\s+(?:(\d+)m)?\s*([\d.]+)s/i); if (m) return Math.ceil(Number(m[1] ?? 0) * 60 + Number(m[2]));
  const d = raw.match(/retry in\s+(\d+)h(\d+)m/i); if (d) return Number(d[1]) * 3600 + Number(d[2]) * 60;
  return /per day|TPD|RPD|daily/i.test(raw) ? 3600 : 60;
}

function classify(status: number, raw: string) {
  if (status === 429) return { code: "provider_limit", message: "The assistant is busy right now. Try again in a little while." };
  if (status === 401 || status === 403 || /api key/i.test(raw)) return { code: "invalid_api_key", message: "The assistant's key is invalid or was revoked." };
  if (status === 404 || /model/i.test(raw) && /not (found|exist)/i.test(raw)) return { code: "model_unavailable", message: "The configured assistant model is unavailable." };
  if (status === 402) return { code: "provider_billing", message: "The assistant's credits are exhausted." };
  return { code: "provider_error", message: "The assistant could not answer right now." };
}

/** Run one chat turn with optional tool calling. runTool executes a tool and returns its JSON result. */
export async function chat(db: Db, input: { system: string; messages: LlmMsg[]; maxTokens?: number; temperature?: number; tools?: LlmTool[]; runTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>; maxToolRounds?: number }): Promise<LlmResult> {
  // Up to 3 keys tried per request: a key that answers 429 is cooled down and the next one is used at once.
  let lastErr: LlmError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const cfg = await llmConfig(db);
    if (!cfg.key) throw lastErr ?? new LlmError("The assistant is not configured.", "missing_api_key");
    try {
      const r = cfg.provider === "gemini" ? await geminiChat(cfg, input, input.maxToolRounds ?? 4) : await openaiChat(cfg, input, input.maxToolRounds ?? 4);
      await reportKey(db, cfg.keyId, true);
      return r;
    } catch (e) {
      if (e instanceof LlmError && e.code === "provider_limit") { await reportKey(db, cfg.keyId, false, e.retryAfter ?? 60, e.message); lastErr = e; continue; }
      if (e instanceof LlmError && (e.code === "invalid_api_key" || e.code === "provider_billing")) { await reportKey(db, cfg.keyId, false, 86400, e.message); lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr ?? new LlmError("The assistant is busy right now. Try again in a little while.", "provider_limit");
}

async function openaiChat(cfg: { provider: string; model: string; key: string | null }, input: Parameters<typeof chat>[1], maxRounds: number): Promise<LlmResult> {

  const url = DEFAULTS[cfg.provider]?.url ?? DEFAULTS.groq.url;
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: input.system }, ...input.messages.map((m) => ({ role: m.role, content: m.content }))];
  const tools = input.tools?.length && input.runTool ? input.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) : null;
  const toolsUsed: string[] = []; let usage: unknown = null;
  for (let round = 0; ; round++) {
    const offer = Boolean(tools) && round < maxRounds;
    const body: Record<string, unknown> = { model: cfg.model, messages, max_tokens: input.maxTokens ?? 600, temperature: input.temperature ?? 0.4 };
    if (offer) { body.tools = tools; body.tool_choice = "auto"; }
    const headers: Record<string, string> = { "content-type": "application/json", Authorization: `Bearer ${cfg.key}` };
    if (cfg.provider === "openrouter") { headers["HTTP-Referer"] = "https://datayego.com"; headers["X-Title"] = "DataYego"; }
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const p = await r.json().catch(() => null);
    if (!r.ok) { const raw = String(p?.error?.message ?? ""); const c = classify(r.status, raw); console.error("llm provider error", { provider: cfg.provider, status: r.status, code: c.code, message: raw.slice(0, 200) }); const err = new LlmError(c.message, c.code, r.status); if (c.code === "provider_limit") err.retryAfter = retryAfterSeconds(r, raw); throw err; }
    usage = p?.usage ?? usage;
    const msg = p?.choices?.[0]?.message ?? {};
    // deno-lint-ignore no-explicit-any
    const calls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (offer && calls.length) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.function?.name, arguments: c.function?.arguments ?? "{}" } })) });
      for (const c of calls) {
        const name = String(c.function?.name ?? ""); toolsUsed.push(name);
        let args: Record<string, unknown> = {}; try { args = JSON.parse(c.function?.arguments || "{}"); } catch { args = {}; }
        let out: unknown; try { out = await input.runTool!(name, args); } catch (e) { out = { error: e instanceof Error ? e.message : "The tool failed." }; }
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out ?? null) });
      }
      continue;
    }
    const text = String(msg.content ?? "").trim();
    if (!text) throw new LlmError("The assistant returned an empty response.", "empty_response", 200);
    return { text, model: cfg.model, provider: cfg.provider, usage, toolsUsed };
  }
}

async function geminiChat(cfg: { model: string; key: string | null }, input: Parameters<typeof chat>[1], maxRounds: number): Promise<LlmResult> {
  const contents: Array<Record<string, unknown>> = input.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const toolsUsed: string[] = []; let usage: unknown = null;
  for (let round = 0; ; round++) {
    const offer = Boolean(input.tools?.length && input.runTool) && round < maxRounds;
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: input.system }] }, contents, generationConfig: { maxOutputTokens: input.maxTokens ?? 600, temperature: input.temperature ?? 0.4 } };
    if (offer) body.tools = [{ functionDeclarations: input.tools }];
    const r = await fetch(`${DEFAULTS.gemini.url}/${cfg.model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": cfg.key ?? "" }, body: JSON.stringify(body) });
    const p = await r.json().catch(() => null);
    if (!r.ok) { const raw = String(p?.error?.message ?? ""); const c = classify(r.status, raw); console.error("llm provider error", { provider: "gemini", status: r.status, code: c.code }); const err = new LlmError(c.message, c.code, r.status); if (c.code === "provider_limit") err.retryAfter = retryAfterSeconds(r, raw); throw err; }
    usage = p?.usageMetadata ?? usage;
    // deno-lint-ignore no-explicit-any
    const parts: Array<Record<string, any>> = p?.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((x) => x.functionCall);
    if (offer && calls.length) {
      contents.push({ role: "model", parts });
      const responses: Array<Record<string, unknown>> = [];
      for (const c of calls) { const name = String(c.functionCall.name ?? ""); toolsUsed.push(name); let out: unknown; try { out = await input.runTool!(name, (c.functionCall.args ?? {}) as Record<string, unknown>); } catch (e) { out = { error: e instanceof Error ? e.message : "The tool failed." }; } responses.push({ functionResponse: { name, response: { result: out ?? null } } }); }
      contents.push({ role: "user", parts: responses }); continue;
    }
    const text = parts.map((x) => String(x.text ?? "")).join("\n").trim();
    if (!text) throw new LlmError("The assistant returned an empty response.", "empty_response", 200);
    return { text, model: cfg.model, provider: "gemini", usage, toolsUsed };
  }
}

/* ---- Knowledge retrieval: send only what the question is about, not the whole base. ----
   Simple and dependable: score each entry by word overlap with the question (and the last turn),
   boost title matches, keep the best few. Keeps every call small enough for free-tier token limits. */
const STOP = new Set("a an the and or of to in on for is it i my me you your we our this that what how do does can with at by from be as are was were will not no yes please about any some up out get got have has had".split(" "));
function words(t: string) { return (t.toLowerCase().match(/[a-z0-9₵]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")); }
export function pickRelevant<T extends { title: string; content: string; category?: string }>(items: T[], query: string, max = 8, context = ""): T[] {
  const q = new Set(words(query)); const c = new Set(words(context));
  if (q.size === 0) return items.slice(0, max);
  const scored = items.map((it) => {
    const tw = words(it.title); const cw = words(it.content);
    let s = 0;
    for (const w of tw) { if (q.has(w)) s += 3; else if (c.has(w)) s += 1; }
    const seen = new Set<string>();
    for (const w of cw) { if (seen.has(w)) continue; seen.add(w); if (q.has(w)) s += 1; else if (c.has(w)) s += 0.25; }
    return { it, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, max).map((x) => x.it);
}
