/**
 * Live delivery activity panel for agent dashboard.
 * Shows system delivery status + last successful delivery time.
 */
import { useDeliveryTracker, type DeliverySeverity } from '@/hooks/useDeliveryTracker';
import { Zap, Clock, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const SEVERITY_CONFIG: Record<DeliverySeverity, { icon: typeof Zap; color: string; border: string; bg: string; dot: string }> = {
  healthy:  { icon: Zap,           color: 'text-success',     border: 'border-success/20',     bg: 'bg-success/5',     dot: 'bg-success' },
  good:     { icon: Zap,           color: 'text-emerald-500', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', dot: 'bg-emerald-500' },
  moderate: { icon: Clock,         color: 'text-amber-500',   border: 'border-amber-500/20',   bg: 'bg-amber-500/5',  dot: 'bg-amber-500' },
  slow:     { icon: Clock,         color: 'text-orange-500',  border: 'border-orange-500/20',  bg: 'bg-orange-500/5', dot: 'bg-orange-500' },
  delayed:  { icon: AlertTriangle, color: 'text-destructive', border: 'border-destructive/20', bg: 'bg-destructive/5', dot: 'bg-destructive' },
};

const SEVERITY_LABEL: Record<DeliverySeverity, string> = {
  healthy:  'Orders are being delivered instantly right now',
  good:     'Orders are being delivered within minutes',
  moderate: 'Orders are currently taking about 1–2 hours',
  slow:     'Orders may take 2–4 hours due to network delays',
  delayed:  'Deliveries are currently delayed. Orders are still being processed',
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'No recent deliveries yet';
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'No recent deliveries yet';
    const diff = Date.now() - date.getTime();
    if (diff < 0) return 'just now';
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min${Math.floor(diff / 60_000) !== 1 ? 's' : ''} ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hour${Math.floor(diff / 3_600_000) !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return 'No recent deliveries yet';
  }
}

const AgentDeliveryPanel = () => {
  const { data, loading, error } = useDeliveryTracker();

  if (loading) {
    return (
      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="h-16 animate-pulse bg-muted rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) return null;

  const cfg = SEVERITY_CONFIG[data.severity] || SEVERITY_CONFIG.moderate;
  const Icon = cfg.icon;
  const label = SEVERITY_LABEL[data.severity] || data.message;

  // Extract last delivered timestamp
  const lastDeliveredTime = data.lastDelivered && typeof data.lastDelivered === 'object' && data.lastDelivered.deliveredAt
    ? data.lastDelivered.deliveredAt
    : null;

  return (
    <Card className={`card-shadow overflow-hidden ${cfg.border}`}>
      <div className={`h-1 ${cfg.dot}`} />
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${cfg.dot}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.dot}`} />
          </span>
          <h3 className="text-sm font-bold">System Delivery Activity</h3>
          <span className="ml-auto text-[9px] text-muted-foreground font-bold tracking-wide uppercase">Live</span>
        </div>

        {/* Status message */}
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${cfg.color} shrink-0`} />
          <p className={`text-sm font-semibold ${cfg.color}`}>{label}</p>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-success" />
            <span>Last delivered: {formatRelativeTime(lastDeliveredTime)}</span>
          </div>
          {data.fetchedAt && (
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              <span>Updated {formatRelativeTime(data.fetchedAt)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AgentDeliveryPanel;
