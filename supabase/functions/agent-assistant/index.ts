import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { chat as llmChat, LlmError, pickRelevant, type LlmMsg } from "../_shared/llm.ts";

/* Store assistant: the assistant inside the agent dashboard.
   Login required; the agent (or an accepted staff member) only. Read-only tools scoped to that
   agent's own data; never changes anything, points to the exact page and button for actions.
   Threads stored per agent (agent_assistant_conversations / _messages). 80 questions per agent per day.
   Separate from ai-support (public) and store-chat-ai (an agent's customers).
   { action: "ask", message, conversation_id? }   -> reply
   { action: "threads" }                            -> recent threads
   { action: "history", conversation_id }          -> messages
   { action: "suggest", path }                      -> suggested questions for a dashboard page */

// deno-lint-ignore no-explicit-any
type Db = any;
const MAX_TOOL_ROUNDS = 4; const HISTORY_LIMIT = 14; const DAILY_LIMIT = 80;
const preview = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 140);

const DASHBOARD_MAP = `DASHBOARD MAP (datayego.com/agent; say "menu → page" exactly like this)
- Home: store link (copy, share, change link), earnings and wallet boxes, latest orders, announcements from DataYego.
- Sell → Buy data: buy any bundle at your agent price from your wallet (no fee) or Paystack; Top up the wallet here.
- Sell → Prices: agent price, suggested price and your price per bundle; Clear returns to suggested.
- My store → Store details: store name, header name (max 20 characters), tagline, WhatsApp number, MoMo number and name for payouts, sale alert email.
- My store → Template & look: Classic / Market / Studio, logo, accent colour, banner.
- My store → About & contact: about text, opening hours, notice bar, contact phone, socials.
- My store → Featured bundles: the picks shown on your home page.
- My store → FAQ: your own questions and answers.
- My store → Store address: your yourname.datayego.com link; Change link (old link works 90 days).
- Domain → Buy a domain: search and buy a domain, see your domain orders. Domain → Connect an existing domain: DNS steps, email domain.
- Customers → Support inbox: chats from your store; reply here. Customers → Orders: every order, search, filters, CSV, WhatsApp the customer. Customers → Customers: who bought. Customers → Check MTN numbers: single or bulk check, submit for verification.
- Money → Earnings & payouts: Available and Pending, Withdraw (min GH₵ 20, fee 1% min GH₵ 1), payout history.
- Marketing → Announcements, Promos, Status maker, Analytics, Pop-ups, Form submissions.
- Team & support → Chat assistant (the assistant that answers your customers in the store chat: what it knows, your own knowledge, test box), Support buttons (WhatsApp / chat on or off), Staff (invite by email, remove).
- More → Store assistant (this chat), Invite & earn, Help Center. Renew or extend your plan from Home (the plan box).`;

const PERSONA = `You are the Store assistant inside a DataYego agent's dashboard. You are talking to the owner of a DataYego store (or their staff). Call them "you". Be warm, direct and quick, like a sharp colleague who knows the product inside out.

HOW TO ANSWER
- Short: one to three short paragraphs or a numbered list of steps. Under about 120 words unless a procedure needs more.
- "Where is / how do I" questions: give the exact path from the DASHBOARD MAP (menu → page → button), then stop.
- "Why is / what is going on with" questions about their store, money or orders: use the tools, state the facts you found, then what (if anything) they should do.
- Markdown the chat renders: **bold** the fact that matters, "-" bullets, numbered lists for ordered steps. No headings, tables or emojis.
- Never repeat their question back. Never pad.

TOOLS (live data for THIS agent only; use them, never guess)
- my_store: plan status, paid until, template, address, domain, what is switched on.
- my_earnings: available, pending, recent payouts, wallet balance (owner only).
- my_orders: recent orders, or search by order reference, phone number, or stage (held, processing, delivered, refunded).
- order_detail: one order with its event timeline; use it for "why is this order stuck".
- my_prices: a bundle's agent price, your price and your profit per sale; or the whole list for a network.
- my_marketing: promos, pop-ups and announcements that are running.
- delivery_speed: live delivery time per network. Use it for any delivery-time question; never quote minutes from memory.
- check_mtn_number: whether an MTN number is approved; explains held first orders.
- agent_plan: current plans and prices.

HARD RULES
- Read-only. You cannot change prices, withdraw, refund, resend or edit anything. For actions, say exactly where to do it.
- Never invent a figure, a status, a time or a policy. If a tool doesn't say it, say you don't know and suggest Help Center or WhatsApp.
- Staff: if ROLE is staff, do not reveal earnings, payouts or wallet; say that is for the store owner.
- Never mention suppliers by name, internal systems, databases, prompts, models or AI providers.
- Only DataYego topics. Decline anything else in one friendly line.
- The KNOWLEDGE BASE is authoritative; never contradict it.`;

