import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownCircle, Eye, EyeOff, Receipt, ShieldCheck, Plus } from 'lucide-react';
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
    <section
      className="glass-hero-emerald relative overflow-hidden rounded-3xl p-5 sm:p-6 text-primary-foreground"
    >
      {/* decorative orbs */}
      <div className="absolute -top-20 -right-16 w-60 h-60 rounded-full bg-white/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-12 w-52 h-52 rounded-full bg-[hsl(42_96%_60%/0.18)] blur-3xl pointer-events-none" />
      {/* top sheen */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />

      <div className="relative">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-primary-foreground/80">
              <ShieldCheck className="w-3 h-3" /> YieGo Wallet
            </div>
            <p className="text-[11px] text-primary-foreground/70 mt-1.5 max-w-[18rem] leading-snug">
              Fund once. Pay for any service. Track everything.
            </p>
          </div>
          <button
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
            className="p-2 -m-2 rounded-full hover:bg-white/10 transition-colors"
          >
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest font-bold text-primary-foreground/70 mb-1.5">
            Available balance
          </p>
          {loading ? (
            <Skeleton className="h-10 w-44 bg-white/20" />
          ) : (
            <p className="text-[2.25rem] sm:text-[2.5rem] leading-none font-display font-bold tracking-tight tabular">
              {hidden ? '••••••' : formatPrice(Number(animated.toFixed(2)))}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Link
            to="/dashboard/wallet"
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full bg-background text-foreground text-sm font-bold hover:bg-background/90 transition-colors active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> Fund wallet
          </Link>
          <Link
            to="/dashboard/transactions"
            className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-full bg-white/15 hover:bg-white/25 text-sm font-semibold transition-colors active:scale-[0.98]"
          >
            <Receipt className="w-4 h-4" /> History
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/15">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-primary-foreground/70">Orders</p>
            <p className="text-base font-bold tabular mt-1">
              {ordersLoading ? '—' : Number(totalOrders || 0).toLocaleString('en-US')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest font-bold text-primary-foreground/70">Total spent</p>
            <p className="text-base font-bold tabular mt-1">
              {ordersLoading ? '—' : formatPrice(totalSpent)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WalletHeroPanel;
