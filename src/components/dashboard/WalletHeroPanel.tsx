import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Receipt, Plus, TrendingUp, Wallet, ShieldCheck, ArrowRight } from 'lucide-react';
import { formatPrice } from '@/data/bundles';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  balance: number;
  totalOrders: number;
  totalSpent: number;
  loading: boolean;
  ordersLoading: boolean;
}

function useCountUp(target: number, duration = 800, enabled = true) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const animate = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(eased * target);
      if (p < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration, enabled]);
  return value;
}

const WalletHeroPanel = ({ balance, totalOrders, totalSpent, loading, ordersLoading }: Props) => {
  const animated = useCountUp(balance, 850, !loading);
  const [hidden, setHidden] = useState(false);

  return (
    <section className="relative overflow-hidden rounded-3xl glass-card p-5 sm:p-7">
      {/* Subtle indigo + gold ambient glows */}
      <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-primary/18 blur-3xl pointer-events-none glow-drift" />
      <div className="absolute -bottom-24 -left-16 w-60 h-60 rounded-full bg-accent/10 blur-3xl pointer-events-none glow-drift-slow" />
      {/* Gradient hairline top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent pointer-events-none" />
      {/* Noise grain */}
      <div className="noise-overlay" />

      <div className="relative">
        {/* Top row */}
        <div className="flex items-start justify-between mb-5 sm:mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.25)]">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-primary" />
            </span>
            <ShieldCheck className="w-3 h-3 text-primary" />
            <span className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-primary">YieGo Wallet</span>
          </div>
          <button
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
            className="w-9 h-9 rounded-full hover:bg-muted/60 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Balance with link to wallet page */}
        <Link
          to="/dashboard/wallet"
          className="group block mb-6 sm:mb-7 -mx-1 px-1 py-1 rounded-2xl hover:bg-primary/[0.04] transition-colors"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[10.5px] uppercase tracking-[0.22em] font-bold text-muted-foreground/70">
              Available balance
            </p>
            <span className="text-[10.5px] font-semibold text-primary inline-flex items-center gap-1 group-hover:gap-1.5 transition-all opacity-70 group-hover:opacity-100">
              Manage <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-14 w-56" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-[10.5px] font-bold text-muted-foreground/70 mb-1.5">GHS</span>
              <p className="text-[2.6rem] sm:text-[3.1rem] md:text-[3.4rem] leading-[0.95] font-display font-extrabold tracking-[-0.04em] tabular text-foreground">
                {hidden
                  ? '••••••'
                  : Number(animated.toFixed(2)).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
              </p>
            </div>
          )}
        </Link>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mb-6">
          <Link
            to="/dashboard/wallet"
            className="group flex-1 inline-flex items-center justify-center gap-1.5 h-12 rounded-full bg-primary text-primary-foreground text-[13.5px] font-bold shadow-[0_12px_28px_-10px_hsl(var(--primary)/0.55)] hover:shadow-[0_16px_32px_-10px_hsl(var(--primary)/0.65)] hover:-translate-y-0.5 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" /> Fund wallet
          </Link>
          <Link
            to="/dashboard/transactions"
            className="inline-flex items-center justify-center gap-1.5 h-12 px-5 rounded-full bg-card/70 hover:bg-card border border-border/70 backdrop-blur-md text-[13px] font-semibold text-foreground/85 hover:text-foreground hover:border-primary/35 transition-all active:scale-[0.98]"
          >
            <Receipt className="w-4 h-4" /> History
          </Link>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 pt-5 border-t border-border/60">
          <Stat
            icon={Wallet}
            label="Orders"
            value={ordersLoading ? '—' : Number(totalOrders || 0).toLocaleString('en-US')}
          />
          <Stat
            icon={TrendingUp}
            label="Total spent"
            value={ordersLoading ? '—' : formatPrice(totalSpent)}
            align="right"
          />
        </div>
      </div>
    </section>
  );
};

const Stat = ({
  icon: Icon,
  label,
  value,
  align = 'left',
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  align?: 'left' | 'right';
}) => (
  <div className={`flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
    <div className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground/70 mb-1.5">
      <Icon className="w-2.5 h-2.5 text-primary" /> {label}
    </div>
    <p className="text-[14px] font-bold tabular leading-tight">{value}</p>
  </div>
);

export default WalletHeroPanel;