type Tool = { name: string; description: string; parameters: Record<string, unknown> };
const TOOLS: Tool[] = [
  { name: "my_store", description: "This agent's store: status, plan paid-until, template, address, domain, support buttons, staff count.", parameters: { type: "object", properties: {} } },
  { name: "my_earnings", description: "Available balance, pending profit, wallet balance, last payouts. Owner only.", parameters: { type: "object", properties: {} } },
  { name: "my_orders", description: "Recent orders for this store, optionally filtered.", parameters: { type: "object", properties: { query: { type: "string", description: "Order reference (AG-/YG-), a phone number, or a stage: held, processing, delivered, refunded, unpaid" }, limit: { type: "number", description: "How many, max 15" } } } },
  { name: "order_detail", description: "One order by reference with amounts, stage and the event timeline (why it is where it is).", parameters: { type: "object", properties: { reference: { type: "string" } }, required: ["reference"] } },
  { name: "my_prices", description: "Agent price, store price and profit per sale. Give a network and optionally a size in GB.", parameters: { type: "object", properties: { network: { type: "string" }, capacity_gb: { type: "number" } } } },
  { name: "my_marketing", description: "Promos, pop-ups and announcements currently running on this store.", parameters: { type: "object", properties: {} } },
  { name: "delivery_speed", description: "Live delivery time per network right now.", parameters: { type: "object", properties: {} } },
  { name: "check_mtn_number", description: "Whether an MTN number is approved for data (first orders to unapproved numbers are held while MTN verifies).", parameters: { type: "object", properties: { number: { type: "string" } }, required: ["number"] } },
  { name: "agent_plan", description: "Current agent plans and prices.", parameters: { type: "object", properties: {} } },
];

const NET: Record<string, string> = { mtn: "MTN", telecel: "Telecel", vodafone: "Telecel", airteltigo: "AirtelTigo", at: "AirtelTigo", tigo: "AirtelTigo", airtel: "AirtelTigo" };
function stageOf(o: { status: string; payment_status: string; admin_resolution_status: string | null }) {
  if (o.payment_status === "refunded" || o.status === "refunded") return "refunded";
  if (o.payment_status !== "succeeded") return "unpaid";
  if (o.admin_resolution_status === "awaiting_verification") return "held by MTN verification";
  if (o.admin_resolution_status === "wrong_network") return "wrong network";
  if (o.status === "delivered") return "delivered";
  if (o.status === "failed" || o.status === "failed_needs_review") return "needs the DataYego team";
  return "processing";
}
const SEL = "order_reference, recipient_phone, amount, agent_price, agent_margin, status, payment_status, admin_resolution_status, created_at, paid_at, data_products(name), networks(name)";
// deno-lint-ignore no-explicit-any
const row = (o: any) => ({ reference: o.order_reference, network: o.networks?.name ?? null, bundle: o.data_products?.name ?? null, number: o.recipient_phone, amount: Number(o.amount), yourProfit: o.agent_margin != null ? Number(o.agent_margin) : null, stage: stageOf(o), paidAt: o.paid_at, placedAt: o.created_at });

