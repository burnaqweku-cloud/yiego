/* Order SMS: who gets a text and what it says. Pure code, no Deno, no network — shared by the sending worker,
   the admin preview (src imports it) and the tests. */

export type OrderSmsKind = "purchase" | "delivered" | "verified";
export type SmsTemplateKind = "purchase" | "delivered" | "verified_delivered" | "verified_on_way";
export type SmsTemplates = Record<SmsTemplateKind, string>;

export type OrderSmsRecord = {
  order_reference: string; created_at: string; status: string; payment_status: string;
  recipient_phone: string; capacity_gb: number | null; capacity_mb: number | null;
  network_name: string; supplier_order_reference: string | null; supplier_purchase_id: string | null;
  admin_resolution_status: string | null;
  /** Agent-store orders: the store the customer bought from. The text carries the store's name and its own address, never DataYego's. */
  agent_slug?: string | null; store_name?: string | null; store_domain?: string | null;
};

export const ON_ITS_WAY_MAX_HOURS = 48;

export function eligibleSms(o: OrderSmsRecord, kind: OrderSmsKind, onWayMaxHours = ON_ITS_WAY_MAX_HOURS): boolean {
  if (o.payment_status !== "succeeded") return false;
  if (kind === "purchase") return true;
  if (kind === "delivered") return o.status === "delivered";
  if (o.network_name.toUpperCase() !== "MTN") return false;
  if (o.status === "delivered") return true;
  // "On its way" is only honest for a fresh order; an old one still processing is a stuck order, not a delivery in progress.
  const ageMs = Date.now() - new Date(o.created_at).getTime();
  return o.status === "processing" && o.admin_resolution_status !== "awaiting_verification" && Boolean(o.supplier_order_reference || o.supplier_purchase_id) && ageMs < onWayMaxHours * 60 * 60 * 1000;
}

/* Wording approved 20 Oct 2026 after delivery tests: the network drops texts that name the network, say "GB"/"bundles"
   or carry an https link, so the texts name the brand, say "2G" and end with a bare domain. Editable in Admin → SMS → Templates;
   these are the defaults and the fallback. */
export const DEFAULT_SMS_TEMPLATES: SmsTemplates = {
  purchase: "Thank you for your order on {brand}. Order ID: {ref}, {datetime}. Your {size} is being processed and will reach you shortly. {link}",
  delivered: "Your {size} order on {brand} is delivered. Order ID: {ref}, placed {datetime}. Thank you for choosing us. {link}",
  verified_delivered: "Congratulations, your number is verified on {brand}. Every order you purchase from now on goes through instantly. Your {size} from {date} is already delivered. We're looking forward to see more orders from you. {link}",
  verified_on_way: "Congratulations, your number is verified on {brand}. Every order you purchase from now on goes through instantly. Your {size} from {date} is on its way. We're looking forward to see more orders from you. {link}",
};

/** What each placeholder turns into. {brand}: DTYEGO or the store's name. {link}: datayego.com or the store's address. */
export const SMS_PLACEHOLDERS: Record<string, string> = {
  brand: "DTYEGO, or the store's name for a store order",
  link: "datayego.com, or the store's own address",
  size: "2G, 500MB",
  ref: "the order ID, e.g. YG-710EB4FDB4",
  datetime: "19 Oct 22:15 (Accra time)",
  date: "19th October",
};

export const MAIN_BRAND = "DTYEGO";
export const MAIN_LINK = "datayego.com";
const ONE_SEGMENT = 160, TWO_SEGMENTS = 306;
export const SMS_MAX_LENGTH = TWO_SEGMENTS;

/** Plain GSM text only: curly quotes to straight, strip accents, drop anything else non-ASCII, collapse spaces. */
export const gsm = (s: string) => s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim();

export const smsSegments = (s: string) => (s.length <= ONE_SEGMENT ? 1 : Math.ceil(s.length / 153));

/** Problems with a template as typed, in plain words. Empty list = fine. */
export function validateSmsTemplate(body: string): string[] {
  const problems: string[] = [];
  const text = body ?? "";
  if (!text.trim()) problems.push("The text is empty.");
  if (/[^\x20-\x7e]/.test(text)) problems.push("Only plain characters (no emoji, curly quotes or accents): the network drops the rest.");
  for (const m of text.matchAll(/\{([^}]*)\}/g)) if (!(m[1] in SMS_PLACEHOLDERS)) problems.push(`Unknown placeholder {${m[1]}}.`);
  if (text.length > SMS_MAX_LENGTH) problems.push(`Too long: ${text.length} characters, the limit is ${SMS_MAX_LENGTH} (two segments).`);
  return problems;
}

export function renderSmsTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{([^}]*)\}/g, (_, k: string) => vars[k] ?? "");
}

/** The values a given order fills the placeholders with. */
export function smsVars(o: OrderSmsRecord): Record<string, string> {
  const gb = Number(o.capacity_gb), mb = Number(o.capacity_mb);
  const size = gb > 0 ? `${gb}G` : mb > 0 ? `${mb}MB` : null;
  const when = new Date(o.created_at);
  if (!size || !Number.isFinite(when.getTime())) throw new Error("Invalid order details");
  const slug = o.agent_slug;
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid store link");
  const store = slug ? gsm(o.store_name ?? "") : "";
  const brand = slug ? (store || "your store") : MAIN_BRAND;
  const link = slug ? (o.store_domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(o.store_domain) ? o.store_domain.toLowerCase() : `${slug}.datayego.com`) : MAIN_LINK;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "long" }).formatToParts(when);
  const day = Number(parts.find(p => p.type === "day")?.value);
  const month = parts.find(p => p.type === "month")?.value ?? "";
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  const datetime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(when).replace(",", "");
  return { brand, link, size, ref: o.order_reference, datetime, date: `${day}${suffix} ${month}` };
}

export const templateKindFor = (o: OrderSmsRecord, kind: OrderSmsKind): SmsTemplateKind =>
  kind === "verified" ? (o.status === "delivered" ? "verified_delivered" : "verified_on_way") : kind;

export function buildOrderSms(o: OrderSmsRecord, kind: OrderSmsKind, templates: SmsTemplates = DEFAULT_SMS_TEMPLATES): string {
  const tk = templateKindFor(o, kind);
  const body = templates[tk]?.trim() || DEFAULT_SMS_TEMPLATES[tk];
  let message = renderSmsTemplate(body, smsVars(o)).replace(/\s+/g, " ").trim();
  // Routine texts aim for one segment; drop the courtesy sentence first if a long store name pushes them over.
  if (kind === "purchase" && message.length > ONE_SEGMENT) message = message.replace(" and will reach you shortly", "");
  if (kind === "delivered" && message.length > ONE_SEGMENT) message = message.replace(" Thank you for choosing us.", "");
  if (message.length > TWO_SEGMENTS || /[^\x20-\x7e]/.test(message)) throw new Error("SMS too long for two segments");
  return message;
}

/** A believable order for previews and test sends. */
export const SAMPLE_ORDER: OrderSmsRecord = { order_reference: "YG-710EB4FDB4", created_at: "2026-10-19T22:15:00Z", status: "delivered", payment_status: "succeeded", recipient_phone: "+233533533414", capacity_gb: 1, capacity_mb: null, network_name: "MTN", supplier_order_reference: "sample", supplier_purchase_id: null, admin_resolution_status: null };
export const SAMPLE_STORE_ORDER: OrderSmsRecord = { ...SAMPLE_ORDER, order_reference: "AG-EC3D253250", agent_slug: "agent-store", store_name: "Urbanstore" };
