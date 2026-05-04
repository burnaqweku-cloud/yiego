import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/* ── Official WhatsApp glyph ── */
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/* ── Config ── */
const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb78XFeHFxOzC57sVg1R';
const DISMISS_KEY = 'yiego_wa_dismissed_date';

// Timing constants (ms)
const BUBBLE_VISIBLE_MS = 4_000;   // bubble stays visible for 4s
const BUBBLE_HIDDEN_MS  = 20_000;  // bubble hidden for 20s between shows
const FADE_MS           = 200;     // CSS transition duration

/* ── Helpers ── */
const getTodayString = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

const isDismissedToday = (): boolean => {
  const stored = localStorage.getItem(DISMISS_KEY);
  if (!stored) return false;
  return stored === getTodayString();
};

const WhatsAppChannelButton = () => {
  const [visible, setVisible]         = useState(false);
  const [showBubble, setShowBubble]   = useState(false);
  const [dismissed, setDismissed]     = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const cycleRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location    = useLocation();

  // ── Page visibility guard ──
  const path = location.pathname;
  const isHiddenPage =
    path.startsWith('/tg/') ||
    path === '/tg' ||
    path === '/' ||
    path === '/agent' ||
    path === '/become-an-agent' ||
    path.startsWith('/store/') ||
    path.startsWith('/admin') ||
    path.startsWith('/agent/') ||
    path.startsWith('/dashboard/support') ||
    path === '/support' ||
    // Sensitive flow screens — hide on auth, checkout entry, and order detail views
    path === '/auth' ||
    path === '/reset-password' ||
    path === '/checkout' ||
    path === '/order-confirmation' ||
    /^\/dashboard\/orders\/[^/]+$/.test(path) ||
    /^\/agent\/(?:wholesale|bulk-purchase)\/orders\/[^/]+$/.test(path);

  /* ── Clear any running cycle ── */
  const clearCycle = useCallback(() => {
    if (cycleRef.current) {
      clearTimeout(cycleRef.current);
      cycleRef.current = null;
    }
  }, []);

  /* ── Recursive timed loop ── */
  const startCycle = useCallback(() => {
    // Show bubble immediately
    setShowBubble(true);

    // After BUBBLE_VISIBLE_MS → hide bubble, then wait BUBBLE_HIDDEN_MS → repeat
    cycleRef.current = setTimeout(() => {
      setShowBubble(false);

      cycleRef.current = setTimeout(() => {
        startCycle(); // recurse
      }, BUBBLE_HIDDEN_MS);
    }, BUBBLE_VISIBLE_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isHiddenPage) {
      setVisible(false);
      clearCycle();
      return;
    }

    if (isDismissedToday()) {
      // Show icon only, no bubble animation
      setVisible(true);
      setDismissed(true);
      return;
    }

    setVisible(true);
    setDismissed(false);
    startCycle();

    return () => clearCycle();
  }, [isHiddenPage]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Click handler: open WhatsApp + dismiss for today ── */
  const handleClick = useCallback(() => {
    window.open(WHATSAPP_CHANNEL_URL, '_blank', 'noopener,noreferrer');

    // Stop the loop, hide bubble, store today's date
    clearCycle();
    setShowBubble(false);
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, getTodayString());
  }, [clearCycle]);

  /* ── Scroll-aware fade (smoother, more natural) ── */
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const dy = Math.abs(window.scrollY - lastY);
        lastY = window.scrollY;
        if (dy > 2) setIsScrolling(true);
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 1100);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  // Hide when a modal-open class is on body (e.g. activation page modal)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains('modal-open-wa-hide')) {
        setVisible(false);
      } else if (!isHiddenPage) {
        setVisible(true);
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isHiddenPage]);

  if (!visible) return null;

  return (
    <div
      id="yiego-wa-widget"
      className="fixed z-[9999] left-4 safe-area-floating-widget flex flex-col items-start gap-2"
      style={{
        opacity: isScrolling ? 0.35 : 1,
        transform: isScrolling ? 'translateY(2px) scale(0.96)' : 'translateY(0) scale(1)',
        transition: 'opacity 450ms cubic-bezier(0.4, 0, 0.2, 1), transform 450ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* ── Text bubble (only this animates) ── */}
      {!dismissed && (
        <div
          className="pointer-events-none select-none relative"
          style={{
            opacity:    showBubble ? 1 : 0,
            transform:  showBubble ? 'translateY(0)' : 'translateY(4px)',
            transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
          }}
        >
          <div
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white border border-white/20"
            style={{
              background: '#22C55E',
              boxShadow:  '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            Join Our Channel!
          </div>
          {/* Caret pointing down toward button */}
          <div
            className="absolute -bottom-1.5 left-5 w-3 h-3 rotate-45 border-r border-b border-white/20"
            style={{ background: '#22C55E' }}
          />
        </div>
      )}

      {/* ── FAB (always visible) ── */}
      <div className="relative">
        {/* Expanding ring */}
        <span
          className="wa-ring absolute inset-0 rounded-full pointer-events-none"
          style={{ background: 'rgba(34,197,94,0.25)' }}
        />

        {/* "!" badge */}
        <span className="wa-badge absolute -top-1 -right-1 z-10 flex items-center justify-center w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-black shadow-md border-2 border-background leading-none select-none">
          !
        </span>

        <button
          onClick={handleClick}
          className="wa-fab relative w-12 h-12 rounded-full flex items-center justify-center text-white transition-transform duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{
            background: '#22C55E',
            boxShadow:  '0 4px 12px rgba(0,0,0,0.15)',
          }}
          aria-label="Join our WhatsApp Channel"
        >
          <WhatsAppIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default WhatsAppChannelButton;