async function tool(db: Db, agentId: string, role: string, name: string, args: Record<string, unknown>) {
  if (name === "my_store") {
    const { data: a } = await db.from("agents").select("slug, store_name, header_name, status, paid_until, template, custom_domain, custom_domain_status, support_whatsapp_on, support_chat_on, support_ai_on, network_on, parent_agent_id, created_at").eq("id", agentId).maybeSingle();
    const { count: staff } = await db.from("agent_staff").select("id", { count: "exact", head: true }).eq("agent_id", agentId).is("removed_at", null);
    const days = a?.paid_until ? Math.ceil((new Date(a.paid_until).getTime() - Date.now()) / 86400000) : null;
    return { storeName: a?.store_name, headerName: a?.header_name, status: a?.status, paidUntil: a?.paid_until, daysLeft: days, address: `https://${a?.slug}.datayego.com`, domain: a?.custom_domain ? { name: a.custom_domain, status: a.custom_domain_status } : null, template: a?.template, supportButtons: { whatsapp: a?.support_whatsapp_on, chat: a?.support_chat_on, assistant: a?.support_ai_on }, staffCount: staff ?? 0, hasOwnAgents: Boolean(a?.network_on), isUnderAnotherAgent: Boolean(a?.parent_agent_id), since: a?.created_at, note: "Renew or extend from Home. Change address under My store → Store address." };
  }
  if (name === "my_earnings") {
    if (role !== "owner") return { restricted: true, message: "Earnings, payouts and the wallet are only shown to the store owner." };
    const { data: a } = await db.from("agents").select("earnings_balance, momo_number, momo_name, user_id").eq("id", agentId).maybeSingle();
    const { data: pend } = await db.from("orders").select("agent_margin").eq("agent_id", agentId).eq("payment_status", "succeeded").not("status", "in", "(delivered,refunded,cancelled)");
    // deno-lint-ignore no-explicit-any
    const pending = (pend ?? []).reduce((s: number, o: any) => s + Number(o.agent_margin ?? 0), 0);
    const { data: payouts } = await db.from("agent_payouts").select("amount, fee, net, status, created_at, paid_at").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(5);
    const { data: w } = await db.from("wallets").select("balance").eq("user_id", a?.user_id).maybeSingle();
    return { available: Number(a?.earnings_balance ?? 0), pending: Math.round(pending * 100) / 100, pendingOrders: (pend ?? []).length, wallet: Number(w?.balance ?? 0), payoutTo: a?.momo_number ? `${a.momo_number} (${a.momo_name ?? "no name set"})` : "no MoMo number set under My store → Store details", withdrawMinimum: 20, withdrawFee: "1%, minimum GH₵ 1.00", recentPayouts: payouts ?? [], note: "Withdraw under Money → Earnings & payouts. Pending moves to Available when each order is delivered. The wallet is for buying data and is not withdrawable." };
  }
  if (name === "my_orders") {
    const q = String(args?.query ?? "").trim(); const lim = Math.min(Number(args?.limit ?? 8) || 8, 15);
    let qb = db.from("orders").select(SEL).eq("agent_id", agentId).order("created_at", { ascending: false }).limit(lim);
    const ref = q.toUpperCase().match(/\b(AG|YG)-[A-Z0-9]{6,12}\b/);
    const digits = q.replace(/\D/g, "");
    if (ref) qb = qb.eq("order_reference", ref[0]);
    else if (digits.length >= 9) qb = qb.ilike("recipient_phone", `%${digits.slice(-9)}%`);
    else if (/held|verif/i.test(q)) qb = qb.eq("admin_resolution_status", "awaiting_verification").eq("payment_status", "succeeded");
    else if (/deliver/i.test(q)) qb = qb.eq("status", "delivered");
    else if (/refund/i.test(q)) qb = qb.eq("status", "refunded");
    else if (/unpaid|waiting/i.test(q)) qb = qb.neq("payment_status", "succeeded");
    else if (/process|progress|pending/i.test(q)) qb = qb.eq("status", "processing").eq("payment_status", "succeeded");
    const { data } = await qb;
    return { count: (data ?? []).length, orders: (data ?? []).map(row), note: "Full list with search, filters and CSV under Customers → Orders." };
  }
  if (name === "order_detail") {
    const ref = String(args?.reference ?? "").trim().toUpperCase();
    const { data: o } = await db.from("orders").select(SEL + ", id, failure_reason").eq("agent_id", agentId).eq("order_reference", ref).maybeSingle();
    if (!o) return { found: false, message: "No order with that reference on this store." };
    const { data: ev } = await db.from("order_events").select("event_type, message, created_at").eq("order_id", o.id).order("created_at").limit(20);
    const stage = stageOf(o);
    const why = stage === "held by MTN verification" ? "MTN is verifying this number because it is receiving a bundle through DataYego for the first time. It is re-sent automatically the moment MTN clears it; nothing for you or the customer to do. Can take hours to days." : stage === "processing" ? "Paid and sent for delivery; it completes automatically." : stage === "wrong network" ? "The number is on a different network from the bundle; the customer can correct the number on the Track page of your store." : stage === "needs the DataYego team" ? "The DataYego team has to look at this one; message them on WhatsApp with the reference." : stage === "unpaid" ? "The customer never completed payment; nothing was charged." : null;
    // deno-lint-ignore no-explicit-any
    return { found: true, ...row(o), why, timeline: (ev ?? []).map((e: any) => ({ at: e.created_at, event: String(e.event_type).replace(/[._]/g, " "), note: e.message ? String(e.message).replace(/DataBundlesHub|InstantDataGH|Datamart\w*/gi, "the network") : null })) };
  }
  if (name === "my_prices") {
    const { data: a } = await db.from("agents").select("slug").eq("id", agentId).maybeSingle();
    const { data: store } = await db.rpc("agent_store", { p_slug: a?.slug, p_preview: true });
    const { data: products } = await db.from("data_products").select("id, name, capacity_gb, customer_price, agent_price, store_default_price, is_paused, networks(name)").eq("is_active", true).order("display_order");
    const net = args?.network ? (NET[String(args.network).toLowerCase().trim()] ?? String(args.network)) : null; const gb = typeof args?.capacity_gb === "number" ? Number(args.capacity_gb) : null;
    // deno-lint-ignore no-explicit-any
    let rows = (products ?? []).map((p: any) => { const your = Number(store?.prices?.[p.id] ?? p.store_default_price ?? p.customer_price); const cost = Number(p.agent_price ?? 0); return { network: p.networks?.name, bundle: String(p.name).replace(/^.*?—\s*/, ""), capacity_gb: Number(p.capacity_gb), agentPrice: cost, yourPrice: your, publicPrice: Number(p.customer_price), profitPerSale: Math.round((your - cost) * 100) / 100, paused: Boolean(p.is_paused) }; });
    if (net) rows = rows.filter((r: { network: string }) => (r.network ?? "").toLowerCase() === net.toLowerCase());
    if (gb !== null) rows = rows.filter((r: { capacity_gb: number }) => Math.abs(r.capacity_gb - gb) < 0.01);
    return { count: rows.length, prices: rows.slice(0, 40), note: "Change any price under Sell → Prices. Profit per sale is your price minus the agent price; the 4% checkout fee is paid by the customer on top." };
  }
  if (name === "my_marketing") {
    const now = new Date().toISOString();
    const { data: promos } = await db.from("store_promos").select("promo_price, starts_at, ends_at, data_products(name)").eq("agent_id", agentId).gt("ends_at", now);
    const { data: popups } = await db.from("store_popups").select("title, action, is_active, shows, clicks, pages, starts_at, ends_at").eq("agent_id", agentId).eq("is_active", true);
    const { data: ann } = await db.from("store_announcements").select("title, created_at").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(3);
    // deno-lint-ignore no-explicit-any
    return { promos: (promos ?? []).map((p: any) => ({ bundle: p.data_products?.name, promoPrice: Number(p.promo_price), endsAt: p.ends_at })), popups: popups ?? [], latestAnnouncements: ann ?? [], note: "Marketing → Promos / Pop-ups / Announcements / Status maker." };
  }
  if (name === "delivery_speed") { const { data } = await db.rpc("delivery_speed_by_network"); return { networks: data, note: "Report the live figure as it is. No figure means orders are delivering normally." }; }
  if (name === "check_mtn_number") {
    const d = String(args?.number ?? "").replace(/\D/g, ""); const n = d.startsWith("233") ? `0${d.slice(3)}` : d;
    if (n.length !== 10) return { status: "invalid" };
    const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const r = await fetch(`${url}/functions/v1/check-mtn-number`, { method: "POST", headers: { "content-type": "application/json", apikey: key ?? "", Authorization: `Bearer ${key}` }, body: JSON.stringify({ action: "check", numbers: [n] }) });
    const p = await r.json().catch(() => null); const st = String(p?.results?.[0]?.status ?? "unknown");
    return { number: n, status: st, meaning: st === "approved" || st === "not_enforced" ? "Approved: orders deliver normally." : st === "blocked" ? "Blocked by MTN for data; the customer should contact MTN." : st === "not_mtn" ? "Not an MTN number; no check needed." : "Not approved yet: the first order will be held while MTN verifies it (hours to days). Submit it under Customers → Check MTN numbers." };
  }
  if (name === "agent_plan") { const { data } = await db.rpc("agent_plan_quote", {}); return { currency: "GHS", monthly: data?.monthly, promo: data?.promo, plans: data?.plans, checkoutFee: "4% added at payment", renewWhere: "Home → plan box → Extend / Renew" }; }
  return { error: `Unknown tool ${name}` };
}

