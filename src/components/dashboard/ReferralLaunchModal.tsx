import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Rocket, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'datasika_referral_launch_seen';

// Feature flag — set to true to re-enable the referral launch banner/modal.
// Hidden temporarily per product decision; referral system backend remains active.
const REFERRAL_BANNER_ENABLED = false;

const TIERS = [
  { label: 'Bronze', color: '#cd7f32' },
  { label: 'Silver', color: '#c0c0c0' },
  { label: 'Gold', color: '#ffd700' },
  { label: 'Platinum', color: '#e5e4e2' },
  { label: 'Elite', color: '#ff6b35' },
];

const ReferralLaunchModal = memo(() => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!REFERRAL_BANNER_ENABLED) return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen) return;
    // Delay to avoid blocking dashboard render
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  }, []);

  const handleStart = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
    navigate('/dashboard/referral');
  }, [navigate]);

  if (!REFERRAL_BANNER_ENABLED) return null;
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent
        className="max-w-[360px] sm:max-w-[400px] border-0 p-0 gap-0 overflow-hidden rounded-3xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-300"
        style={{
          background: 'linear-gradient(165deg, hsl(240 6% 12%) 0%, hsl(240 4% 8%) 100%)',
          boxShadow: '0 0 40px rgba(255,215,0,0.08), 0 0 80px rgba(255,215,0,0.04), 0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        <DialogTitle className="sr-only">Referral Launch</DialogTitle>

        {/* Gold glow border */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            border: '1px solid rgba(255,215,0,0.12)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        />

        <div className="relative z-10 px-6 pt-7 pb-6 flex flex-col items-center text-center">
          {/* Icon */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
            style={{
              background: 'linear-gradient(135deg, rgba(255,215,0,0.15) 0%, rgba(255,180,0,0.08) 100%)',
              border: '1px solid rgba(255,215,0,0.15)',
            }}
          >
            <Rocket className="w-6 h-6" style={{ color: '#ffd700' }} />
          </div>

          {/* Title */}
          <h2
            className="text-xl font-black tracking-tight mb-1.5"
            style={{ color: 'rgba(255,255,255,0.95)' }}
          >
            🚀 Earn Up To 25GB Free
          </h2>

          {/* Subtitle */}
          <p
            className="text-sm font-medium mb-2"
            style={{ color: 'rgba(255,215,0,0.8)' }}
          >
            Invite friends. Climb tiers. Unlock real data rewards.
          </p>

          {/* Detail */}
          <p
            className="text-xs leading-relaxed mb-6 max-w-[280px]"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Every friend who completes their first order moves you up the reward ladder.
          </p>

          {/* Tier preview */}
          <div className="flex items-center gap-1 mb-7 w-full justify-center">
            {TIERS.map((tier, i) => (
              <div key={tier.label} className="flex items-center gap-1">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black"
                    style={{
                      background: `${tier.color}18`,
                      border: `1.5px solid ${tier.color}40`,
                      color: tier.color,
                      boxShadow: `0 0 8px ${tier.color}15`,
                    }}
                  >
                    {tier.label[0]}
                  </div>
                  <span
                    className="text-[8px] font-bold uppercase tracking-wider"
                    style={{ color: `${tier.color}90` }}
                  >
                    {tier.label}
                  </span>
                </div>
                {i < TIERS.length - 1 && (
                  <div
                    className="w-3 h-px mx-0.5 mb-3.5"
                    style={{ background: 'rgba(255,255,255,0.1)' }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black tracking-wide transition-all duration-200 active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #ffb800 100%)',
              color: '#1a1400',
              boxShadow: '0 4px 20px rgba(255,215,0,0.25)',
            }}
          >
            Start Earning
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="mt-3 py-2 text-xs font-medium transition-colors duration-200"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Maybe Later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

ReferralLaunchModal.displayName = 'ReferralLaunchModal';
export default ReferralLaunchModal;
