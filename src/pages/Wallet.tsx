import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDownToLine, ArrowUpRight, Clock, RefreshCcw } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import BalanceCard from "@/components/dashboard/BalanceCard";
import TransactionDetailSheet from "@/components/sheets/TransactionDetailSheet";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/store/wallet";
import { formatSigned } from "@/lib/format";
import type { WalletTransaction } from "@/types/wallet";
import { cn } from "@/lib/utils";

export default function Wallet() {
  const [searchParams] = useSearchParams();
  const { transactions, refresh, loading, error } = useWallet();
  const [selected, setSelected] = useState<WalletTransaction | null>(null);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="Wallet"
        title="Your wallet"
        subtitle="View your balance, add money and review recent activity."
        action={<Button variant="soft" onClick={refresh} disabled={loading}><RefreshCcw className={loading ? "animate-spin" : ""} size={16} /> Refresh</Button>}
      />

      {searchParams.get("payment") === "paystack" && (
        <div className="rounded-[22px] border border-primary-glow/20 bg-primary/[0.06] p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-white">We're confirming your payment</p>
          <p className="mt-1">Your wallet will update automatically when confirmation is complete. You can also refresh to check again.</p>
        </div>
      )}

      {error && <div className="rounded-[22px] border border-danger/25 bg-danger/[0.08] p-4 text-sm text-ink-rose">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:items-start">
        <BalanceCard />
        <section className="onyx-panel rounded-[24px] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Transactions</h2>
            <p className="mt-1 text-xs text-faint-foreground">Deposits, data purchases and refunds</p>
          </div>
          <span className="text-xs text-faint-foreground">{transactions.length} entries</span>
        </div>

        {transactions.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No wallet activity yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-white/5">
            {transactions.map((transaction) => {
              const incoming = transaction.amount > 0;
              return (
                <button key={transaction.id} type="button" onClick={() => setSelected(transaction)} className="flex w-full items-center gap-3 py-4 text-left">
                  <span className={cn("onyx-tx-icon shrink-0", incoming ? "is-in" : "is-out")}>
                    {incoming ? <ArrowDownToLine size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{transaction.title}</span>
                    <span className="block truncate text-xs text-faint-foreground">{transaction.subtitle}</span>
                  </span>
                  <span className="text-right">
                    <span className={cn("block font-display text-sm font-semibold", incoming ? "text-success" : "text-foreground")}>{formatSigned(transaction.amount)}</span>
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-faint-foreground"><Clock size={10} /> {transaction.status}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        </section>
      </div>

      <TransactionDetailSheet tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
