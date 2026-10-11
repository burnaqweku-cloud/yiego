/* Which network a Ghana number's prefix points to, and the "customer confirmed this ported
   number" record. Ported SIMs keep their old prefix (an 024 number can be on AirtelTigo), so a
   prefix that disagrees with the network the customer picked is not always a mistake. The
   checkout asks the customer to confirm; this saves that confirmation on the order.
   Keep the prefix list in step with src/lib/numberNetwork.ts and databundleshub.ts. */
// deno-lint-ignore no-explicit-any
type Db = any;

export const NUMBER_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  TELECEL: ["020", "050"],
  AIRTELTIGO: ["026", "027", "056", "057"],
};

export function networkCodeForNumber(phone: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
  const prefix = local.slice(0, 3);
  for (const [network, list] of Object.entries(NUMBER_PREFIXES)) if (list.includes(prefix)) return network;
  return null;
}

/** "AirtelTigo" -> "AIRTELTIGO", "Telecel" -> "TELECEL". */
export const networkCodeFromName = (name: unknown) => String(name ?? "").toUpperCase().replace(/[^A-Z]/g, "");

/** Save the customer's "yes, this number is on <network>" on the order, but only when the number's
 *  prefix really does point to a different network. A tick on a matching number is ignored.
 *  Returns true when it recorded a confirmation. */
export async function recordPrefixConfirmation(supabase: Db, orderId: string): Promise<boolean> {
  const { data: order } = await supabase.from("orders").select("id, status, payment_status, recipient_phone, prefix_mismatch_confirmed, networks(name)").eq("id", orderId).maybeSingle();
  if (!order || order.prefix_mismatch_confirmed || order.payment_status === "succeeded") return false;
  const selected = networkCodeFromName(order.networks?.name);
  const detected = networkCodeForNumber(order.recipient_phone);
  if (!selected || !detected || selected === detected) return false;
  const at = new Date().toISOString();
  const { error } = await supabase.from("orders").update({ prefix_mismatch_confirmed: true, prefix_mismatch_confirmed_at: at, updated_at: at }).eq("id", order.id);
  if (error) return false;
  await supabase.from("order_events").insert({
    order_id: order.id, event_type: "order.prefix_mismatch_confirmed", from_status: order.status, to_status: order.status,
    message: `Customer confirmed this ${detected.toLowerCase()}-prefix number is on ${order.networks?.name} (ported)`,
    metadata: { detectedNetwork: detected, selectedNetwork: selected },
  });
  return true;
}
