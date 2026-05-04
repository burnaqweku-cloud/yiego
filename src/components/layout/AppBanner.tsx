import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { X, Download, Plus } from 'lucide-react';
import { getDevicePlatform, isStandalone, isIOSSafari } from '@/hooks/useDeviceDetect';
import { useIsMobile } from '@/hooks/use-mobile';

const DISMISS_KEY = 'datasika_app_banner_dismissed';
const DISMISS_DAYS = 7;

const AppBanner = () => {
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  useEffect(() => {
    if (!isMobile) return;
    if (isStandalone()) return;

    // Don't show on dashboard, app install, admin, or agent routes
    if (location.pathname.startsWith('/dashboard')) return;
    if (location.pathname.startsWith('/app')) return;
    if (location.pathname.startsWith('/admin')) return;
    if (location.pathname.startsWith('/agent')) return;

    // Check localStorage dismiss
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return;
    }

    const platform = getDevicePlatform();
    if (platform === 'desktop') return;

    // iOS: ONLY show banner if using Safari — hide completely otherwise
    if (platform === 'ios' && !isIOSSafari()) return;

    // Android: always show
    setVisible(true);
  }, [isMobile, location.pathname]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  const platform = getDevicePlatform();
  const isIOS = platform === 'ios';

  return (
    <div
      id="datasika-app-banner"
      className="flex items-center gap-3 px-4 py-2.5 relative z-[60] border-b border-border/60"
      style={{
        background: 'hsl(var(--card))',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <img
        src="/datasika-icon.png?v=2"
        alt="DataSika"
        className="w-10 h-10 rounded-xl shrink-0"
        loading="eager"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight text-foreground">DataSika</p>
        <p className="text-xs text-muted-foreground leading-tight">
          {isIOS ? 'Fast data delivery for Ghana' : 'Get the DataSika app'}
        </p>
      </div>
      <Link
        to={isIOS ? '/app/ios' : '/app/android'}
        className="shrink-0 text-primary-foreground text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 btn-press transition-all duration-150"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--gold-glow)))',
          boxShadow: '0 2px 8px hsl(var(--primary) / 0.35)',
        }}
      >
        {isIOS ? (
          <>
            <Plus className="w-3.5 h-3.5" />
            Get App
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            Download
          </>
        )}
      </Link>
      <button
        onClick={handleDismiss}
        className="p-1.5 rounded-md hover:bg-muted/60 transition-colors shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Close app banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default AppBanner;
