import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, RotateCcw, Receipt, ArrowRight } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { formatPrice } from '@/data/bundles';
import { Skeleton } from '@/components/ui/skeleton';

const typeMeta: Record<string, { icon: typeof ArrowDownLeft; label: string; tone: string }> = {
  deposit: { icon: ArrowDownLeft, label: 'Deposit', tone: 'text-emerald-500 bg-emerald-500/10' },
  debit:   { icon: ArrowUpRight, label: 'Payment', tone: 'text-rose-500 bg-rose-500/10' },
  refund:  { icon: RotateCcw,    label: 'Refund',  tone: 'text-sky-500 bg-sky-500/10' },
};

const RecentActivityCard = () => {
  const { transactions, refreshTransactions } = useWallet();

  useEffect(() => { refreshTransactions(); }, [refreshTransactions]);

  const recent = transactions.slice(0, 4);

  return (
    <section className="rounded-2xl border border-border/70 bg-card overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between border-b border-border/60">
        <div>
          <h3 className="text-sm font-bold tracking-tight">Recent activity</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Wallet movements</p>
        </div>
        <Link to="/dashboard/transactions" className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1">
          See all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {recent.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-2.5 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">No activity yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {recent.map((t) => {
            const meta = typeMeta[t.type] || typeMeta.debit;
            const Icon = meta.icon;
            const sign = t.type === 'debit' ? '-' : '+';
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.tone}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate">{meta.label}</p>
                  <p className="text-[10.5px] text-muted-foreground truncate">
                    {new Date(t.created_at).toLocaleDateString()} · {t.status}
                  </p>
                </div>
                <span className={`text-[13px] font-bold tabular shrink-0 ${t.type === 'debit' ? 'text-foreground' : 'text-emerald-500'}`}>
                  {sign}{formatPrice(Number(t.amount_ghs))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default RecentActivityCard;
