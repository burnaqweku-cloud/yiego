import { z } from "zod";

const amount = z.number().finite();
const currencyAmount = z.object({ currency: z.string(), amount });
export const paystackHoldingsSchema = z.object({
  read_at: z.string().datetime(),
  balance: z.object({ ok: z.boolean(), items: z.array(currencyAmount).nullable() }),
  totals: z.object({ ok: z.boolean(), pending_transfers: amount.nullable(), pending_by_currency: z.array(currencyAmount).nullable() }),
  settlements: z.array(z.object({
    account: z.enum(["main", "subaccount"]), ok: z.boolean(), complete: z.boolean(),
    not_yet_paid: z.array(z.object({ id: z.union([z.number(), z.string()]), status: z.string(), currency: z.string(), gross: amount, fees: amount, net: amount, date: z.string().nullable() })),
  })),
});
export type PaystackHoldings = z.infer<typeof paystackHoldingsSchema>;

/** These are separate provider readings, not a verified combined asset. */
export function paystackComparison(reading: PaystackHoldings) {
  const pending = reading.totals.ok ? reading.totals.pending_by_currency?.find((item) => item.currency === "GHS")?.amount ?? null : null;
  const wallet = reading.balance.ok ? reading.balance.items?.find((item) => item.currency === "GHS")?.amount ?? null : null;
  const payouts = new Map<string, PaystackHoldings["settlements"][number]["not_yet_paid"][number]>();
  for (const group of reading.settlements) for (const payout of group.not_yet_paid) {
    if (payout.currency === "GHS" && ["pending", "processing"].includes(payout.status.toLowerCase())) payouts.set(String(payout.id), payout);
  }
  const complete = reading.settlements.length > 0 && reading.settlements.every((group) => group.ok && group.complete);
  return { pending, wallet, payouts: [...payouts.values()], scheduledNet: complete ? Math.round([...payouts.values()].reduce((sum, payout) => sum + Math.round(payout.net * 100), 0)) / 100 : null };
}