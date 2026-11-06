import { z } from "zod";

export const koraHoldingsSchema = z.object({
  configured: z.boolean(), test: z.boolean().optional(), ok: z.boolean().optional(), read_at: z.string().optional(),
  items: z.array(z.object({ currency: z.string(), available: z.number().finite().nonnegative(), pending: z.number().finite().nonnegative() })).nullable(),
});
export type KoraReading = z.infer<typeof koraHoldingsSchema>;

/** Provider net balances replace the book cash figure; never subtract book movements or fees again. */
export function koraHeld(reading: KoraReading | null) {
  if (!reading?.configured || reading.test || !reading.ok) return null;
  const ghs = reading.items?.filter((item) => item.currency === "GHS");
  if (ghs?.length !== 1) return null;
  const [balance] = ghs;
  return { ...balance, total: Math.round((balance.available + balance.pending) * 100) / 100 };
}