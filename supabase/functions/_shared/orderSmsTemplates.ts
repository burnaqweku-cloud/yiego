export type OrderSmsKind = "purchase" | "delivered" | "verified";
export type OrderSmsRecord = {
  order_reference: string; created_at: string; status: string; payment_status: string;
  recipient_phone: string; capacity_gb: number | null; capacity_mb: number | null;
  network_name: string; supplier_order_reference: string | null; supplier_purchase_id: string | null;
  admin_resolution_status: string | null; agent_slug?: string | null;
};
export function eligibleSms(o: OrderSmsRecord, kind: OrderSmsKind): boolean {
  if (o.payment_status !== "succeeded") return false;
  if (kind === "purchase") return true;
  if (kind === "delivered") return o.status === "delivered";
  return o.network_name.toUpperCase() === "MTN" && (o.status === "delivered" || (o.status === "processing" && o.admin_resolution_status !== "awaiting_verification" && Boolean(o.supplier_order_reference || o.supplier_purchase_id)));
}
export function buildOrderSms(o: OrderSmsRecord, kind: OrderSmsKind): string {
  const gb = Number(o.capacity_gb), mb = Number(o.capacity_mb);
  const size = gb > 0 ? `${gb}GB` : mb > 0 ? `${mb}MB` : null;
  if (!size || !Number.isFinite(new Date(o.created_at).getTime())) throw new Error("Invalid order details");
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "long" }).formatToParts(new Date(o.created_at));
  const day = Number(parts.find(p => p.type === "day")?.value);
  const month = parts.find(p => p.type === "month")?.value;
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  const slug = o.agent_slug;
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid store link");
  const link = slug ? `https://datayego.com/s/${slug}` : "https://datayego.com";
  if (kind === "verified") return `Congratulations, your MTN number is verified. Every order you purchase from now on goes through instantly. Your ${size} from ${day}${suffix} ${month} is ${o.status === "delivered" ? "delivered" : "on its way"}. Buy your cheap bundles at ${link}`;
  const bought = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(o.created_at)).replace(",", "");
  const network = o.network_name === "AirtelTigo" ? "AT" : o.network_name;
  const message = kind === "purchase"
    ? `DataYego: Your ${network} ${size} purchase is confirmed. Order ID: ${o.order_reference}. ${bought}. ${link}`
    : `DataYego: Your ${network} ${size} is delivered. Order ID: ${o.order_reference}. Purchased ${bought}. ${link}`;
  if (message.length > 160 || /[^\x20-\x7e]/.test(message)) throw new Error("SMS exceeds one segment");
  return message;
}