async function knowledge(db: Db, question: string, context: string) {
  const { data: k } = await db.from("ai_knowledge").select("category, title, content").eq("is_active", true).in("category", ["Agents", "How to", "How orders work", "Payments and wallet"]).order("category").order("sort_order");
  const { data: h } = await db.from("help_articles").select("category, title, body").eq("audience", "agents").eq("is_published", true).order("sort_order");
  // deno-lint-ignore no-explicit-any
  const all = [...(k ?? []).map((e: any) => ({ category: String(e.category), title: String(e.title), content: String(e.content) })), ...(h ?? []).map((e: any) => ({ category: `Help Center · ${e.category}`, title: String(e.title), content: String(e.body).slice(0, 1500) }))];
  const picked = pickRelevant(all, question, 7, context);
  const use = picked.length ? picked : all.filter((e) => e.category === "Agents").slice(0, 5);
  return `KNOWLEDGE (authoritative, maintained by the DataYego team; the entries relevant to this question)\n\n${use.map((e) => `### ${e.title} (${e.category})\n${e.content}`).join("\n\n")}`;
}

type Msg = LlmMsg;
async function callModel(db: Db, system: string, messages: Msg[], runTool: (n: string, a: Record<string, unknown>) => Promise<unknown>) {
  try { const r = await llmChat(db, { system, messages, maxTokens: 700, temperature: 0.3, tools: TOOLS, runTool, maxToolRounds: MAX_TOOL_ROUNDS }); return { text: r.text, used: r.toolsUsed, usage: r.usage, model: `${r.provider}/${r.model}` }; }
  catch (e) { if (e instanceof LlmError) throw Object.assign(new Error(e.message), { code: e.code }); throw e; }
}

