import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Info, AlertTriangle, AlertOctagon, CheckCircle2, ChevronDown } from 'lucide-react';
import { useSiteNotice, type SiteNoticeState } from '@/contexts/SiteNoticeContext';
import { isNoticeLive } from '@/lib/site-notice';
import { cn } from '@/lib/utils';

/** Routes where the service notice banner is allowed to appear */
const ALLOWED_ROUTES = ['/buy-data', '/dashboard', '/agent', '/store'];
const isAllowedRoute = (pathname: string) =>
  ALLOWED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));

type Severity = SiteNoticeState['severity'];

const severityConfig: Record<Severity, {
  wrap: string;
  iconWrap: string;
  icon: typeof Info;
  chip: string;
  label: string;
}> = {
  info: {
    wrap: 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-200/70 dark:border-sky-900/60 text-sky-900 dark:text-sky-100',
    iconWrap: 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200',
    icon: Info,
    chip: 'bg-sky-100/80 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200',
    label: 'Info',
  },
  success: {
    wrap: 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-100',
    iconWrap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
    icon: CheckCircle2,
    chip: 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
    label: 'Update',
  },
  warning: {
    wrap: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-900/60 text-amber-900 dark:text-amber-100',
    iconWrap: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200',
    icon: AlertTriangle,
    chip: 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200',
    label: 'Warning',
  },
  outage: {
    wrap: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-900/60 text-rose-900 dark:text-rose-100',
    iconWrap: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
    icon: AlertOctagon,
    chip: 'bg-rose-100/80 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
    label: 'Outage',
  },
};

interface SiteNoticeBannerProps {
  /** Force preview mode — ignores route allowlist and dismissed state */
  preview?: boolean;
  /** Optional override notice (used for admin live preview) */
  notice?: SiteNoticeState;
  /** Whether dismiss button is shown (default true) */
  dismissible?: boolean;
  className?: string;
}

const SiteNoticeBanner = ({ preview = false, notice: overrideNotice, dismissible = true, className }: SiteNoticeBannerProps) => {
  const { notice: ctxNotice } = useSiteNotice();
  const notice = overrideNotice ?? ctxNotice;
  const { pathname } = useLocation();

  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const messageRef = useRef<HTMLParagraphElement>(null);

  // Reset dismissal when content changes
  const contentKey = `${notice.enabled}-${notice.title}-${notice.message}-${notice.severity}-${notice.start_time}-${notice.end_time}`;
  const prevKey = useRef(contentKey);
  useEffect(() => {
    if (prevKey.current !== contentKey) {
      prevKey.current = contentKey;
      setDismissed(false);
      setExpanded(false);
    }
  }, [contentKey]);

  // Detect if message overflows the clamp
  useLayoutEffect(() => {
    const el = messageRef.current;
    if (!el) { setNeedsClamp(false); return; }
    // Compare scrollHeight vs clientHeight at clamped state
    const overflowing = el.scrollHeight - el.clientHeight > 1;
    setNeedsClamp(overflowing);
  }, [notice.message, notice.title, expanded]);

  if (!preview) {
    if (!isAllowedRoute(pathname)) return null;
    if (!isNoticeLive(notice)) return null;
    if (dismissed) return null;
  } else {
    // In preview, only require a title to render something meaningful
    if (!notice.title?.trim()) return null;
  }

  const sev = (notice.severity in severityConfig ? notice.severity : 'info') as Severity;
  const cfg = severityConfig[sev];
  const Icon = cfg.icon;

  const showNetworkChip = notice.affected_network && notice.affected_network !== 'All';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'border-b backdrop-blur-sm transition-colors',
        cfg.wrap,
        className,
      )}
    >
      <div className="container px-3 sm:px-4 py-2 sm:py-2.5">
        <div className="flex items-start gap-2.5 sm:gap-3">
          {/* Icon */}
          <div className={cn(
            'flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5',
            cfg.iconWrap,
          )}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row + chips */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-[13px] sm:text-sm leading-tight">
                {notice.title}
              </span>
              <span className={cn(
                'inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full',
                cfg.chip,
              )}>
                {cfg.label}
              </span>
              {showNetworkChip && (
                <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-foreground/5 text-foreground/70">
                  {notice.affected_network}
                </span>
              )}
            </div>

            {/* Message */}
            {notice.message && (
              <>
                <p
                  ref={messageRef}
                  className={cn(
                    'text-[12px] sm:text-[13px] leading-snug mt-0.5 opacity-90',
                    !expanded && 'line-clamp-2 sm:line-clamp-2',
                  )}
                >
                  {notice.message}
                </p>
                {(needsClamp || expanded) && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold underline-offset-2 hover:underline opacity-90"
                    aria-expanded={expanded}
                  >
                    {expanded ? 'Show less' : 'Show more'}
                    <ChevronDown
                      className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Dismiss */}
          {dismissible && !preview && (
            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 -mr-1 rounded-full hover:bg-foreground/10 transition-colors shrink-0"
              aria-label="Dismiss notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SiteNoticeBanner;
