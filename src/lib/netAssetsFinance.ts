export interface FinanceBalance {
  code: string;
  name: string;
  kind: string;
  balance: number | string;
}

export interface FinanceSupplier {
  code: string;
  name: string;
  confirmed_balance: number | string | null;
  confirmed_at: string | null;
}

export interface FinanceLine {
  code: string;
  name: string;
  amount: number;
  source?: "reported" | "books";
  reportedAt?: string | null;
}

function money(value: number | string): number {
  if (value === "" || !Number.isFinite(Number(value))) throw new Error("A financial balance is unavailable.");
  return Math.round(Number(value) * 100) / 100;
}

const sum = (lines: FinanceLine[]) => Math.round(lines.reduce((total, line) => total + Math.round(line.amount * 100), 0)) / 100;

/** Read-only comparison. Expenses are already reflected in assets; never subtract them again.
 * Capital uses the existing partner funding account, net of drawings; carried-in funds are excluded.
 * Any extra Paystack deduction is a temporary reconciliation adjustment, not a ledger write.
 */
export function calculateNetAssets(balances: FinanceBalance[], suppliers: FinanceSupplier[], extraPaystackDeduction = 0) {
  for (const required of ["bank", "paystack_transit", "outside_funding", "opening_balance", "customer_wallets", "owed_deliveries", "refunds_due", "owed_to_agents"]) {
    if (!balances.some((balance) => balance.code === required)) throw new Error("The financial snapshot is incomplete.");
  }
  const deduction = money(extraPaystackDeduction);
  if (deduction < 0) throw new Error("A deduction cannot be negative.");
  const assets: FinanceLine[] = balances.filter((balance) => balance.kind === "asset").map((balance) => {
    const supplier = balance.code.startsWith("float_") ? suppliers.find((item) => item.code === balance.code.slice(6)) : undefined;
    return {
      code: balance.code,
      name: supplier?.name ?? balance.name,
      amount: supplier?.confirmed_balance != null ? money(supplier.confirmed_balance) : money(balance.balance),
      source: supplier?.confirmed_balance != null ? "reported" : "books",
      reportedAt: supplier?.confirmed_at,
    };
  });
  // A supplier with a reported balance must not disappear just because a float account is missing.
  for (const supplier of suppliers) {
    if (!assets.some((asset) => asset.code === `float_${supplier.code}`)) {
      if (supplier.confirmed_balance == null) throw new Error("A supplier balance is unavailable.");
      assets.push({ code: `float_${supplier.code}`, name: supplier.name, amount: money(supplier.confirmed_balance), source: "reported", reportedAt: supplier.confirmed_at });
    }
  }
  const liabilities: FinanceLine[] = balances.filter((balance) => balance.kind === "liability").map((balance) => ({ code: balance.code, name: balance.name, amount: money(balance.balance) }));
  const funding: FinanceLine[] = balances.filter((balance) => balance.code === "outside_funding").map((balance) => ({ code: balance.code, name: balance.name, amount: money(balance.balance) }));
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalFunding = sum(funding);
  const netWorth = money(totalAssets - deduction - totalLiabilities);
  return { assets, liabilities, funding, totalAssets, totalLiabilities, totalFunding, deduction, netWorth, profit: money(netWorth - totalFunding) };
}