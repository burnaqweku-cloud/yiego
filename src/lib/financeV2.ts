import type { PaystackHoldings } from "@/lib/paystackHoldings";

/* Rebuilt finance rules (approved 2026-10-24):
   profit = bank + Paystack (scheduled after deductions + not yet scheduled − Paystack refunds not yet taken back)
          + suppliers − everything owed − partner capital.
   Bank movements (top-ups incl. charges, spending, capital in/out, agent payouts) are booked by existing ledger RPCs;
   wallet refunds only move money between debts and never touch the bank. */

export interface Line { code: string; name: string; amount: number }
export interface PaystackHeld { scheduledGross: number; scheduledFees: number; scheduledNet: number; notYetScheduled: number; refundsNotTakenBack: number; total: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + Math.round(b * 100), 0) / 100);

export type RefundItem = { id: number | string; status: string; amount: number; deducted: number; created?: string | null };

/** Paystack's own figure. Returns null if any part of the reading is missing, so profit never falls back to a guess. */
export function paystackHeld(reading: PaystackHoldings & { refunds_not_fully_deducted?: { ok: boolean; items: RefundItem[] } }): PaystackHeld | null {
  if (!reading.totals.ok) return null;
  const pending = reading.totals.pending_by_currency?.find((c) => c.currency === "GHS")?.amount;
  if (pending == null) return null;
  if (!reading.settlements.length || !reading.settlements.every((g) => g.ok && g.complete)) return null;
  const refunds = reading.refunds_not_fully_deducted;
  if (!refunds?.ok) return null;
  const seen = new Map<string, PaystackHoldings["settlements"][number]["not_yet_paid"][number]>();
  for (const g of reading.settlements) for (const p of g.not_yet_paid) if (p.currency === "GHS" && ["pending", "processing"].includes(p.status.toLowerCase())) seen.set(String(p.id), p);
  const payouts = [...seen.values()];
  const scheduledNet = sum(payouts.map((p) => p.net));
  const scheduledGross = sum(payouts.map((p) => p.gross));
  const refundsNotTakenBack = sum(refunds.items.filter((x) => !["failed", "reversed"].includes(String(x.status).toLowerCase())).map((x) => Math.max(0, x.amount - x.deducted)));
  return { scheduledGross, scheduledFees: r2(scheduledGross - scheduledNet), scheduledNet, notYetScheduled: r2(pending), refundsNotTakenBack, total: r2(scheduledNet + pending - refundsNotTakenBack) };
}

export function financeProfit(input: { bank: number; paystack: number; suppliers: Line[]; owed: Line[]; capital: number }) {
  const supplierTotal = sum(input.suppliers.map((s) => s.amount));
  const owedTotal = sum(input.owed.map((s) => s.amount));
  const have = sum([input.bank, input.paystack, supplierTotal]);
  return { supplierTotal, owedTotal, have, profit: r2(have - owedTotal - input.capital) };
}

/** Display-only estimate: assumes unscheduled collections are gross. Never deduct scheduled fees or refunds again. */
export function estimateProfitAfterPendingFees(profit: number, notYetScheduled: number) {
  const pendingFees = r2(Math.max(0, notYetScheduled) * 0.02);
  return { pendingFees, profit: r2(profit - pendingFees) };
}

export type InFlightOrder = {
  amount: number | string;
  cost_amount: number | string | null;
  agent_margin?: number | string | null;
  parent_margin?: number | string | null;
  supplier_purchase_id?: string | null;
  supplier_order_reference?: string | null;
  supplier_status?: string | null;
  supplier_cost_in_assets?: boolean;
  pending_fee?: number;
  status?: string | null;
  admin_resolution_status?: string | null;
};

/* Healthy in-progress = paid, still with the supplier and waiting to be delivered, with nothing waiting on a human.
 * A verification hold, a supplier rejection under review or a wrong-network order is never counted:
 * any of them can still end up refunded, so their margin is not ours to promise. */
const DELIVERING = ["paid", "processing", "pending_supplier"];
// "processing" is only the neutral customer-facing marker (set on retries), not a hold.
export const isHealthyInFlight = (o: InFlightOrder) => DELIVERING.includes(String(o.status ?? ""))
  && (!o.admin_resolution_status || o.admin_resolution_status === "processing")
  && Boolean(o.supplier_purchase_id || o.supplier_order_reference)
  && ["pending", "processing", "queued", "accepted", "ongoing", "in_progress", "in progress"].includes(String(o.supplier_status ?? "").toLowerCase());

/** Display-only breakdown of the money still on its way to customers.
 * Orders without a recorded supplier cost contribute nothing — never guess a cost. */
export function inFlightBreakdown(orders: InFlightOrder[]) {
  const healthy = orders.filter(isHealthyInFlight);
  const costed = healthy.filter((o) => o.cost_amount != null);
  const held = orders.filter((o) => !isHealthyInFlight(o));
  const hold = (kind: string) => held.filter((o) => o.admin_resolution_status === kind).length;
  const verification = hold("awaiting_verification");
  const wrongNetwork = hold("wrong_network");
  return {
    counted: costed.length,
    // Simulate delivery: release delivery + deferred fee liabilities, create agent debts,
    // and deduct supplier cost ONLY when main assets use the undeducted book float.
    deliveryIncrease: sum(costed.map((o) => Number(o.amount) + Number(o.pending_fee ?? 0)
      - Number(o.agent_margin ?? 0) - Number(o.parent_margin ?? 0)
      - (o.supplier_cost_in_assets ? 0 : Number(o.cost_amount)))),
    missingCost: healthy.length - costed.length,
    verification,
    wrongNetwork,
    review: held.length - verification - wrongNetwork,
  };
}

/** Display-only: what the main profit becomes if every healthy in-progress order delivers. */
export function profitIfAllDeliver(profit: number, orders: InFlightOrder[]) {
  const b = inFlightBreakdown(orders);
  return { profit: r2(profit + b.deliveryIncrease), ...b };
}
