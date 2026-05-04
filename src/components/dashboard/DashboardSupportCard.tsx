import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Headphones } from 'lucide-react';

const DashboardSupportCard = () => {
  const { profile } = useAuth();

  return (
    <Link to="/support" className="block group">
      <div className="support-card-glass relative overflow-hidden p-4 transition-all duration-200 active:scale-[0.98] group-hover:shadow-lg">
        <div
          className="pointer-events-none absolute inset-0 rounded-[20px]"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 5% 50%, hsl(var(--primary) / 0.08), transparent)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 rounded-full blur-md opacity-20"
              style={{ background: 'hsl(var(--primary) / 0.50)' }}
            />
            <div className="relative w-12 h-12 rounded-full flex items-center justify-center shadow-sm bg-primary/15 border border-primary/25">
              <Headphones className="w-6 h-6 text-primary" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-bold text-foreground leading-tight">Support Center</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 border border-primary/20 text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Available
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Get help with orders, deposits, and more.
            </p>
          </div>

          <Button
            size="sm"
            className="shrink-0 font-bold text-xs rounded-full px-4 h-9 shadow-sm transition-all duration-150 active:scale-95"
          >
            Get Help
          </Button>
        </div>
      </div>
    </Link>
  );
};

export default DashboardSupportCard;
