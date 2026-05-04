import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { X, ArrowUpRight } from 'lucide-react';
import { getDevicePlatform, isStandalone, isIOSSafari } from '@/hooks/useDeviceDetect';
import { useIsMobile } from '@/hooks/use-mobile';

const DISMISS_KEY = 'yiego_app_banner_dismissed';
const DISMISS_DAYS = 7;

const AppBanner = () => {
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  useEffect(() => {
    if (!isMobile) return;
    if (isStandalone()) return;
    if (location.pathname.startsWith('/dashboard')) return;
    if (location.pathname.startsWith('/app')) return;
    if (location.pathname.startsWith('/admin')) return;
    if (location.pathname.startsWith('/agent')) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return;
    }

    const platform = getDevicePlatform();
    if (platform === 'desktop') return;
    if (platform === 'ios' && !isIOSSafari()) return;
    setVisible(true);
  }, [isMobile, location.pathname]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  const platform = getDevicePlatform();
  const isIOS = platform === 'ios';
  const ctaLabel = isIOS ? 'View steps' : 'Install';

  return (
    <div
      id="yiego-app-banner"
      className="relative z-[60] border-b border-border/60 bg-gradient-to-r from-card via-card to-card/80 backdrop-blur-md"
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="relative shrink-0">
          <img
            src="/yiego-icon.png?v=2"
            alt="YieGo"
            className="w-10 h-10 rounded-xl ring-1 ring-border/60"
            loading="eager"
          />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-card" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold leading-tight text-foreground">Install YieGo</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
            Faster access from your home screen
          </p>
        </div>
        <Link
          to={isIOS ? '/app/ios' : '/app/android'}
          className="shrink-0 text-primary-foreground text-[12px] font-bold px-3.5 h-9 rounded-full inline-flex items-center gap-1.5 active:scale-[0.97] transition-all"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--gold-glow)))',
            boxShadow: '0 6px 16px -6px hsl(var(--primary) / 0.55)',
          }}
        >
          {ctaLabel} <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-md hover:bg-muted/60 transition-colors shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default AppBanner;
