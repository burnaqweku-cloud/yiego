import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ArrowRight, ArrowDownCircle, Eye, EyeOff } from 'lucide-react';
import { formatPrice } from '@/data/bundles';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface DashboardWalletCardProps {
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
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * target);
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration, enabled]);

  return value;
}

const DashboardWalletCard = ({ balance, totalOrders, totalSpent, loading, ordersLoading }: DashboardWalletCardProps) => {
  const animatedBalance = useCountUp(balance, 900, !loading);
  const [hidden, setHidden] = useState(false);

  return (
    <div className="surface-premium rounded-2xl overflow-hidden">
      <div className="p-5 pb-4 relative">
        {/* Subtle gold gradient accent */}
        <div
          className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.07] blur-2xl pointer-events-none"
          style={{ background: 'hsl(var(--primary))' }}
        />

        <div className="relative flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <Wallet className="w-[18px] h-[18px] text-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Wallet</span>
          </div>
          <button
            onClick={() => setHidden(h => !h)}
            className="p-1.5 -m-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
          >
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Available Balance</p>
        {loading ? (
          <Skeleton className="h-10 w-40" />
        ) : (
          <p className="text-[2rem] leading-none font-display font-bold tracking-tight tabular count-animate">
            {hidden ? '••••••' : formatPrice(Number(animatedBalance.toFixed(2)))}
          </p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <Link to="/dashboard/wallet" className="flex-1">
            <Button size="sm" variant="premium" className="w-full gap-1.5 text-xs h-10">
              <ArrowDownCircle className="w-4 h-4" /> Deposit
            </Button>
          </Link>
          <Link to="/dashboard/wallet" className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs h-10">
              Manage <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Mini metrics */}
      <div className="grid grid-cols-2 border-t border-border/60 divide-x divide-border/60 bg-secondary/40">
        <div className="px-3 py-3 text-center">
          <p className="text-base font-bold tabular leading-none">{ordersLoading ? '—' : Number(totalOrders || 0).toLocaleString('en-US')}</p>
          <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider font-medium">Orders</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-base font-bold tabular leading-none">{ordersLoading ? '—' : formatPrice(totalSpent)}</p>
          <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider font-medium">Spent</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardWalletCard;
