/**
 * Detailed live delivery status panel — redesigned.
 * Shows network status, queue depth, last delivered, and a signal-bar gauge.
 */
import { useDeliveryTracker, type DeliverySeverity } from '@/hooks/useDeliveryTracker';
import { Rocket, Gauge, Hourglass, TriangleAlert, Activity, CheckCircle2, Layers, Radio } from 'lucide-react';

interface PanelConfig {
  label: string;
  tagline: string;
  icon: typeof Rocket;
  level: 1 | 2 | 3 | 4 | 5;
  accent: string;
  bar: string;
  ring: string;
  surface: string;
  pill: string;
}

const CONFIG: Record<DeliverySeverity, PanelConfig> = {
  healthy: {
    label: 'Lightning Fast',
    tagline: 'Carriers are responding instantly. Perfect time to top up.',
    icon: Rocket, level: 5,
    accent: 'text-success', bar: 'bg-success',
    ring: 'ring-success/25', surface: 'bg-success/[0.06]',
    pill: 'bg-success/15 text-success',
  },
  good: {
    label: 'Smooth Sailing',
    tagline: 'Bundles are landing in under a minute on most networks.',
    icon: Gauge, level: 4,
    accent: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500',
    ring: 'ring-emerald-500/25', surface: 'bg-emerald-500/[0.06]',
    pill: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  moderate: {
    label: 'Steady Flow',
    tagline: 'A short queue right now — your order is moving through.',
    icon: Hourglass, level: 3,
    accent: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500',
    ring: 'ring-amber-500/25', surface: 'bg-amber-500/[0.06]',
    pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  slow: {
    label: 'Heavy Traffic',
    tagline: 'Networks are busy. Orders still flowing, just a bit slower.',
    icon: Hourglass, level: 2,
    accent: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500',
    ring: 'ring-orange-500/25', surface: 'bg-orange-500/[0.06]',
    pill: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  delayed: {
    label: 'Backed Up',
    tagline: 'Carrier is slow. Every order is queued safely and will be delivered.',
    icon: TriangleAlert, level: 1,
    accent: 'text-destructive', bar: 'bg-destructive',
    ring: 'ring-destructive/30', surface: 'bg-destructive/[0.06]',
    pill: 'bg-destructive/15 text-destructive',
  },
};

const DeliveryStatusPanel = () => {
  const { data, loading, error } = useDeliveryTracker();
  if (loading || error || !data) return null;

  const cfg = CONFIG[data.severity] ?? CONFIG.moderate;
  const Icon = cfg.icon;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border/40 ring-1 ${cfg.ring} ${cfg.surface} p-4 animate-fade-in`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`relative shrink-0 w-11 h-11 rounded-2xl bg-background/70 ring-1 ${cfg.ring} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${cfg.accent}`} strokeWidth={2.4} />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full animate-ping opacity-70 ${cfg.bar}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.bar}`} />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-sm font-display font-bold ${cfg.accent}`}>{cfg.label}</h3>
            <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-[0.1em] px-1.5 py-[2px] rounded-full leading-none ${cfg.pill}`}>
              <Radio className="w-2.5 h-2.5" /> live network status
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{cfg.tagline}</p>
        </div>
      </div>

      {/* Signal gauge */}
      <div className="mt-3 flex items-end gap-1 h-7">
        {[1, 2, 3, 4, 5].map((i) => {
          const active = i <= cfg.level;
          const heights = ['h-2', 'h-3', 'h-4', 'h-5', 'h-7'];
          return (
            <span
              key={i}
              className={`flex-1 rounded ${heights[i - 1]} ${active ? cfg.bar : 'bg-muted/50'} ${
                active && i === cfg.level ? 'animate-pulse' : ''
              }`}
            />
          );
        })}
      </div>

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat
          icon={Layers}
          label="In queue"
          value={data.waiting > 0 ? `${data.waiting}` : '0'}
          accent={cfg.accent}
        />
        <Stat
          icon={Activity}
          label="Processing"
          value={data.checkingNow ? 'Now' : 'Idle'}
          accent={cfg.accent}
        />
        <Stat
          icon={CheckCircle2}
          label="Last delivered"
          value={data.lastDelivered ? formatRelative(data.lastDelivered) : '—'}
          accent="text-success"
        />
      </div>

      {data.fetchedAt && (
        <p className="text-[9.5px] text-muted-foreground/60 mt-2.5 text-right">
          Refreshed {formatRelative(data.fetchedAt)}
        </p>
      )}
    </div>
  );
};

const Stat = ({
  icon: I, label, value, accent,
}: { icon: typeof Activity; label: string; value: string; accent: string }) => (
  <div className="rounded-xl bg-background/60 border border-border/40 px-2.5 py-2">
    <div className="flex items-center gap-1 text-muted-foreground">
      <I className={`w-3 h-3 ${accent}`} />
      <span className="text-[9px] uppercase tracking-wide font-semibold">{label}</span>
    </div>
    <p className={`text-[12px] font-bold mt-0.5 ${accent}`}>{value}</p>
  </div>
);

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
