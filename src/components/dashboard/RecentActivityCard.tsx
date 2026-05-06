import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, RotateCcw, Receipt, ArrowRight, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { formatPrice } from '@/data/bundles';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function txState(status: string): 'success' | 'pending' | 'failed' {
  const s = (status || '').toLowerCase();
  if (['confirmed', 'completed', 'paid', 'delivered', 'success'].includes(s)) return 'success';
  if (['pending', 'processing'].includes(s)) return 'pending';
  return 'failed';
}

function statusBadge(status: string) {
  const state = txState(status);
  if (state === 'success') {
    return { className: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/25', Icon: CheckCircle, label: 'Done' };
  }
  if (state === 'pending') {
    return {
      className: 'text-amber-600 bg-amber-500/12 border-amber-500/30',
      Icon: status?.toLowerCase() === 'processing' ? Loader2 : Clock,
      label: status?.toLowerCase() === 'processing' ? 'Processing' : 'Pending',
    };
  }
  return { className: 'text-rose-600 bg-rose-500/10 border-rose-500/25', Icon: XCircle, label: 'Failed' };
}

function amountStyle(type: string, status: string) {
  const state = txState(status);
  if (state === 'failed') return { className: 'text-rose-600 dark:text-rose-400 line-through opacity-80', sign: '' };
  if (state === 'pending') return { className: 'text-amber-600 dark:text-amber-400', sign: '' };
  if (type === 'debit') return { className: 'text-foreground', sign: '−' };
  return { className: 'text-emerald-600 dark:text-emerald-400', sign: '+' };
}

const typeMeta: Record<string, { icon: typeof ArrowDownLeft; label: string; tone: string; rail: string }> = {
  deposit: {
    icon: ArrowDownLeft,
    label: 'Deposit',
    tone: 'text-emerald-600 bg-emerald-500/10 ring-emerald-500/20',
    rail: 'bg-emerald-500',
  },
  debit: {
    icon: ArrowUpRight,
    label: 'Payment',
    tone: 'text-rose-600 bg-rose-500/10 ring-rose-500/20',
    rail: 'bg-rose-500',
  },
  refund: {
    icon: RotateCcw,
    label: 'Refund',
    tone: 'text-sky-600 bg-sky-500/10 ring-sky-500/20',
    rail: 'bg-sky-500',
  },
};

const RecentActivityCard = () => {
  const { transactions, refreshTransactions } = useWallet();

  useEffect(() => { refreshTransactions(); }, [refreshTransactions]);

  const recent = transactions.slice(0, 4);

  return (
    <section className="rounded-3xl glass-card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-border/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Activity</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Wallet movements</p>
        </div>
        <Link
          to="/dashboard/transactions"
          className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:gap-2.5 transition-all"
        >
          See all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="p-8 text-center">
          <div className="relative w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.3)]">
            <Receipt className="w-6 h-6 text-primary" strokeWidth={1.9} />
          </div>
          <p className="font-display font-bold text-base">No activity yet</p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Fund your wallet to see movements here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {recent.map((t) => {
            const meta = typeMeta[t.type] || typeMeta.debit;
            const Icon = meta.icon;
            const amt = amountStyle(t.type, t.status);
            const status = statusBadge(t.status);
            const StatusIcon = status.Icon;
            const state = txState(t.status);
            const isPending = state === 'pending';
            return (
              <li key={t.id} className="relative flex items-center gap-3 pl-5 pr-4 py-3.5 hover:bg-primary/[0.04] transition-colors">
                <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${meta.rail} ${isPending ? 'opacity-50' : 'opacity-80'}`} />
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ${meta.tone} ${isPending ? 'opacity-70' : ''}`}>
                  <Icon className="w-4 h-4" strokeWidth={2.1} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate">{meta.label}</p>
                  <p className="text-[10.5px] text-muted-foreground truncate tabular mt-0.5">
                    {relativeTime(t.created_at)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[13.5px] font-bold tabular leading-tight ${amt.className}`}>
                    {amt.sign}{formatPrice(Number(t.amount_ghs))}
                  </p>
                  <span className={`mt-1 inline-flex items-center gap-1 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full border ${status.className}`}>
                    <StatusIcon className={`w-2 h-2 ${status.label === 'Processing' ? 'animate-spin' : ''}`} />
                    {status.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default RecentActivityCard;
