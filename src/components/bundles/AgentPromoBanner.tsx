import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Store, TrendingUp, Share2, Wallet, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const LS_KEY = 'agentPromoNextShowAt';
const SUPPRESS_MS = 24 * 60 * 60 * 1000; // 24 hours

function shouldShow(): boolean {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return true;
    const nextShowAt = parseInt(raw, 10);
    if (isNaN(nextShowAt)) return true;
    return Date.now() >= nextShowAt;
  } catch {
    return false;
  }
}

const BENEFITS = [
  { icon: Store, text: 'Discounted agent prices (buy cheaper than normal users)' },
  { icon: TrendingUp, text: 'Set your own selling price (your own profit)' },
  { icon: Share2, text: 'Get your own agent store link to share anywhere' },
  { icon: Wallet, text: 'Profit credited automatically on every order' },
  { icon: Clock, text: 'Withdraw your earnings instantly anytime' },
];

const AgentPromoBanner = () => {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [closing, setClosing] = useState(false);
  const navigate = useNavigate();
  const overlayRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    setVisible(shouldShow());
  }, []);

  // Hide WhatsApp widget + App banner while popup is open
  useEffect(() => {
    const waEl = document.getElementById('yiego-wa-widget');
    const appBannerEl = document.getElementById('yiego-app-banner');
    if (visible) {
      if (waEl) waEl.style.display = 'none';
      if (appBannerEl) appBannerEl.style.display = 'none';
    } else {
      if (waEl) waEl.style.display = '';
      if (appBannerEl) appBannerEl.style.display = '';
    }
    return () => {
      if (waEl) waEl.style.display = '';
      if (appBannerEl) appBannerEl.style.display = '';
    };
  }, [visible]);

  const animateClose = useCallback((cb?: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      cb?.();
    }, 200);
  }, []);

  const close = useCallback(() => animateClose(), [animateClose]);

  const suppress = useCallback(() => {
    try {
      localStorage.setItem(LS_KEY, String(Date.now() + SUPPRESS_MS));
    } catch {}
  }, []);

  const handleBecomeAgent = useCallback(() => {
    suppress();
    animateClose(() => {
      if (user) {
        navigate('/agent');
      } else {
        navigate('/auth?tab=signup');
      }
    });
  }, [user, navigate, suppress, animateClose]);

  const handleMaybeLater = useCallback(() => {
    suppress();
    animateClose();
  }, [suppress, animateClose]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, close]);

  if (visible === null || !visible) return null;

  const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
      onClick={(e) => { if (e.target === overlayRef.current) close(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Agent promotion"
    >
      <div
        className="relative bg-card rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: '88vw',
          maxWidth: '340px',
          maxHeight: '360px',
          display: 'flex',
          flexDirection: 'column',
          ...(prefersReduced ? {} : {
            animation: closing
              ? 'ap-modal-out 180ms ease-in forwards'
              : 'ap-modal-in 180ms cubic-bezier(.21,1.02,.73,1) forwards',
          }),
        }}
      >
        {/* Gold accent header */}
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 shrink-0" />

        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-muted/60 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground active:scale-90"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable content area */}
        <div className="px-3 pt-3 pb-1 overflow-y-auto flex-1 min-h-0">
          {/* Icon + Title */}
          <div className="text-center mb-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-50 border border-amber-200/60 mb-2 shadow-sm">
              <Store className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-[18px] font-display font-bold tracking-tight text-foreground leading-tight">
              Earn by selling data bundles
            </h2>
            <p className="text-[13px] text-muted-foreground mt-1 leading-snug">
              Get your own agent store, sell instantly, withdraw anytime.
            </p>
          </div>

          {/* Benefits */}
          <ul className="space-y-[6px] mb-2">
            {BENEFITS.map(({ icon: Icon, text }, i) => (
              <li
                key={text}
                className="flex items-start gap-2 text-[13px] text-foreground leading-snug"
                style={prefersReduced ? {} : {
                  animation: `ap-row-in 200ms ease-out ${60 * i}ms both`,
                }}
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-50 border border-amber-200/40 shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-amber-600" />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Sticky CTA footer */}
        <div className="px-3 pb-3 pt-1.5 shrink-0 border-t border-border/40">
          <button
            onClick={handleBecomeAgent}
            className="w-full py-2 rounded-lg text-[13px] font-bold bg-gradient-to-r from-amber-500 to-yellow-400 text-white shadow-md hover:shadow-lg hover:from-amber-600 hover:to-yellow-500 active:scale-[0.97] transition-all duration-150"
          >
            Become an agent
          </button>
          <button
            onClick={handleMaybeLater}
            className="w-full mt-1 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            Maybe later
          </button>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes ap-modal-in { from { opacity: 0; transform: translateY(10px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes ap-modal-out { from { opacity: 1; transform: translateY(0) scale(1) } to { opacity: 0; transform: translateY(6px) scale(0.98) } }
        @keyframes ap-row-in { from { opacity: 0; transform: translateX(-4px) } to { opacity: 1; transform: translateX(0) } }
        @media (prefers-reduced-motion: reduce) {
          .ap-modal-in, .ap-modal-out, .ap-row-in { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default AgentPromoBanner;
