import { useState, useMemo } from 'react';
import { ShoppingCart, Clock, CheckCircle, Wifi } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface UserOrder {
  status: string;
  bundle_size_gb: number;
  amount_ghs: number;
  created_at: string;
}

interface DashboardStatsProps {
  orders: UserOrder[];
  loading: boolean;
}

const DashboardStats = ({ orders, loading }: DashboardStatsProps) => {
  const [timeFilter, setTimeFilter] = useState<'today' | 'all'>('all');

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const filtered = timeFilter === 'today'
      ? orders.filter(o => new Date(o.created_at) >= todayStart)
      : orders;

    const total = filtered.length;
    const pending = filtered.filter(o => o.status === 'Pending' || o.status === 'Processing').length;
    const delivered = filtered.filter(o => o.status === 'Delivered').length;
    const totalGB = filtered.filter(o => o.status === 'Delivered').reduce((s, o) => s + Number(o.bundle_size_gb), 0);

    return { total, pending, delivered, totalGB };
  }, [orders, timeFilter]);

  const statItems = [
    { icon: ShoppingCart, label: 'Total', value: stats.total, color: 'text-foreground bg-muted/40' },
    { icon: Clock, label: 'Pending', value: stats.pending, color: 'text-primary bg-primary/10' },
    { icon: CheckCircle, label: 'Done', value: stats.delivered, color: 'text-success bg-success/10' },
    { icon: Wifi, label: 'Data', value: `${stats.totalGB}GB`, color: 'text-info bg-info/10' },
  ];

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold tracking-tight">Performance</h3>
        <div className="flex items-center bg-secondary/60 border border-border/60 rounded-lg p-0.5">
          {(['today', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-md transition-all duration-200 ${
                timeFilter === f
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'today' ? 'Today' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="surface-premium rounded-xl p-3">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-6 w-8" />
            </div>
          ))
        ) : (
          statItems.map((item) => (
            <div key={item.label} className="surface-premium rounded-xl p-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${item.color}`}>
                <item.icon className="w-3.5 h-3.5" />
              </div>
              <p className="text-lg font-display font-bold tracking-tight tabular leading-none count-animate">{item.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-1">{item.label}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DashboardStats;
