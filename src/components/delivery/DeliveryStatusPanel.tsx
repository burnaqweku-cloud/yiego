/**
 * Detailed live delivery status panel for order pages.
 */
import { useDeliveryTracker, type DeliverySeverity } from '@/hooks/useDeliveryTracker';
import { Zap, Clock, CheckCircle, Loader2, Activity } from 'lucide-react';

const SEVERITY_CONFIG: Record<DeliverySeverity, { icon: typeof Zap; color: string; border: string; bg: string }> = {
  healthy:  { icon: Zap,    color: 'text-success',     border: 'border-success/20',     bg: 'bg-success/5' },
  good:     { icon: Zap,    color: 'text-emerald-500', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
  moderate: { icon: Clock,  color: 'text-amber-500',   border: 'border-amber-500/20',   bg: 'bg-amber-500/5' },
  slow:     { icon: Clock,  color: 'text-orange-500',  border: 'border-orange-500/20',  bg: 'bg-orange-500/5' },
  delayed:  { icon: Loader2, color: 'text-destructive', border: 'border-destructive/20', bg: 'bg-destructive/5' },
};

const DeliveryStatusPanel = () => {
  const { data, loading, error } = useDeliveryTracker();

  if (loading || error || !data) return null;

  const cfg = SEVERITY_CONFIG[data.severity] || SEVERITY_CONFIG.moderate;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-2xl border p-4 ${cfg.border} ${cfg.bg} animate-fade-in`}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${cfg.color.replace('text-', 'bg-')}`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.color.replace('text-', 'bg-')}`} />
        </span>
        <h3 className="text-sm font-display font-bold">Live Delivery Estimate</h3>
        <span className="ml-auto text-[9px] text-muted-foreground font-medium tracking-wide uppercase">Live</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${cfg.color} shrink-0`} />
        <p className={`text-sm font-semibold ${cfg.color}`}>{data.message}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {data.checkingNow && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="w-3 h-3" />
            <span>Currently checking orders</span>
          </div>
        )}
        {data.waiting > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{data.waiting} order{data.waiting !== 1 ? 's' : ''} in queue</span>
          </div>
        )}
        {data.lastDelivered && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-success" />
            <span>Last delivered: {formatRelative(data.lastDelivered)}</span>
          </div>
        )}
      </div>

      {data.fetchedAt && (
        <p className="text-[9px] text-muted-foreground/60 mt-2">
          Updated {formatRelative(data.fetchedAt)}
        </p>
      )}
    </div>
  );
};

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export default DeliveryStatusPanel;
