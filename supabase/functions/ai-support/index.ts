import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.5-flash";

type RequestBody = {
  action?: "health" | "rewrite_support" | "public_support";
  draft?: string;
  verifiedFacts?: Record<string, unknown>;
  instruction?: string;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

async function requireActiveAdmin(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { error: jsonResponse({ error: "Authentication required" }, { status: 401 }) };

  const supabase = createSupabaseAdmin();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return { error: jsonResponse({ error: "Invalid session" }, { status: 401 }) };

  const { data: admin } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!admin) return { error: jsonResponse({ error: "Admin access required" }, { status: 403 }) };
  return { userId: authData.user.id };
}

async function callClaude(input: { system: string; prompt: string; maxTokens?: number }) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const model = DEFAULT_MODEL;
  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 350,
      temperature: 0.2,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 429) throw new Error("AI rate limit reached. Please try again shortly.");
    if (response.status === 402) throw new Error("AI credits exhausted. Add credits in Settings.");
    const message = payload?.error?.message || `AI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const text = String(payload?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("The AI returned an empty response");
  return { text, model, usage: payload?.usage ?? null };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const auth = await requireActiveAdmin(req);
    if (auth.error) return auth.error;

    const body = (await req.json()) as RequestBody;
    const action = body.action ?? "health";

    if (action === "health") {
      const result = await callClaude({
        system: "You are a connection test. Follow the user instruction exactly.",
        prompt: "Reply with exactly: YIEGO_AI_READY",
        maxTokens: 20,
      });
      return jsonResponse({
        status: result.text.includes("YIEGO_AI_READY") ? "ready" : "unexpected_response",
        provider: "lovable-ai",
        model: result.model,
      });
    }

    if (action !== "rewrite_support") return jsonResponse({ error: "Unsupported action" }, { status: 400 });

    const draft = String(body.draft ?? "").trim();
    if (!draft) return jsonResponse({ error: "A support draft is required" }, { status: 400 });
    if (draft.length > 4000) return jsonResponse({ error: "The support draft is too long" }, { status: 400 });

    const verifiedFacts = body.verifiedFacts && typeof body.verifiedFacts === "object" ? body.verifiedFacts : {};
    const instruction = String(body.instruction ?? "Make the message clear, warm and professional.").trim().slice(0, 500);

    const system = `You rewrite customer-support messages for YieGo, a Ghanaian data-bundle platform.
Use only the supplied verified facts and draft.
Do not invent or infer a payment confirmation, delivery time, refund promise, supplier cause, account detail, policy, compensation, or action not explicitly present.
Do not expose internal notes, supplier credentials, technical stack traces, API details, or private information.
Keep the response concise, polite and natural for a customer in Ghana.
Preserve the order reference and important next steps.
Return only the finished customer message, with no heading, analysis or quotation marks.`;

    const prompt = `VERIFIED FACTS:\n${JSON.stringify(verifiedFacts, null, 2)}\n\nCURRENT SAFE DRAFT:\n${draft}\n\nSTYLE REQUEST:\n${instruction}`;
    const result = await callClaude({ system, prompt, maxTokens: 420 });

    return jsonResponse({
      status: "success",
      message: result.text,
      provider: "lovable-ai",
      model: result.model,
      usage: result.usage,
    });
  } catch (error) {
    console.error("ai-support error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "AI support failed" }, { status: 500 });
  }
});
