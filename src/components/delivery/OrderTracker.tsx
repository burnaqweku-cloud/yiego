/**
 * Order-specific progress tracker.
 * Replaces the generic DeliveryStatusPanel on order detail pages.
 * Uses elapsed time + current delivery estimate to show order-specific progress.
 */
import { useMemo } from 'react';
import { useDeliveryTracker, type DeliverySeverity } from '@/hooks/useDeliveryTracker';
import { Clock, Loader2, CheckCircle, AlertTriangle, Zap } from 'lucide-react';

interface OrderTrackerProps {
  orderCreatedAt: string;
  orderStatus: string;
  /**
   * Phase 2 bulk-dispatch queue state. When set, OVERRIDES the time-based
   * tracker copy with bulk-dispatch-specific messaging so customers don't see
   * a stale time estimate while their order is sitting in a manual batch.
   * Allowed values: 'queued' | 'batched' | 'sent'. Anything else is ignored.
   */
  queueState?: string | null;
}

type TrackerState = 'queued' | 'processing' | 'almost_done' | 'delayed';

const ESTIMATE_RANGE: Record<DeliverySeverity, { min: number; max: number; label: string }> = {
  healthy:  { min: 0,   max: 10,  label: 'within minutes' },
  good:     { min: 5,   max: 30,  label: 'within minutes' },
  moderate: { min: 60,  max: 120, label: '1–2 hours' },
  slow:     { min: 120, max: 240, label: '2–4 hours' },
  delayed:  { min: 240, max: 480, label: 'longer than usual' },
};

const STATE_CONFIG: Record<TrackerState, { icon: typeof Clock; color: string; bg: string; border: string }> = {
  queued:       { icon: Clock,         color: 'text-primary',     bg: 'bg-primary/5',     border: 'border-primary/20' },
  processing:   { icon: Loader2,       color: 'text-amber-500',   bg: 'bg-amber-500/5',   border: 'border-amber-500/20' },
  almost_done:  { icon: CheckCircle,   color: 'text-success',     bg: 'bg-success/5',     border: 'border-success/20' },
  delayed:      { icon: AlertTriangle, color: 'text-orange-500',  bg: 'bg-orange-500/5',  border: 'border-orange-500/20' },
};

const STATE_MESSAGE: Record<TrackerState, string> = {
  queued:      'Your order has been received and is in queue',
  processing:  'Your order is being processed and should be delivered soon',
  almost_done: 'Your order is close to being delivered. Please wait a moment',
  delayed:     'Your order is taking longer than expected but is still being processed',
};

// Phase 2: bulk-dispatch queue state overrides for customer-facing copy.
// queue_state IN ('queued','batched','sent') — see Phase 2 spec.
const QUEUE_STATE_OVERRIDE: Record<
  'queued' | 'batched' | 'sent',
  { state: TrackerState; message: string; estimate: string; progress: number }
> = {
  queued: {
    state: 'queued',
    message: 'Waiting in queue — your order is being prepared for dispatch',
    estimate: 'usually within 30 minutes',
    progress: 25,
  },
  batched: {
    state: 'processing',
    message: 'Almost there — your order is grouped and waiting to be sent',
    estimate: 'usually within 30 minutes',
    progress: 55,
  },
  sent: {
    state: 'almost_done',
    message: 'Dispatched — waiting for delivery confirmation',
    estimate: 'should arrive shortly',
    progress: 85,
  },
};

function getTrackerState(elapsedMinutes: number, severity: DeliverySeverity): TrackerState {
  const range = ESTIMATE_RANGE[severity];
  const rangeMax = range.max;

  if (elapsedMinutes < rangeMax * 0.3) return 'queued';
  if (elapsedMinutes < rangeMax * 0.7) return 'processing';
  if (elapsedMinutes <= rangeMax) return 'almost_done';
  return 'delayed';
}

function getProgressPercent(elapsedMinutes: number, severity: DeliverySeverity): number {
  const range = ESTIMATE_RANGE[severity];
  const pct = Math.min((elapsedMinutes / Math.max(range.max, 1)) * 100, 100);
  // Cap at 95% until delivered
  return Math.min(pct, 95);
}

const OrderTracker = ({ orderCreatedAt, orderStatus, queueState }: OrderTrackerProps) => {
  const { data, loading } = useDeliveryTracker();

  const severity = data?.severity || 'moderate';

  const computed = useMemo(() => {
    const created = new Date(orderCreatedAt).getTime();
    const elapsedMs = Date.now() - created;
    const elapsedMins = Math.max(0, elapsedMs / 60_000);
    return {
      state: getTrackerState(elapsedMins, severity),
      elapsed: elapsedMins,
      progress: getProgressPercent(elapsedMins, severity),
    };
  }, [orderCreatedAt, severity]);

  // Don't show for delivered/failed/voided orders
  if (!['Pending', 'Processing', 'Paid', 'Reprocessed'].includes(orderStatus)) return null;

  // Phase 2: if the order is in the bulk-dispatch queue, override copy.
  const queueOverride = queueState === 'queued' || queueState === 'batched' || queueState === 'sent'
    ? QUEUE_STATE_OVERRIDE[queueState]
    : null;

  const state: TrackerState = queueOverride?.state ?? computed.state;
  const progress = queueOverride?.progress ?? computed.progress;
  const message = queueOverride?.message ?? STATE_MESSAGE[state];
  const cfg = STATE_CONFIG[state];
  const Icon = cfg.icon;
  const estimateLabel = queueOverride?.estimate ?? ESTIMATE_RANGE[severity]?.label;

  return (
    <div className={`rounded-2xl border p-4 ${cfg.border} ${cfg.bg} animate-fade-in`}>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${cfg.color.replace('text-', 'bg-')}`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.color.replace('text-', 'bg-')}`} />
        </span>
        <h3 className="text-sm font-bold">Order Progress</h3>
        <span className="ml-auto text-[9px] text-muted-foreground font-bold tracking-wide uppercase">Live</span>
      </div>

      {/* Status message */}
      <div className="flex items-start gap-2 mb-3">
        <Icon className={`w-4 h-4 ${cfg.color} shrink-0 mt-0.5 ${state === 'processing' ? 'animate-spin' : ''}`} />
        <div>
          <p className={`text-sm font-semibold ${cfg.color}`}>{message}</p>
          {estimateLabel && !loading && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Estimated: {estimateLabel}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${cfg.color.replace('text-', 'bg-')}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default OrderTracker;
