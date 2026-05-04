/**
 * Compact live delivery estimate chip for buy pages.
 * Uses a unified status mapping — text, color, and icon always come from ONE source.
 * DO NOT confuse with the Agent Dashboard delivery panel (separate component).
 */
import { useDeliveryTracker, type DeliverySeverity } from '@/hooks/useDeliveryTracker';
import { Zap, Clock, AlertTriangle } from 'lucide-react';

/* ── Unified status mapping: single source of truth ── */
interface StatusConfig {
  label: string;
  description: string;
  icon: typeof Zap;
  dot: string;
  text: string;
  bg: string;
  glow: string;
  badge: string;
}

const STATUS_MAP: Record<DeliverySeverity, StatusConfig> = {
  healthy: {
    label: 'Instant delivery',
    description: 'Orders are being delivered instantly right now',
    icon: Zap,
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
    glow: 'shadow-[0_0_8px_hsl(var(--success)/0.25)]',
    badge: 'bg-success/15 text-success',
  },
  good: {
    label: 'Fast delivery',
    description: 'Orders are currently delivered within minutes',
    icon: Zap,
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    glow: 'shadow-[0_0_8px_rgba(16,185,129,0.2)]',
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  moderate: {
    label: 'Normal delivery',
    description: 'Orders are currently delivered within 1–2 hours',
    icon: Clock,
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
    glow: 'shadow-[0_0_8px_rgba(245,158,11,0.2)]',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  slow: {
    label: 'Slow delivery',
    description: 'Orders may take 2–4 hours due to network delays',
    icon: Clock,
    dot: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/30',
    glow: 'shadow-[0_0_8px_rgba(249,115,22,0.2)]',
    badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  delayed: {
    label: 'Delayed delivery',
    description: 'Deliveries are currently delayed. Orders are still being processed',
    icon: AlertTriangle,
    dot: 'bg-destructive',
    text: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/30',
    glow: 'shadow-[0_0_8px_hsl(var(--destructive)/0.25)]',
    badge: 'bg-destructive/15 text-destructive',
  },
};

const LiveDeliveryChip = () => {
  const { data, loading, error } = useDeliveryTracker();
  if (loading || error || !data) return null;

  const config = STATUS_MAP[data.severity] ?? STATUS_MAP.moderate;
  const Icon = config.icon;

  return (
    <div
      className={`
        flex items-start gap-2 px-3 py-2 rounded-xl border
        transition-all duration-700 ease-in-out
        ${config.bg} ${config.glow}
        animate-fade-in w-full
      `}
    >
      {/* Left: pulsing dot + icon */}
      <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
        <span className="relative flex h-[6px] w-[6px]">
          <span className={`absolute inline-flex h-full w-full rounded-full animate-ping opacity-75 ${config.dot}`} />
          <span className={`relative inline-flex rounded-full h-[6px] w-[6px] ${config.dot}`} />
        </span>
        <Icon className={`w-3.5 h-3.5 ${config.text} opacity-80`} strokeWidth={2.5} />
      </div>

      {/* Center: label + description (no truncation) */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className={`text-[11px] font-bold leading-tight ${config.text}`}>
          {config.label}
        </span>
        <span className={`text-[9.5px] leading-snug ${config.text} opacity-70 font-medium`}>
          {config.description}
        </span>
      </div>

      {/* Right: LIVE badge */}
      <span
        className={`
          shrink-0 text-[7px] uppercase tracking-[0.08em] font-extrabold
          px-[6px] py-[2px] rounded-full leading-none mt-0.5
          ${config.badge}
          animate-pulse
        `}
      >
        live
      </span>
    </div>
  );
};

export default LiveDeliveryChip;
