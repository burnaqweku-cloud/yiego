export type OrderSmsKind = "purchase" | "delivered" | "verified";
export type OrderSmsRecord = {
  order_reference: string; created_at: string; status: string; payment_status: string;
  recipient_phone: string; capacity_gb: number | null; capacity_mb: number | null;
  network_name: string; supplier_order_reference: string | null; supplier_purchase_id: string | null;
  admin_resolution_status: string | null;
  /** Agent-store orders: the store the customer bought from. The text carries the store's name and its own address, never DataYego's. */
  agent_slug?: string | null; store_name?: string | null; store_domain?: string | null;
};
export function eligibleSms(o: OrderSmsRecord, kind: OrderSmsKind): boolean {
  if (o.payment_status !== "succeeded") return false;
  if (kind === "purchase") return true;
  if (kind === "delivered") return o.status === "delivered";
  if (o.network_name.toUpperCase() !== "MTN") return false;
  if (o.status === "delivered") return true;
  // "On its way" is only honest for a fresh order; an old one still processing is a stuck order, not a delivery in progress.
  const ageMs = Date.now() - new Date(o.created_at).getTime();
  return o.status === "processing" && o.admin_resolution_status !== "awaiting_verification" && Boolean(o.supplier_order_reference || o.supplier_purchase_id) && ageMs < ON_ITS_WAY_MAX_AGE_MS;
}
const ON_ITS_WAY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/* Wording approved 20 Oct 2026 after delivery tests: the network drops texts that name the network, say "GB"/"bundles"
   or carry an https link, so the texts name the brand, say "2G" and end with a bare domain. */
const MAIN_BRAND = "DTYEGO";
const MAIN_LINK = "datayego.com";
const ONE_SEGMENT = 160, TWO_SEGMENTS = 306;

/** Plain GSM text only: strip accents, drop anything else non-ASCII, collapse spaces. */
const gsm = (s: string) => s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim();

export function buildOrderSms(o: OrderSmsRecord, kind: OrderSmsKind): string {
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
  const month = parts.find(p => p.type === "month")?.value;
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  const bought = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(when).replace(",", "");

  let message: string;
  if (kind === "verified") {
    message = `Congratulations, your number is verified on ${brand}. Every order you purchase from now on goes through instantly. Your ${size} from ${day}${suffix} ${month} is ${o.status === "delivered" ? "already delivered" : "on its way"}. We're looking forward to see more orders from you. ${link}`;
  } else if (kind === "purchase") {
    message = `Thank you for your order on ${brand}. Order ID: ${o.order_reference}, ${bought}. Your ${size} is being processed and will reach you shortly. ${link}`;
    if (message.length > ONE_SEGMENT) message = message.replace(" and will reach you shortly", "");
  } else {
    message = `Your ${size} order on ${brand} is delivered. Order ID: ${o.order_reference}, placed ${bought}. Thank you for choosing us. ${link}`;
    if (message.length > ONE_SEGMENT) message = message.replace(" Thank you for choosing us.", "");
  }
  if (message.length > TWO_SEGMENTS || /[^\x20-\x7e]/.test(message)) throw new Error("SMS too long for two segments");
  return message;
}
