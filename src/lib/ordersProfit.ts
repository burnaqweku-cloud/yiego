/* Profit on delivered orders, exactly as phase1.admin_orders_profit works it out: what is left after the supplier,
   the agents and the payment service have each taken their part. Every figure comes from the orders' own records
   (the charge is the one recorded on each payment, never a guessed percentage). Display only. */
export interface OrdersProfit {
  delivered: number; sales: number; supplier_cost: number; agent_earnings: number; parent_share: number; partner_commission: number;
  checkout_fees: number; paystack_charges: number; kora_charges: number; other_charges: number;
  no_cost_recorded: number; no_charge_recorded: number; profit: number;
}

export interface ProfitPart { label: string; amount: number; sign: 1 | -1 }

/** The lines that add up to the profit, in the order a person would say them. Lines that are zero are left out
 *  (sales and supplier cost always show). */
export function profitParts(p: OrdersProfit): ProfitPart[] {
  const n = (v: unknown) => Number(v ?? 0);
  const parts: ProfitPart[] = [
    { label: "sales", amount: n(p.sales), sign: 1 },
    { label: "supplier cost", amount: n(p.supplier_cost), sign: -1 },
    { label: "agents' earnings", amount: n(p.agent_earnings), sign: -1 },
    { label: "parent agents' share", amount: n(p.parent_share), sign: -1 },
    { label: "partner commission", amount: n(p.partner_commission), sign: -1 },
    { label: "checkout fees", amount: n(p.checkout_fees), sign: 1 },
    { label: "Paystack charges", amount: n(p.paystack_charges), sign: -1 },
    { label: "Kora charges", amount: n(p.kora_charges), sign: -1 },
    { label: "other payment charges", amount: n(p.other_charges), sign: -1 },
  ];
  return parts.filter((x, i) => i < 2 || Math.abs(x.amount) >= 0.005);
}

/** Everything the payment services took on these orders. */
export const paymentCharges = (p: OrdersProfit) => Number(p.paystack_charges ?? 0) + Number(p.kora_charges ?? 0) + Number(p.other_charges ?? 0);
