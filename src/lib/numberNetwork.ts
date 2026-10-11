/* Which network a Ghana number's prefix points to. Ported SIMs keep their old prefix, so a
   mismatch is a question to ask the customer, not an error. Keep in step with
   supabase/functions/_shared/numberPrefix.ts. */
export type NumberNetworkId = "mtn" | "telecel" | "at";

const PREFIXES: Record<NumberNetworkId, string[]> = {
  mtn: ["024", "025", "053", "054", "055", "059"],
  telecel: ["020", "050"],
  at: ["026", "027", "056", "057"],
};

export const NUMBER_NETWORK_LABEL: Record<NumberNetworkId, string> = { mtn: "MTN", telecel: "Telecel", at: "AirtelTigo" };

export function networkForNumber(digits: string): NumberNetworkId | null {
  const local = digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
  if (!/^0\d{9}$/.test(local)) return null;
  const prefix = local.slice(0, 3);
  for (const [id, list] of Object.entries(PREFIXES) as Array<[NumberNetworkId, string[]]>) if (list.includes(prefix)) return id;
  return null;
}