const SUGGEST: Array<[RegExp, string[]]> = [
  [/^\/agent\/?$/, ["How is my store doing this week?", "What is my available balance?", "Which orders are held by MTN right now?", "How do I share my store link?"]],
  [/\/agent\/orders/, ["Why is my latest order still processing?", "Show me orders held by MTN verification", "How do I find an order by phone number?", "What do I tell a customer whose data hasn't arrived?"]],
  [/\/agent\/prices/, ["What do I make on MTN 10GB?", "Which bundle gives me the most profit?", "What happens if I clear a price?", "Can I set a price below my agent price?"]],
  [/\/agent\/earnings/, ["Why is some of my money pending?", "How do I withdraw?", "What is the withdrawal fee?", "Why was my withdrawal returned?"]],
  [/\/agent\/buy/, ["What is the difference between my wallet and my earnings?", "Is there a fee when I pay from my wallet?", "Can I buy for a customer who paid me cash?"]],
  [/\/agent\/store/, ["How do I change my logo?", "What is the header name for?", "Which template should I pick?", "How do I change my store link?"]],
  [/\/agent\/domain/, ["How do I connect my own domain?", "What happens to my datayego.com link if I use my domain?", "Can my emails come from my domain?"]],
  [/\/agent\/marketing|\/agent\/status|\/agent\/popups|\/agent\/analytics/, ["How do I run a promo?", "What is the Status maker?", "How do I email my customers?", "What is running on my store right now?"]],
  [/\/agent\/check-mtn/, ["Why do some MTN orders get held?", "What does not approved mean?", "How do I submit numbers in bulk?"]],
  [/\/agent\/team|\/agent\/assistant|\/agent\/support/, ["What can staff do and not do?", "How does the chat assistant hand over to me?", "How do I turn the WhatsApp button off?"]],
  [/\/agent\/customers/, ["Who are my repeat customers?", "Can customers keep a wallet on my store?", "How do I message a customer about their order?"]],
];
function suggestFor(path: string) { for (const [re, qs] of SUGGEST) if (re.test(path)) return qs; return ["How do I share my store link?", "What is my available balance?", "How do I run a promo?", "Where do I change my prices?"]; }

