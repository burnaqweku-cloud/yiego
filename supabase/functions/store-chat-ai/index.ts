import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { chat as llmChat, llmConfig, type LlmMsg } from "../_shared/llm.ts";

/* AI first responder for an agent store's chat (model via the shared provider layer, _shared/llm.ts).
   { conversationId, visitor }      -> reply to the customer's latest message (visitor key or signed-in owner of the thread)
   { action: "test", question }     -> agent JWT: answer one question with that agent's store context; nothing stored
   Platform facts (orders, delivery, prices, payments) come from DataYego; the agent's own knowledge
   (phase1.store_ai_knowledge + About/hours/FAQ) adds to them and never overrides them. */
type Agent = { id: string; slug: string; store_name: string; tagline: string | null; about_text: string | null; hours_text: string | null; faq: Array<{ q: string; a: string }> | null; whatsapp: string | null; support_ai_on: boolean | null; support_whatsapp_url: string | null };

// deno-lint-ignore no-explicit-any
const storeUrlOf = (a: Agent & { custom_domain?: string | null; custom_domain_status?: string | null }) => a.custom_domain && a.custom_domain_status === "active" ? `https://${a.custom_domain}` : `https://${a.slug}.datayego.com`;
const REF_RE = /\b(AG|YG)-[A-Z0-9]{6,12}\b/gi;
async function buildSystem(supabase: any, agent: Agent, userId: string | null, mentioned: string[] = []) {
  const { data: store } = await supabase.rpc("agent_store", { p_slug: agent.slug, p_preview: true });
  const { data: products } = await supabase.from("data_products").select("id, name, validity").eq("is_active", true);
  const prices = (products ?? []).map((p: { id: string; name: string; validity: string | null }) => `${p.name.replace(" Data \u2014 ", " ")}: GHS ${Number(store?.prices?.[p.id] ?? 0).toFixed(2)}${p.validity ? ` (${p.validity})` : ""}`).join("\n");
  const { data: speed } = await supabase.rpc("delivery_speed_by_network");
  let orders = "";
  if (userId) {
    const { data: o } = await supabase.from("orders").select("order_reference, recipient_phone, amount, status, payment_status, admin_resolution_status, paid_at, data_products(name), networks(name)").eq("user_id", userId).eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(5);
    orders = (o ?? []).map((x: { order_reference: string; recipient_phone: string; amount: number; status: string; payment_status: string; admin_resolution_status: string | null; paid_at: string | null; data_products: { name: string } | null; networks: { name: string } | null }) => `${x.order_reference}: ${x.networks?.name} ${String(x.data_products?.name ?? "").replace(/^.*?\u2014\s*/, "")} to ${x.recipient_phone}, GHS ${Number(x.amount).toFixed(2)}, ${x.payment_status === "refunded" ? "refunded" : x.payment_status !== "succeeded" ? "not paid" : x.admin_resolution_status === "awaiting_verification" ? "waiting for MTN to verify the number" : x.admin_resolution_status === "wrong_network" ? "wrong network, customer can fix the number on the Track page" : x.status === "delivered" ? "delivered" : x.status === "failed" ? "failed, needs the store" : "in progress"}${x.paid_at ? `, paid ${new Date(x.paid_at).toLocaleString("en-GB")}` : ""}`).join("\n");
  }
  let looked = "";
  if (mentioned.length) {
    const { data: lo } = await supabase.from("orders").select("order_reference, recipient_phone, amount, status, payment_status, admin_resolution_status, paid_at, created_at, data_products(name), networks(name)").eq("agent_id", agent.id).in("order_reference", mentioned.slice(0, 5));
    const found = new Set((lo ?? []).map((x: { order_reference: string }) => x.order_reference));
    looked = (lo ?? []).map((x: { order_reference: string; recipient_phone: string; amount: number; status: string; payment_status: string; admin_resolution_status: string | null; paid_at: string | null; created_at: string; data_products: { name: string } | null; networks: { name: string } | null }) => `${x.order_reference}: ${x.networks?.name} ${String(x.data_products?.name ?? "").replace(/^.*?\u2014\s*/, "")} to ${x.recipient_phone.slice(0, 3)}***${x.recipient_phone.slice(-3)}, GHS ${Number(x.amount).toFixed(2)}, ${x.payment_status === "refunded" ? "refunded" : x.payment_status !== "succeeded" ? "NOT PAID (customer should finish payment on the Track page)" : x.admin_resolution_status === "awaiting_verification" ? "paid; MTN is verifying this number (first bundle to it), can take days, then delivers automatically" : x.admin_resolution_status === "wrong_network" ? "paid but the number is on a different network; customer can fix the number on the Track page" : x.status === "delivered" ? "DELIVERED" : String(x.status).startsWith("failed") ? "failed; hand over to the store" : "paid and in progress; delivery is automatic"}${x.paid_at ? `, paid ${new Date(x.paid_at).toLocaleString("en-GB")}` : `, placed ${new Date(x.created_at).toLocaleString("en-GB")}`}`).join("\n")
      + mentioned.filter((m) => !found.has(m)).map((m) => `\n${m}: no order with this ID on this store (ask them to check the ID from their receipt email; it may be from another shop)`).join("");
  }
  const { data: kn } = await supabase.from("store_ai_knowledge").select("title, content").eq("agent_id", agent.id).eq("is_active", true).order("sort_order").limit(20);
  const knowledge = (kn ?? []).map((k: { title: string; content: string }) => `### ${k.title}\n${k.content}`).join("\n\n");
  const faq = ((agent.faq ?? []) as Array<{ q: string; a: string }>).map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n");
  const url = storeUrlOf(agent as Agent & { custom_domain?: string | null; custom_domain_status?: string | null });
  return `You are the support assistant for "${agent.store_name}", a Ghanaian data-bundle shop. Reply in short, warm, plain English (1\u20134 sentences). Never mention AI, suppliers, DataYego, or internal systems; you speak for the store.

STORE
Name: ${agent.store_name}
${agent.tagline ? `Tagline: ${agent.tagline}\n` : ""}${agent.about_text ? `About: ${agent.about_text}\n` : ""}${agent.hours_text ? `Support hours (when a person replies on WhatsApp): ${agent.hours_text}\n` : ""}WhatsApp: ${agent.support_whatsapp_url ?? (agent.whatsapp ?? "not given")}
The store sells and delivers automatically 24/7.

PLATFORM FACTS (always correct; if the store's own notes below disagree with these on orders, delivery, prices or payments, these win)
PRICES (what the customer pays here)
${prices}

DELIVERY RIGHT NOW
MTN: ${speed?.MTN ? (speed.MTN.sample === 0 ? "delivering normally" : `about ${Math.round(speed.MTN.median_minutes)} min${speed.MTN.at_least ? " or more" : ""}`) : "delivering normally"}. Telecel and AirtelTigo: usually minutes. MTN numbers receiving a bundle for the first time are verified by MTN first, which can take days; customers can check a number on the store's Check MTN page.
Payments: MoMo or card (Paystack) or the customer's wallet. A delivered bundle cannot be reversed even if the number was wrong.

LINKS (give these when useful, as markdown links, e.g. [Track page](${url}/track))
Track page: ${url}/track · Bundles: ${url}/bundles · Check an MTN number: ${url}/check-mtn · Home: ${url}${agent.support_whatsapp_url ? ` · WhatsApp: ${agent.support_whatsapp_url}` : ""}

${looked ? `ORDERS THE CUSTOMER MENTIONED (live, this store only)\n${looked}\n\n` : ""}${orders ? `THIS CUSTOMER'S RECENT ORDERS (signed in)\n${orders}\n\n` : ""}${!orders && !looked ? "You can check any order of this store if the customer gives you the order ID (starts with AG-); ask for it. Without an ID you cannot see orders.\n\n" : ""}${faq ? `STORE FAQ\n${faq}\n\n` : ""}${knowledge ? `THE STORE'S OWN NOTES (written by the store owner; use them for anything about this business: support, hours, offers, how to reach them)\n${knowledge}\n\n` : ""}RULES
- Help with: prices, how to buy, delivery times, tracking, checking an order by its ID, MTN verification, contact, and anything in the store's notes. When you point to a page, include its link.
- If the customer asks for a person / human / agent / to be connected, do NOT hand over yet: in one or two sentences say what you can do for them right now (check an order by its ID, quote prices, delivery times, MTN verification) and ask if they'd still like to be connected. If they then confirm in any way (yes, connect me, please, go ahead, I still want a person, etc.), reply with exactly the word HANDOVER and nothing else.
- HAND OVER immediately (reply with exactly the word HANDOVER and nothing else) for: refunds, double payment, money deducted without delivery, changing a delivered order, complaints you can't verify, or anything you're unsure about.
- Never promise refunds or delivery times you can't see. Never invent order details.`;
}

