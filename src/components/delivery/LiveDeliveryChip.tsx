/**
 * Live delivery status — redesigned as a sleek "network speed gauge" card.
 * Single source of truth for severity → label, copy, color, icon, gauge level.
 */
import { useDeliveryTracker, type DeliverySeverity } from '@/hooks/useDeliveryTracker';
import { Rocket, Gauge, Hourglass, TriangleAlert, Radio } from 'lucide-react';

interface StatusConfig {
  label: string;
  tagline: string;
  icon: typeof Rocket;
  level: 1 | 2 | 3 | 4 | 5; // signal bars filled
  accent: string;        // text color
  bar: string;           // bar color
  ring: string;          // border ring
  surface: string;       // background
  pill: string;          // live pill
}

const STATUS_MAP: Record<DeliverySeverity, StatusConfig> = {
  healthy: {
    label: 'Lightning Fast',
    tagline: 'Bundles dropping in seconds — go for it.',
    icon: Rocket,
    level: 5,
    accent: 'text-success',
    bar: 'bg-success',
    ring: 'ring-success/25',
    surface: 'bg-success/[0.06]',
    pill: 'bg-success/15 text-success',
  },
  good: {
    label: 'Smooth Sailing',
    tagline: 'Most orders land in under a minute.',
    icon: Gauge,
    level: 4,
    accent: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-500',
    ring: 'ring-emerald-500/25',
    surface: 'bg-emerald-500/[0.06]',
    pill: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  moderate: {
    label: 'Steady Flow',
    tagline: 'A small queue — give it a few minutes.',
    icon: Hourglass,
    level: 3,
    accent: 'text-amber-600 dark:text-amber-400',
    bar: 'bg-amber-500',
    ring: 'ring-amber-500/25',
    surface: 'bg-amber-500/[0.06]',
    pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  slow: {
    label: 'Heavy Traffic',
    tagline: 'Network is busy — orders are still moving.',
    icon: Hourglass,
    level: 2,
    accent: 'text-orange-600 dark:text-orange-400',
    bar: 'bg-orange-500',
    ring: 'ring-orange-500/25',
    surface: 'bg-orange-500/[0.06]',
    pill: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  delayed: {
    label: 'Backed Up',
    tagline: 'Carrier is slow right now — every order is queued safely.',
    icon: TriangleAlert,
    level: 1,
    accent: 'text-destructive',
    bar: 'bg-destructive',
    ring: 'ring-destructive/30',
    surface: 'bg-destructive/[0.06]',
    pill: 'bg-destructive/15 text-destructive',
  },
};

const LiveDeliveryChip = () => {
  const { data, loading, error } = useDeliveryTracker();
  if (loading || error || !data) return null;

  const cfg = STATUS_MAP[data.severity] ?? STATUS_MAP.moderate;
  const Icon = cfg.icon;

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border border-border/40 ring-1 ${cfg.ring}
        ${cfg.surface} backdrop-blur-sm
        px-3.5 py-3 w-full animate-fade-in
      `}
    >
      {/* subtle moving sheen */}
      <div className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(90deg,transparent,black,transparent)]">
        <div className={`absolute -inset-y-2 -left-1/3 w-1/3 ${cfg.bar} opacity-[0.06] blur-xl animate-[slide_4s_ease-in-out_infinite]`} />
      </div>

      <div className="relative flex items-center gap-3">
        {/* Icon tile */}
        <div className={`relative shrink-0 w-9 h-9 rounded-xl bg-background/60 ring-1 ${cfg.ring} flex items-center justify-center`}>
          <Icon className={`w-[18px] h-[18px] ${cfg.accent}`} strokeWidth={2.4} />
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full rounded-full animate-ping opacity-70 ${cfg.bar}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.bar}`} />
          </span>
        </div>

        {/* Copy */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-[12.5px] font-bold leading-none ${cfg.accent}`}>{cfg.label}</p>
            <span className={`inline-flex items-center gap-1 text-[8.5px] font-extrabold uppercase tracking-[0.1em] px-1.5 py-[2px] rounded-full leading-none ${cfg.pill}`}>
              <Radio className="w-2 h-2" /> live
            </span>
          </div>
          <p className="text-[10.5px] text-muted-foreground mt-1 leading-snug font-medium">
            {cfg.tagline}
          </p>

          {/* signal bars */}
          <div className="mt-2 flex items-end gap-[3px] h-3">
            {[1, 2, 3, 4, 5].map((i) => {
              const active = i <= cfg.level;
              const heights = ['h-1', 'h-1.5', 'h-2', 'h-2.5', 'h-3'];
              return (
                <span
                  key={i}
                  className={`w-1 rounded-sm transition-all ${heights[i - 1]} ${
                    active ? cfg.bar : 'bg-muted/60'
                  } ${active && i === cfg.level ? 'animate-pulse' : ''}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slide {
          0% { transform: translateX(0%); }
          50% { transform: translateX(400%); }
          100% { transform: translateX(0%); }
        }
      `}</style>
    </div>
  );
};

export default LiveDeliveryChip;
