import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  delay?: number;
}

const KPICard = ({ label, value, icon: Icon, trend, trendUp, delay = 0 }: KPICardProps) => {
  return (
    <div
      className="surface-premium rounded-2xl p-4 animate-hero-in transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.25)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]">
          <Icon className="w-[18px] h-[18px] text-primary" />
        </div>
        {trend && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full tabular ${
            trendUp ? 'bg-success/10 text-success ring-1 ring-success/20' : 'bg-destructive/10 text-destructive ring-1 ring-destructive/20'
          }`}>
            {trendUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {trend}
          </span>
        )}
      </div>
      <p className="text-xl font-bold leading-none tabular tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">{label}</p>
    </div>
  );
};

export default KPICard;