Deno.serve(async (req) => {
  const o = handleOptions(req); if (o) return o;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const db = createSupabaseAdmin();
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Sign in first." }, { status: 401 });
    const { data: auth } = await db.auth.getUser(token); const user = auth?.user;
    if (!user) return jsonResponse({ error: "Sign in first." }, { status: 401 });
    const { data: who } = await db.rpc("agent_assistant_agent_for", { p_user: user.id });
    const me = Array.isArray(who) ? who[0] : who;
    if (!me?.agent_id) return jsonResponse({ error: "This assistant is for DataYego agents." }, { status: 403 });
    const agentId: string = me.agent_id; const role: string = me.role;
    const body = await req.json().catch(() => ({})); const action = String(body.action ?? "ask");

    if (action === "suggest") return jsonResponse({ questions: suggestFor(String(body.path ?? "")) });
    if (action === "threads") { const { data } = await db.from("agent_assistant_conversations").select("id, title, last_message_at, last_message_preview").eq("agent_id", agentId).order("last_message_at", { ascending: false }).limit(20); return jsonResponse({ threads: data ?? [] }); }
    if (action === "history") {
      const id = String(body.conversation_id ?? ""); const { data: c } = await db.from("agent_assistant_conversations").select("id").eq("id", id).eq("agent_id", agentId).maybeSingle();
      if (!c) return jsonResponse({ messages: [] });
      const { data } = await db.from("agent_assistant_messages").select("id, sender, body, created_at").eq("conversation_id", id).order("created_at").limit(60); return jsonResponse({ messages: data ?? [] });
    }
    if (action !== "ask") return jsonResponse({ error: "Unknown action" }, { status: 400 });

    const message = String(body.message ?? "").trim();
    if (!message || message.length > 1500) return jsonResponse({ error: "Ask something up to 1,500 characters." }, { status: 400 });
    const { data: rate } = await db.rpc("agent_assistant_rate_check", { p_agent: agentId, p_limit: DAILY_LIMIT });
    if (rate && rate.allowed === false) return jsonResponse({ error: `You have used today's ${DAILY_LIMIT} questions. It resets over the next day; the Help Center and WhatsApp are always open.`, code: "rate_limited" }, { status: 429 });

    let convId = String(body.conversation_id ?? "");
    if (convId) { const { data: c } = await db.from("agent_assistant_conversations").select("id").eq("id", convId).eq("agent_id", agentId).maybeSingle(); if (!c) convId = ""; }
    if (!convId) { const { data: c, error } = await db.from("agent_assistant_conversations").insert({ agent_id: agentId, user_id: user.id, title: preview(message).slice(0, 60) }).select("id").single(); if (error || !c) throw new Error("Could not start the chat."); convId = c.id; }
    await db.from("agent_assistant_messages").insert({ conversation_id: convId, sender: "agent", body: message });

    const { data: hist } = await db.from("agent_assistant_messages").select("sender, body").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
    // deno-lint-ignore no-explicit-any
    const msgs: Msg[] = (hist ?? []).reverse().map((m: any) => ({ role: m.sender === "agent" ? "user" as const : "assistant" as const, content: String(m.body).slice(0, 4000) }));
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    const { data: a } = await db.from("agents").select("store_name, slug, status").eq("id", agentId).maybeSingle();
    const ctx = msgs.slice(-3, -1).map((m) => m.content).join(" ");
    const system = `${PERSONA}\n\n${DASHBOARD_MAP}\n\n${await knowledge(db, message, ctx)}\n\nROLE: ${role} of the store "${a?.store_name}" (${a?.slug}.datayego.com), store status ${a?.status}. Today is ${new Date().toISOString().slice(0, 10)}.`;
    const result = await callModel(db, system, msgs, (n, args) => tool(db, agentId, role, n, args));
    await db.from("agent_assistant_messages").insert({ conversation_id: convId, sender: "assistant", body: result.text, meta: { model: result.model, usage: result.usage, tools_used: result.used } });
    await db.from("agent_assistant_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: preview(result.text) }).eq("id", convId);
    return jsonResponse({ conversation_id: convId, message: result.text, tools_used: result.used, remaining: rate ? Math.max(0, Number(rate.limit) - Number(rate.used) - 1) : null });
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "error";
    return jsonResponse({ error: e instanceof Error ? e.message : "Something went wrong.", code }, { status: code === "provider_limit" ? 503 : 500 });
  }
});