// deno-lint-ignore no-explicit-any
async function answer(db: any, system: string, history: LlmMsg[]) {
  try { const r = await llmChat(db, { system, messages: history, maxTokens: 350, temperature: 0.4 }); return { ok: true as const, text: r.text }; }
  catch (e) { return { ok: false as const, status: (e as { providerStatus?: number })?.providerStatus ?? 500 }; }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const supabase = createSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    const apiKey = (await llmConfig(supabase)).key;
    const AGENT_COLS = "id, slug, store_name, tagline, about_text, hours_text, faq, whatsapp, support_ai_on, support_whatsapp_url, custom_domain, custom_domain_status";

    if (body.action === "test") {
      if (!auth?.user) return jsonResponse({ error: "Sign in required" }, { status: 401 });
      const { data: agent } = await supabase.from("agents").select(AGENT_COLS).eq("user_id", auth.user.id).maybeSingle();
      if (!agent) return jsonResponse({ error: "Not an agent" }, { status: 403 });
      const question = String(body.question ?? "").trim().slice(0, 500); if (!question) return jsonResponse({ error: "Ask something." }, { status: 400 });
      if (!apiKey) return jsonResponse({ error: "The assistant isn't configured yet." }, { status: 500 });
      const r = await answer(supabase, await buildSystem(supabase, agent as Agent, null, [...new Set(question.toUpperCase().match(REF_RE) ?? [])] as string[]), [{ role: "user", content: question }]);
      if (!r.ok) return jsonResponse({ error: "The assistant is busy right now. Try again in a minute." }, { status: 503 });
      if (!r.text || /^HANDOVER\b/i.test(r.text)) return jsonResponse({ handover: "ai_requested" });
      return jsonResponse({ reply: r.text });
    }

    const convId = String(body.conversationId ?? ""); const visitor = String(body.visitor ?? "");
    const { data: c } = await supabase.from("store_conversations").select(`*, agents(${AGENT_COLS})`).eq("id", convId).maybeSingle();
    if (!c) return jsonResponse({ error: "not_found" }, { status: 404 });
    const mine = (auth?.user && c.user_id === auth.user.id) || (!auth?.user && c.visitor_key && c.visitor_key === visitor);
    if (!mine) return jsonResponse({ error: "not_yours" }, { status: 403 });
    const agent = c.agents as Agent;
    if (c.mode !== "ai" || !agent?.support_ai_on) return jsonResponse({ skipped: "human_mode" });
    const { data: msgs } = await supabase.from("store_messages").select("sender, body, created_at").eq("conversation_id", c.id).order("created_at").limit(30);
    const last = (msgs ?? []).at(-1); if (!last || last.sender !== "customer") return jsonResponse({ skipped: "nothing_to_answer" });
    const handover = async (why: string, note: string) => {
      await supabase.from("store_messages").insert({ conversation_id: c.id, sender: "system", body: note });
      await supabase.from("store_conversations").update({ mode: "human", status: "waiting", last_message_at: new Date().toISOString() }).eq("id", c.id);
      return jsonResponse({ handover: why });
    };
    if (!apiKey) return handover("no_key", `Thanks for your message. Someone from ${agent.store_name} will reply here shortly.`);
    const mentioned = [...new Set((msgs ?? []).filter((m: { sender: string }) => m.sender === "customer").flatMap((m: { body: string }) => (m.body.toUpperCase().match(REF_RE) ?? [])))] as string[];
    const system = await buildSystem(supabase, agent, c.user_id ?? null, mentioned);
    // The assistant sees the whole thread, including what the store owner/staff said while they had it,
    // so a hand-back continues the conversation instead of starting over.
    const history: LlmMsg[] = (msgs ?? []).filter((m: { sender: string }) => m.sender !== "system").map((m: { sender: string; body: string }) => ({ role: m.sender === "customer" ? "user" as const : "assistant" as const, content: m.sender === "agent" ? `[Said by the store team] ${m.body}` : m.body }));
    while (history.length && history[0].role !== "user") history.shift();
    const r = await answer(supabase, system, history);
    if (!r.ok) return handover("provider_" + r.status, `Thanks for your message. Someone from ${agent.store_name} will reply here shortly.`);
    if (!r.text || /^HANDOVER\b/i.test(r.text)) return handover("ai_requested", `I'll get someone from ${agent.store_name} to look at this. They'll reply here; you can also keep typing.`);
    await supabase.from("store_messages").insert({ conversation_id: c.id, sender: "ai", body: r.text });
    await supabase.from("store_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", c.id);
    return jsonResponse({ replied: true });
  } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
});
