import { useState, useEffect, useRef, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { toast } from 'sonner';
import {
  Gift, Users, Copy, Share2, Check, Lock,
  ChevronRight, Zap, Star, Sparkles, Link2, Trophy, Crown, TrendingUp, Shield, Loader2,
  Edit3, Clock, CheckCircle2, XCircle, Medal, ScrollText, PartyPopper,
} from 'lucide-react';
import SEOHead from '@/components/seo/SEOHead';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Lazy-load heavy below-fold components
const WeeklyLeaderboard = lazy(() => import('@/components/referral/WeeklyLeaderboard'));

/* ─── INTERFACES ──────────────────────────────────────────────────── */
interface ReferralStats {
  referral_code: string;
  referral_success_count: number;
  referral_signup_count: number;
}
interface ReferralActivity {
  id: string;
  referee_id: string;
  status: 'registered' | 'successful';
  created_at: string;
  first_success_order_id: string | null;
  referee_profile?: { username: string | null; full_name: string; phone: string | null; email: string | null };
}

/* ─── CAMPAIGN CONFIG — 25GB MAX (INCREMENTAL) ────────────────────── */
interface TierDef {
  id: string;
  gb: number;
  deliverGb: number;
  label: string;
  tierName: string;
  requiredPerTier: number;
  cumulative: number;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  glowRgb: string;       // RGB for glow effects
  elite?: boolean;
}

const TIERS: TierDef[] = [
  { id: 'aaaa0001-0000-0000-0000-000000000001', gb: 1,  deliverGb: 1,  label: '1GB',  tierName: 'Bronze',   requiredPerTier: 5,  cumulative: 5,  icon: Medal,  color: '#cd7f32', glowRgb: '205,127,50' },
  { id: 'aaaa0002-0000-0000-0000-000000000002', gb: 5,  deliverGb: 4,  label: '5GB',  tierName: 'Silver',   requiredPerTier: 10, cumulative: 15, icon: Star,   color: '#94a3b8', glowRgb: '148,163,184' },
  { id: 'aaaa0003-0000-0000-0000-000000000003', gb: 10, deliverGb: 5,  label: '10GB', tierName: 'Gold',     requiredPerTier: 20, cumulative: 35, icon: Trophy, color: '#f59e0b', glowRgb: '245,158,11' },
  { id: 'aaaa0004-0000-0000-0000-000000000004', gb: 15, deliverGb: 5,  label: '15GB', tierName: 'Platinum', requiredPerTier: 20, cumulative: 55, icon: Shield, color: '#67e8f9', glowRgb: '103,232,249' },
  { id: 'aaaa0005-0000-0000-0000-000000000005', gb: 25, deliverGb: 10, label: '25GB', tierName: 'Elite',    requiredPerTier: 40, cumulative: 95, icon: Crown,  color: '#fbbf24', glowRgb: '251,191,36', elite: true },
];

const MAX_CUMULATIVE = TIERS[TIERS.length - 1].cumulative;

interface MilestoneClaim {
  id: string;
  milestone_id: string;
  status: string;
  linked_order_id: string | null;
  network: string;
  phone: string;
  payout_gb: number | null;
}

/* ─── PROGRESS HELPERS ───────────────────────────────────────────── */
/** Shared progress computation — delegates to the canonical function
 *  so every surface (Home card, Referral page) uses identical math. */
import { computeReferralProgress } from '@/hooks/useReferralProgress';

function getTierProgressInfo(qualifiedCount: number, currentTierReq: number, nextTierReq: number) {
  const range = nextTierReq - currentTierReq;
  if (range <= 0) return { progressRatio: 1, progressPercent: 100, remaining: 0 };
  const progressed = qualifiedCount - currentTierReq;
  const progressRatio = Math.max(0, Math.min(progressed / range, 1));
  const progressPercent = Math.round(progressRatio * 100);
  const remaining = Math.max(0, nextTierReq - qualifiedCount);
  return { progressRatio, progressPercent, remaining };
}

function getReachedTierIdx(successCount: number): number {
  let idx = -1;
  for (let i = 0; i < TIERS.length; i++) {
    if (successCount >= TIERS[i].cumulative) idx = i;
  }
  return idx;
}

function getNextTierIdx(successCount: number): number {
  for (let i = 0; i < TIERS.length; i++) {
    if (successCount < TIERS[i].cumulative) return i;
  }
  return TIERS.length - 1;
}

/** Get motivational text based on progress percentage.
 *  Bronze is the ONLY tier where exact remaining count is shown.
 *  All tiers after Bronze show percentage only. */
function getMotivationalText(percent: number, tierName: string, remaining: number, isBronze: boolean): string {
  if (remaining === 0) return 'Unlocked! Claim now 🎉';
  if (isBronze) {
    // Bronze: show exact count
    if (percent >= 96) return `One more push 💎 ${remaining} referral${remaining !== 1 ? 's' : ''} to go!`;
    if (percent >= 71) return `Almost there 🔥 ${remaining} referral${remaining !== 1 ? 's' : ''} to go!`;
    return `🔥 ${percent}% to ${tierName} — ${remaining} referral${remaining !== 1 ? 's' : ''} to go!`;
  }
  // Silver+: percentage only, no remaining count
  if (percent >= 96) return `One more push 💎`;
  if (percent >= 71) return `Almost there. Don't stop now 🔥`;
  if (percent >= 50) return `Momentum building. Keep going 🚀`;
  return `🔥 ${percent}% to ${tierName}`;
}

/* ─── CONFETTI COMPONENT (lightweight CSS-only) ─────────────────── */
const TierConfetti = memo(({ color, active }: { color: string; active: boolean }) => {
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      size: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 60,
    })), []
  );

  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            top: '-8px',
            width: p.size,
            height: p.size,
            background: p.id % 3 === 0 ? color : p.id % 3 === 1 ? '#fde68a' : '#ffffff',
            opacity: 0.9,
            transform: `rotate(${p.rotation}deg)`,
            willChange: 'transform, opacity',
            animation: `rl-confetti-fall 1.8s ${p.delay}s ease-out forwards`,
            '--drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
});
TierConfetti.displayName = 'TierConfetti';

/* ─── TIER UNLOCK CELEBRATION MODAL ─────────────────────────────── */
const TierUnlockModal = memo(({ tier, open, onClose }: {
  tier: TierDef | null;
  open: boolean;
  onClose: () => void;
}) => {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!tier) return null;
  const Icon = tier.icon;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-xs text-center overflow-visible"
        style={{
          background: 'hsl(222 28% 8%)',
          border: `1.5px solid ${tier.color}55`,
          margin: 0,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          padding: 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)',
        }}
      >
        <TierConfetti color={tier.color} active={open} />
        <div className="relative z-10 flex flex-col items-center gap-3 py-3 px-1">
          {/* Badge */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: `radial-gradient(circle at 38% 32%, ${tier.color}dd, ${tier.color}44)`,
              boxShadow: `0 0 40px 12px ${tier.color}44, 0 0 16px 4px ${tier.color}77`,
              animation: 'rl-badge-scale-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
              willChange: 'transform, opacity',
            }}
          >
            <Icon className="w-9 h-9" style={{ color: '#fff', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.5))' }} />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: tier.color }}>
              {tier.tierName} Tier
            </p>
            <h2 className="text-2xl font-black" style={{ color: '#fff' }}>Unlocked! 🎉</h2>
          </div>

          <div className="rounded-xl px-4 py-3 w-full" style={{ background: `rgba(${tier.glowRgb},.1)`, border: `1px solid ${tier.color}33` }}>
            <p className="text-sm font-black" style={{ color: tier.color }}>
              {tier.label} Total Reward Available
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,.55)' }}>
              {tier.tierName} milestone — {tier.label} total
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
TierUnlockModal.displayName = 'TierUnlockModal';

/* ─── NEXT-TIER PROGRESS BAR (premium, game-like, dominant) ────── */
const NextTierProgressBar = memo(({ successCount, frozen, frozenReason }: {
  successCount: number;
  frozen?: boolean;
  frozenReason?: string | null;
}) => {
  const reachedIdx = getReachedTierIdx(successCount);
  const isMaxTier = reachedIdx === TIERS.length - 1;
  const currentTierReq = reachedIdx >= 0 ? TIERS[reachedIdx].cumulative : 0;
  const currentTierName = reachedIdx >= 0 ? TIERS[reachedIdx].tierName : 'Start';
  const nextIdx = getNextTierIdx(successCount);
  const nextTier = TIERS[nextIdx];
  const nextTierReq = nextTier.cumulative;
  const nextTierName = nextTier.tierName;
  const nextTierColor = nextTier.color;
  const NextIcon = nextTier.icon;

  const { progressPercent, remaining } = isMaxTier
    ? { progressPercent: 100, remaining: 0 }
    : getTierProgressInfo(successCount, currentTierReq, nextTierReq);

  const isAlmostThere = progressPercent >= 70;
  const isUrgent = progressPercent >= 96;
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedWidth(progressPercent), 80);
    return () => clearTimeout(timeout);
  }, [progressPercent]);

  if (isMaxTier) {
    return (
      <div className="rounded-2xl p-5 mb-4" style={{
        background: 'linear-gradient(135deg, rgba(251,191,36,.12), rgba(251,191,36,.05))',
        border: '1.5px solid rgba(251,191,36,.4)',
        boxShadow: '0 0 30px 4px rgba(251,191,36,.1)',
      }}>
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-5 h-5" style={{ color: '#fbbf24', filter: 'drop-shadow(0 0 8px rgba(251,191,36,.6))' }} />
          <span className="text-sm font-black" style={{ color: '#fbbf24' }}>Max Tier Reached — Elite 👑</span>
        </div>
        <div className="h-[12px] rounded-full overflow-hidden" style={{ background: 'rgba(251,191,36,.12)' }}>
          <div className="h-full rounded-full" style={{
            width: '100%',
            background: 'linear-gradient(90deg, #b45309, #f59e0b, #fbbf24, #fde68a, #fbbf24)',
            boxShadow: '0 0 18px 4px rgba(251,191,36,.5), inset 0 1px 0 rgba(255,255,255,.3)',
          }} />
        </div>
        <p className="text-xs font-black mt-2.5 text-center" style={{ color: '#4ade80' }}>
          🎉 All milestones complete — 25GB Elite!
        </p>
      </div>
    );
  }

  const isBronzeNext = nextTierName === 'Bronze';
  const motivText = getMotivationalText(progressPercent, nextTierName, remaining, isBronzeNext);

  return (
    <div className="rounded-2xl p-5 mb-4" style={{
      background: isAlmostThere
        ? `linear-gradient(135deg, rgba(${nextTier.glowRgb},.06), rgba(${nextTier.glowRgb},.02))`
        : 'rgba(255,255,255,.03)',
      border: isAlmostThere
        ? `1.5px solid rgba(${nextTier.glowRgb},.25)`
        : '1px solid rgba(255,255,255,.08)',
      boxShadow: isAlmostThere ? `0 0 24px 2px rgba(${nextTier.glowRgb},.08)` : 'none',
    }}>
      {/* Motivational headline */}
      <p className="text-sm font-black mb-1 text-center" style={{ color: 'rgba(255,255,255,0.92)' }}>
        {motivText}
      </p>

      {/* Sub-line: percentage + tier target */}
      <p className="text-xs font-bold mb-3.5 text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <span style={{
          color: nextTierColor,
          textShadow: isAlmostThere ? `0 0 14px ${nextTierColor}88` : 'none',
          fontSize: '1.1em',
        }}>
          {progressPercent}%
        </span>
        {' '}progress to{' '}
        <span style={{ color: nextTierColor }}>{nextTierName}</span>
        {' '}({nextTier.label} total)
      </p>

      {/* Labels row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {currentTierName}
        </span>
        <div className="flex items-center gap-1">
          <NextIcon className="w-3 h-3" style={{
            color: nextTierColor,
            opacity: isAlmostThere ? 1 : 0.6,
            filter: isAlmostThere ? `drop-shadow(0 0 4px ${nextTierColor}88)` : 'none',
          }} />
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: nextTierColor }}>
            {nextTierName}
          </span>
        </div>
      </div>

      {/* THICK PROGRESS BAR */}
      <div className="relative h-[12px] rounded-full overflow-visible" style={{
        background: 'rgba(255,255,255,.08)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,.4)',
      }}>
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${animatedWidth}%`,
            transition: 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)',
            willChange: 'width',
            background: `linear-gradient(90deg, ${nextTierColor}66, ${nextTierColor}cc, ${nextTierColor})`,
            boxShadow: isAlmostThere
              ? `0 0 18px 4px ${nextTierColor}55, 0 0 8px 2px ${nextTierColor}88, inset 0 1px 0 rgba(255,255,255,.3)`
              : `0 0 10px 2px ${nextTierColor}44, inset 0 1px 0 rgba(255,255,255,.2)`,
            animation: isAlmostThere ? 'rl-bar-urgency-pulse 2s ease-in-out infinite' : 'none',
          }}
        />
        {/* Progress dot */}
        {animatedWidth > 0 && (
          <div
            className="absolute top-1/2"
            style={{
              left: `${animatedWidth}%`,
              transform: 'translateX(-50%) translateY(-50%)',
              transition: 'left 600ms cubic-bezier(0.22, 1, 0.36, 1)',
              willChange: 'left, transform',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${nextTierColor}, ${nextTierColor}cc)`,
              border: '3px solid hsl(222 28% 8%)',
              boxShadow: isAlmostThere
                ? `0 0 16px 5px ${nextTierColor}66, 0 0 6px 2px ${nextTierColor}aa`
                : `0 0 8px 3px ${nextTierColor}44`,
              animation: isUrgent
                ? 'rl-dot-breathe-urgent 1.5s ease-in-out infinite'
                : 'rl-dot-breathe 3s ease-in-out infinite',
              zIndex: 2,
            }}
          />
        )}
      </div>

      {/* Secondary text */}
      {remaining > 0 && isBronzeNext && (
        <p className="text-[11px] font-bold mt-3 text-center" style={{
          color: isAlmostThere ? nextTierColor : 'rgba(255,255,255,0.55)',
        }}>
          Only <span className="font-black" style={{ color: nextTierColor }}>{remaining}</span> more referral{remaining !== 1 ? 's' : ''} to reach{' '}
          <span style={{ color: nextTierColor }}>{nextTierName}</span>
        </p>
      )}
      {remaining > 0 && !isBronzeNext && (
        <p className="text-[11px] font-bold mt-3 text-center" style={{
          color: isAlmostThere ? nextTierColor : 'rgba(255,255,255,0.55)',
        }}>
          Keep sharing to level up!
        </p>
      )}
      {remaining === 0 && (
        <p className="text-xs font-black mt-3 text-center" style={{ color: '#4ade80' }}>
          ✅ Unlocked! Claim your reward now
        </p>
      )}

      {frozen && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)' }}>
          <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: '#f87171' }} />
          <p className="text-[10px] font-bold" style={{ color: '#f87171' }}>
            Rewards frozen pending review{frozenReason ? `: ${frozenReason}` : ''}
          </p>
        </div>
      )}
    </div>
  );
});
NextTierProgressBar.displayName = 'NextTierProgressBar';

/* ─── ANIMATIONS ─────────────────────────────────────────────────── */
const LADDER_STYLES = `
  @keyframes rl-shimmer {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
  @keyframes rl-25gb-shimmer {
    0%,100% { opacity:0.6; background-position: 200% center; }
    50%      { opacity:1;   background-position: -200% center; }
  }
  @keyframes rl-orb {
    0%,100% { opacity:.18; transform:scale(1); }
    50%      { opacity:.36; transform:scale(1.12); }
  }
  @keyframes rl-blink {
    0%,100% { opacity:1; }
    50%      { opacity:.15; }
  }
  @keyframes rl-zap-pulse {
    0%,100% { opacity:.7; transform:scale(1); }
    50%      { opacity:1; transform:scale(1.2); }
  }
  @keyframes rl-node-pop {
    0%   { transform:scale(1); }
    35%  { transform:scale(1.28); }
    65%  { transform:scale(.94); }
    100% { transform:scale(1.04); }
  }
  @keyframes rl-near-pulse {
    0%,100% { box-shadow: 0 0 0 0 hsla(45,100%,50%,.0); }
    50%      { box-shadow: 0 0 0 8px hsla(45,100%,50%,.18); }
  }
  @keyframes rl-halo {
    0%,100% { box-shadow: 0 0 0 0 rgba(251,191,36,.0), 0 0 24px 6px rgba(251,191,36,.38); }
    50%      { box-shadow: 0 0 0 8px rgba(251,191,36,.15), 0 0 40px 12px rgba(251,191,36,.55); }
  }
  @keyframes rl-badge-wobble {
    0%,88%,100% { transform:rotate(0deg); }
    92%  { transform:rotate(-4deg); }
    96%  { transform:rotate(4deg); }
  }
  @keyframes rl-count {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes rl-scale-in {
    from { transform:scale(0.88); opacity:0; }
    to   { transform:scale(1); opacity:1; }
  }
  @keyframes rl-shine-sweep {
    0%   { opacity:0; transform:translateX(-100%) skewX(-20deg); }
    40%  { opacity:.18; }
    100% { opacity:0; transform:translateX(250%) skewX(-20deg); }
  }
  @keyframes rl-timeline-node {
    0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
    50%      { box-shadow: 0 0 0 6px rgba(245,158,11,.2); }
  }
  @keyframes rl-claim-glow {
    0%,100% { box-shadow: 0 4px 20px rgba(245,158,11,.3); }
    50%      { box-shadow: 0 4px 32px rgba(245,158,11,.6), 0 0 0 4px rgba(245,158,11,.12); }
  }
  @keyframes rl-elite-pulse {
    0%,100% { box-shadow: 0 0 20px 4px rgba(251,191,36,.3); }
    50%      { box-shadow: 0 0 50px 14px rgba(251,191,36,.6); }
  }
  @keyframes rl-progress-pulse {
    0%,100% { opacity: 1; }
    50%      { opacity: .82; }
  }
  @keyframes rl-dot-breathe {
    0%,100% { transform: translateX(-50%) translateY(-50%) scale(1); }
    50%      { transform: translateX(-50%) translateY(-50%) scale(1.18); }
  }
  @keyframes rl-dot-breathe-urgent {
    0%,100% { transform: translateX(-50%) translateY(-50%) scale(1); }
    50%      { transform: translateX(-50%) translateY(-50%) scale(1.25); }
  }
  @keyframes rl-bar-urgency-pulse {
    0%,100% { opacity: 1; filter: brightness(1); }
    50%      { opacity: .88; filter: brightness(1.15); }
  }
  @keyframes rl-icon-pulse-near {
    0%,100% { transform: scale(1); opacity: 0.7; }
    50%      { transform: scale(1.08); opacity: 1; }
  }
  @keyframes rl-confetti-fall {
    0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(320px) translateX(var(--drift, 0px)) rotate(720deg); opacity: 0; }
  }
  @keyframes rl-badge-scale-in {
    0%   { transform: scale(0.5); opacity: 0; }
    60%  { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); }
  }
  @keyframes rl-tier-unlocked-pill {
    0%   { transform: translateX(-20px); opacity: 0; }
    100% { transform: translateX(0); opacity: 1; }
  }
  @keyframes rl-check-pop {
    0%   { transform: scale(0); opacity: 0; }
    50%  { transform: scale(1.3); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes rl-tier-glow {
    0%,100% { opacity: 0.6; }
    50%      { opacity: 1; }
  }

  .rl-shimmer        { background-size:200% 100%; animation:rl-shimmer 4s ease-in-out infinite; will-change: background-position; }
  .rl-25gb-shimmer   { background-size:300% 100%; animation:rl-25gb-shimmer 3s ease-in-out infinite; will-change: background-position, opacity; }
  .rl-orb            { animation:rl-orb 4.5s ease-in-out infinite; will-change: transform, opacity; }
  .rl-blink          { animation:rl-blink 1.8s ease-in-out infinite; will-change: opacity; }
  .rl-zap-pulse      { animation:rl-zap-pulse 2s ease-in-out infinite; will-change: transform, opacity; }
  .rl-node-pop       { animation:rl-node-pop .5s cubic-bezier(.22,1,.36,1) forwards; will-change: transform; }
  .rl-near-pulse     { animation:rl-near-pulse 2.2s ease-in-out infinite; }
  .rl-halo           { animation:rl-halo 2.4s ease-in-out infinite; }
  .rl-badge-wobble   { animation:rl-badge-wobble 5s ease-in-out infinite; will-change: transform; }
  .rl-count          { animation:rl-count .25s ease-out both; will-change: transform, opacity; }
  .rl-scale-in       { animation:rl-scale-in .3s cubic-bezier(.22,1,.36,1) both; will-change: transform, opacity; }
  .rl-shine-sweep    { animation:rl-shine-sweep 3s ease-in-out infinite 1s; will-change: transform, opacity; }
  .rl-timeline-node  { animation:rl-timeline-node 2.5s ease-in-out infinite; }
  .rl-claim-glow     { animation:rl-claim-glow 2s ease-in-out infinite; }
  .rl-elite-pulse    { animation:rl-elite-pulse 2.4s ease-in-out infinite; }

  @media (prefers-reduced-motion: reduce) {
    .rl-shimmer, .rl-25gb-shimmer, .rl-orb, .rl-blink, .rl-zap-pulse,
    .rl-node-pop, .rl-near-pulse, .rl-halo, .rl-badge-wobble, .rl-count,
    .rl-scale-in, .rl-shine-sweep, .rl-timeline-node, .rl-claim-glow,
    .rl-elite-pulse {
      animation: none !important;
    }
  }
`;

const darkCard: React.CSSProperties = {
  background: 'linear-gradient(155deg, hsl(222 28% 11%), hsl(222 28% 8%))',
  border: '1px solid rgba(255,255,255,0.075)',
};

/* ─── STAT CAPSULE ────────────────────────────────────────────────── */
const StatCapsule = memo(({ value, label, icon, accent = false, tierColor }: {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  accent?: boolean;
  tierColor?: string;
}) => (
  <div className="flex-1 flex flex-col items-center gap-1 px-2 py-3 rounded-2xl"
    style={{
      background: accent ? 'rgba(245,158,11,.14)' : 'rgba(0,0,0,0.32)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: accent
        ? '1px solid rgba(245,158,11,.38)'
        : tierColor
        ? `1px solid ${tierColor}28`
        : '1px solid rgba(255,255,255,.08)',
      boxShadow: accent
        ? 'inset 0 1px 0 rgba(245,158,11,.2), 0 2px 14px rgba(245,158,11,.08)'
        : 'inset 0 1px 0 rgba(255,255,255,.05)',
    }}
  >
    <div style={{ color: accent ? '#fbbf24' : tierColor ?? 'rgba(255,255,255,.35)' }} className="mb-0.5">{icon}</div>
    <p className="text-xl font-black leading-none tabular-nums rl-count" style={{ color: '#ffffff' }}>{value}</p>
    <p className="text-[9px] font-black uppercase tracking-wider text-center leading-tight" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
  </div>
));
StatCapsule.displayName = 'StatCapsule';

/* ─── TIER NODE (top ladder bubbles) — brightness scales with proximity ─ */
const TierNode = memo(({ tier, reached, isNext, progressTowardThis }: {
  tier: TierDef;
  reached: boolean;
  isNext: boolean;
  progressTowardThis?: number; // 0-100 progress toward this specific tier
}) => {
  const Icon = tier.icon;
  const size = tier.elite ? 56 : 46;
  const innerSize = tier.elite ? 36 : 30;
  // Brightness ramp: unreached tiers start dim, glow brighter as user approaches
  const brightness = reached ? 1 : isNext ? Math.max(0.35, (progressTowardThis ?? 0) / 100) : 0.15;
  const shouldPulseNear = isNext && !reached && (progressTowardThis ?? 0) >= 70;

  return (
    <div className="flex flex-col items-center gap-1.5 relative z-10">
      <div
        className={[
          'relative flex items-center justify-center transition-all duration-500',
          tier.elite && reached ? 'rl-halo' : '',
          shouldPulseNear ? 'rl-near-pulse' : '',
          reached && !tier.elite ? 'rl-node-pop' : '',
        ].join(' ')}
        style={{
          width: size, height: size, borderRadius: '50%',
          ...(reached
            ? {
                background: `radial-gradient(circle at 38% 32%, ${tier.color}dd, ${tier.color}55)`,
                boxShadow: `0 0 26px 8px ${tier.color}44, 0 0 10px 2px ${tier.color}77`,
                border: `2.5px solid ${tier.color}cc`,
              }
            : isNext
            ? {
                background: `rgba(${tier.glowRgb},${0.02 + brightness * 0.06})`,
                border: `2px solid rgba(${tier.glowRgb},${0.2 + brightness * 0.3})`,
                boxShadow: shouldPulseNear ? `0 0 16px 4px rgba(${tier.glowRgb},.2)` : 'none',
              }
            : { background: 'rgba(255,255,255,.025)', border: '2px solid rgba(255,255,255,.07)' }),
        }}
      >
        <div style={{
          width: innerSize, height: innerSize, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: reached ? 'radial-gradient(circle at 40% 35%, rgba(255,255,255,.25), transparent 70%)' : 'transparent',
        }}>
          {reached ? (
            tier.elite
              ? <Crown className="w-5 h-5" style={{ color: '#fff', filter: 'drop-shadow(0 0 5px rgba(255,255,255,.7))' }} />
              : <Check className="w-4 h-4" style={{ color: '#0a0a0a' }} />
          ) : (
            <Icon
              className={tier.elite ? 'w-5 h-5' : 'w-3.5 h-3.5'}
              style={{
                color: isNext ? tier.color : `rgba(255,255,255,${brightness})`,
                opacity: isNext ? brightness : 0.3,
                filter: shouldPulseNear ? `drop-shadow(0 0 4px ${tier.color}88)` : 'none',
                animation: shouldPulseNear ? 'rl-icon-pulse-near 2s ease-in-out infinite' : 'none',
                willChange: shouldPulseNear ? 'transform, opacity' : 'auto',
              }}
            />
          )}
        </div>
        {reached && (
          <div className="rl-shine-sweep absolute inset-0 rounded-full pointer-events-none"
            style={{ background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,.7) 50%, transparent 75%)' }} />
        )}
      </div>
      <span className="text-[9px] font-black leading-none tracking-wide" style={{
        color: reached ? tier.color : isNext ? tier.color : 'rgba(255,255,255,.18)',
        opacity: reached ? 1 : isNext ? Math.max(0.5, brightness) : 0.35,
      }}>
        {tier.label}
      </span>
      {tier.elite && <Crown className="w-2.5 h-2.5 -mt-0.5" style={{ color: reached ? '#fbbf24' : 'rgba(255,255,255,.12)' }} />}
    </div>
  );
});
TierNode.displayName = 'TierNode';

/* ─── TIER CLAIM CARD (inline per tier in the ladder list) ──────── */
const TierClaimCard = memo(({ tier, claim, reached, onClaim, onEdit, frozen, frozenReason }: {
  tier: TierDef;
  claim: MilestoneClaim | null;
  reached: boolean;
  onClaim: () => void;
  onEdit: () => void;
  frozen?: boolean;
  frozenReason?: string | null;
}) => {
  if (!reached && !claim) return null;

  const status = claim?.status;

  if (status === 'delivered') {
    return (
      <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.3)' }}>
        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
        <div className="flex-1">
          <p className="text-xs font-black" style={{ color: '#4ade80' }}>
            Delivered ✓ — {claim?.payout_gb || tier.deliverGb}GB
          </p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{claim?.network} · {claim?.phone}</p>
        </div>
      </div>
    );
  }

  if (status === 'approved_processing') {
    return (
      <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(96,165,250,.1)', border: '1px solid rgba(96,165,250,.3)' }}>
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: '#60a5fa' }} />
        <div>
          <p className="text-xs font-black" style={{ color: '#60a5fa' }}>Processing… {claim?.payout_gb || tier.deliverGb}GB</p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{claim?.network} · {claim?.phone}</p>
        </div>
      </div>
    );
  }

  if (status === 'pending_admin') {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)' }}>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" style={{ color: '#fbbf24' }} />
          <div>
            <p className="text-xs font-black" style={{ color: '#fbbf24' }}>⏳ Pending Approval — {claim?.payout_gb || tier.deliverGb}GB</p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{claim?.network} · {claim?.phone}</p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95"
          style={{ background: 'rgba(245,158,11,.2)', color: '#fbbf24', border: '1px solid rgba(245,158,11,.4)' }}
        >
          <Edit3 className="w-3 h-3" />
          Edit
        </button>
      </div>
    );
  }

  if (frozen) {
    return (
      <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)' }}>
        <Lock className="w-4 h-4 shrink-0" style={{ color: '#f87171' }} />
        <div>
          <p className="text-xs font-black" style={{ color: '#f87171' }}>Rewards Under Review</p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>Referral rewards temporarily under review.</p>
        </div>
      </div>
    );
  }

  // reached but not claimed (or rejected/failed → allow reclaim)
  return (
    <div className="mt-3">
      {(status === 'rejected' || status === 'failed') && (
        <p className="text-[10px] mb-2 flex items-center gap-1" style={{ color: '#f87171' }}>
          <XCircle className="w-3 h-3" />
          {status === 'rejected' ? 'Claim was rejected — you can resubmit.' : 'Delivery failed — please try again.'}
        </p>
      )}
      <button
        onClick={onClaim}
        className="w-full h-10 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-[.98] rl-claim-glow"
        style={{
          background: `linear-gradient(135deg, ${tier.color}, ${tier.color}cc)`,
          color: '#0a0a0a',
        }}
      >
        <Gift className="w-3.5 h-3.5" />
        Claim {tier.deliverGb}GB Reward
      </button>
    </div>
  );
});
TierClaimCard.displayName = 'TierClaimCard';

/* ─── HOW IT WORKS — Vertical Glowing Timeline ─────────────────── */
const HOW_IT_WORKS_STEPS = [
  { icon: Share2, color: '#f59e0b', title: 'Share Your Quest Link', subtitle: 'Send your unique referral link to friends on WhatsApp, socials, or anywhere.' },
  { icon: Users, color: '#a78bfa', title: 'Friend Signs Up', subtitle: 'They create their YieGo account using your referral link.' },
  { icon: ChevronRight, color: '#60a5fa', title: 'They Place a Successful Order', subtitle: 'Your referral counts once they complete their first paid data purchase.' },
  { icon: TrendingUp, color: '#4ade80', title: 'You Unlock the Next Tier', subtitle: 'Each qualified referral moves you up — Bronze, Silver, Gold, Platinum, Elite.' },
  { icon: Gift, color: '#fbbf24', title: 'Claim Rewards up to 25GB', subtitle: 'Tap "Claim Reward", choose your network and number — delivered instantly.' },
];

const HowItWorks = memo(() => (
  <div className="relative overflow-hidden rounded-3xl p-5 shadow-lg" style={darkCard}>
    <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }} />
    <div className="relative z-10">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,.15)' }}>
          <Sparkles className="w-4 h-4" style={{ color: '#fbbf24' }} />
        </div>
        <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.9)' }}>How It Works</h3>
      </div>
      <div className="relative pl-8">
        <div className="absolute left-[15px] top-4 bottom-4 w-[2px]"
          style={{ background: 'linear-gradient(to bottom, rgba(245,158,11,.5), rgba(167,139,250,.3), rgba(96,165,250,.2), rgba(74,222,128,.3), rgba(251,191,36,.5))' }} />
        <div className="space-y-0">
          {HOW_IT_WORKS_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isLast = i === HOW_IT_WORKS_STEPS.length - 1;
            return (
              <div key={i} className="relative flex items-start gap-4 pb-6 last:pb-0">
                <div
                  className={`absolute left-[-32px] top-0 w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${isLast ? 'rl-timeline-node' : ''}`}
                  style={{
                    background: `radial-gradient(circle at 38% 35%, ${step.color}cc, ${step.color}44)`,
                    border: `2px solid ${step.color}88`,
                    boxShadow: `0 0 12px 2px ${step.color}33`,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: isLast ? '#0a0a0a' : '#fff', filter: isLast ? 'none' : 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }} />
                </div>
                <div className="pl-2">
                  <p className="text-xs font-black" style={{ color: step.color }}>{step.title}</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{step.subtitle}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
));
HowItWorks.displayName = 'HowItWorks';

/* ─── HELPERS: identity + date grouping ─────────────────────────── */
function maskPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length < 6) return '***';
  return cleaned.slice(0, 3) + '***' + cleaned.slice(-4);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return local.slice(0, 2) + '***@' + domain;
}

function getActivityIdentity(profile?: ReferralActivity['referee_profile']) {
  const fullName = profile?.full_name?.trim() || '';
  const username = profile?.username?.trim() || '';
  const phone = profile?.phone?.trim() || '';
  const email = profile?.email?.trim() || '';

  if (username) {
    return { primary: `@${username}`, secondary: null };
  }
  return { primary: '@unknown', secondary: null };
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── ACTIVITY ITEM (memoized) ──────────────────────────────────── */
const ActivityItem = memo(({ activity }: { activity: ReferralActivity }) => {
  const isSuccess = activity.status === 'successful';
  const identity = useMemo(() => getActivityIdentity(activity.referee_profile), [activity.referee_profile]);
  const dt = useMemo(() => new Date(activity.created_at), [activity.created_at]);
  const timeStr = useMemo(() => dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), [dt]);

  return (
    <div className="flex items-start gap-3 px-3 py-3 rounded-xl"
      style={{
        background: isSuccess ? 'rgba(74,222,128,.06)' : 'rgba(255,255,255,.03)',
        border: `1px solid ${isSuccess ? 'rgba(74,222,128,.2)' : 'rgba(255,255,255,.06)'}`,
        boxShadow: isSuccess ? '0 0 12px 1px rgba(74,222,128,.06)' : 'none',
      }}>
      {/* Left icon */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: isSuccess ? 'rgba(74,222,128,.15)' : 'rgba(255,255,255,.06)',
          boxShadow: isSuccess ? '0 0 8px 2px rgba(74,222,128,.15)' : 'none',
        }}>
        {isSuccess
          ? <CheckCircle2 className="w-4 h-4" style={{ color: '#4ade80' }} />
          : <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(251,191,36,.45)', boxShadow: '0 0 4px rgba(251,191,36,.3)' }} />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Primary identity */}
        <p className="text-sm font-medium leading-tight truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>
          {identity.primary}
        </p>
        {/* Secondary identity */}
        {identity.secondary && (
          <p className="text-[11px] truncate mt-px" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {identity.secondary}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <p className="text-[11px] font-semibold" style={{ color: isSuccess ? 'rgba(74,222,128,0.85)' : 'rgba(255,255,255,0.55)' }}>
            {isSuccess ? 'Qualified Referral' : 'Signed Up'}
          </p>
          {isSuccess && (
            <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-px rounded-full"
              style={{ background: 'rgba(74,222,128,.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,.2)' }}>
              Qualified
            </span>
          )}
          {!isSuccess && (
            <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full"
              style={{ background: 'rgba(251,191,36,.08)', color: 'rgba(251,191,36,.7)', border: '1px solid rgba(251,191,36,.15)' }}>
              Pending
            </span>
          )}
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: isSuccess ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.35)' }}>
          {isSuccess ? 'First order payment received' : '⏳ Waiting for first order'}
        </p>
      </div>

      {/* Time on the right */}
      <div className="shrink-0 text-right mt-0.5">
        <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{timeStr}</p>
      </div>
    </div>
  );
});
ActivityItem.displayName = 'ActivityItem';

/* ─── REFERRAL ACTIVITY SECTION (with summary, date groups, load-more) */
const ACTIVITY_PAGE_SIZE = 20;

const ReferralActivitySection = memo(({ loading, activities }: {
  loading: boolean;
  activities: ReferralActivity[];
}) => {
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);

  const qualifiedCount = useMemo(() => activities.filter(a => a.status === 'successful').length, [activities]);
  const pendingCount = useMemo(() => activities.filter(a => a.status === 'registered').length, [activities]);

  const visibleActivities = useMemo(() => activities.slice(0, visibleCount), [activities, visibleCount]);
  const hasMore = visibleCount < activities.length;

  // Group by date
  const groupedActivities = useMemo(() => {
    const groups: { dateKey: string; dateLabel: string; items: ReferralActivity[] }[] = [];
    let currentKey = '';
    for (const a of visibleActivities) {
      const key = getDateKey(a.created_at);
      if (key !== currentKey) {
        currentKey = key;
        groups.push({ dateKey: key, dateLabel: formatDateHeader(a.created_at), items: [] });
      }
      groups[groups.length - 1].items.push(a);
    }
    return groups;
  }, [visibleActivities]);

  const darkCard: React.CSSProperties = {
    background: 'linear-gradient(135deg, hsl(222 28% 8% / 0.95), hsl(222 32% 6% / 0.98))',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  };

  return (
    <div className="relative overflow-hidden rounded-3xl p-5" style={darkCard}>
      <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }} />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(167,139,250,.15)' }}>
            <Users className="w-4 h-4" style={{ color: '#a78bfa' }} />
          </div>
          <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.9)' }}>Referral Activity</h3>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start gap-3 px-3 py-3 rounded-xl animate-pulse"
                style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                <div className="w-8 h-8 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,.06)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 rounded-full w-24" style={{ background: 'rgba(255,255,255,.08)' }} />
                  <div className="h-2.5 rounded-full w-32" style={{ background: 'rgba(255,255,255,.05)' }} />
                  <div className="h-2 rounded-full w-20" style={{ background: 'rgba(255,255,255,.04)' }} />
                </div>
                <div className="shrink-0 space-y-1.5">
                  <div className="h-2.5 rounded-full w-14" style={{ background: 'rgba(255,255,255,.05)' }} />
                  <div className="h-2 rounded-full w-10 ml-auto" style={{ background: 'rgba(255,255,255,.04)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)' }}>
              <Users className="w-5 h-5" style={{ color: 'rgba(167,139,250,.5)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>No referral activity yet</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Share your link to start earning rewards.</p>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="flex items-center gap-4 mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
                <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Total: <span style={{ color: 'rgba(255,255,255,0.85)' }}>{qualifiedCount + pendingCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#4ade80' }} />
                <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Qualified: <span style={{ color: '#4ade80' }}>{qualifiedCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: 'rgba(251,191,36,.7)' }} />
                <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Pending: <span style={{ color: 'rgba(251,191,36,.8)' }}>{pendingCount}</span>
                </span>
              </div>
            </div>

            {/* Date-grouped activities */}
            <div className="space-y-1">
              {groupedActivities.map(group => (
                <div key={group.dateKey}>
                  {/* Date separator */}
                  <div className="flex items-center gap-2 py-2 px-1">
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {group.dateLabel}
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,.06)' }} />
                  </div>
                  <div className="space-y-2">
                    {group.items.map(a => <ActivityItem key={a.id} activity={a} />)}
                  </div>
                </div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => setVisibleCount(c => c + ACTIVITY_PAGE_SIZE)}
                className="w-full mt-3 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[.98]"
                style={{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,.08)' }}
              >
                Load more ({activities.length - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});
ReferralActivitySection.displayName = 'ReferralActivitySection';

/* ─── LAZY SECTION HOOK (IntersectionObserver) ──────────────────── */
function useLazyVisible(rootMargin = '200px') {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, visible };
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════ */
const DashboardReferral = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats]       = useState<ReferralStats | null>(null);
  const [activities, setActivities] = useState<ReferralActivity[]>([]);
  const [claims, setClaims]     = useState<MilestoneClaim[]>([]);
  const [loading, setLoading]   = useState(true);
  const [rewardActivated, setRewardActivated] = useState<boolean | null>(null);
  const [copied, setCopied]     = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [claimModal, setClaimModal] = useState<TierDef | null>(null);
  const [claimForm, setClaimForm] = useState({ network: 'MTN', phone: '' });
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [editClaimId, setEditClaimId] = useState<string | null>(null);
  const [editClaimLoading, setEditClaimLoading] = useState(false);
  const [referralFrozen, setReferralFrozen] = useState(false);
  const [referralFrozenReason, setReferralFrozenReason] = useState<string | null>(null);
  const [agreedToReferralTerms, setAgreedToReferralTerms] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const ladderRef = useRef<HTMLDivElement | null>(null);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(false);

  // Tier unlock celebration state
  const [unlockTier, setUnlockTier] = useState<TierDef | null>(null);
  const [shownUnlocks, setShownUnlocks] = useState<Set<string>>(new Set());

  // Lazy section visibility (leaderboard only — others render eagerly)
  const leaderboardLazy = useLazyVisible('300px');

  const referralLink = stats?.referral_code ? `https://yiego.com/r/${stats.referral_code}` : '';

  // Request deduplication
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const loadData = useCallback(async (isRefetch = false) => {
    if (!user) return;

    // Dedupe concurrent calls
    if (loadPromiseRef.current && !isRefetch) return loadPromiseRef.current;

    const doLoad = async () => {
      if (!isRefetch) setLoading(true);
      try {
        const [profileRes, activityRes, claimsRes, lbSettingRes] = await Promise.all([
          supabase.from('profiles').select('referral_code, referral_success_count, referral_signup_count, reward_activated, referred_by, referral_frozen, referral_frozen_reason, referral_terms_accepted').eq('id', user.id).maybeSingle(),
          supabase.from('referral_activity').select('id, referee_id, status, created_at, first_success_order_id').eq('referrer_id', user.id).order('created_at', { ascending: false }),
          supabase.from('reward_claims').select('id, milestone_id, status, linked_order_id, network, phone, payout_gb').eq('user_id', user.id),
          supabase.from('site_settings').select('value').eq('key', 'weekly_leaderboard_enabled').maybeSingle(),
        ]);

        setLeaderboardEnabled(lbSettingRes.data?.value === 'true');

        if (profileRes.data) {
          setStats(profileRes.data as ReferralStats);
          const activated = (profileRes.data as any).reward_activated ?? false;
          const referredBy = (profileRes.data as any).referred_by;
          setReferralFrozen((profileRes.data as any).referral_frozen ?? false);
          setReferralFrozenReason((profileRes.data as any).referral_frozen_reason ?? null);
          setAgreedToReferralTerms((profileRes.data as any).referral_terms_accepted ?? false);
          setRewardActivated(activated);
          if (!activated && referredBy) {
            navigate('/reward-activation', { replace: true });
            return;
          }
        }
        if (activityRes.data && activityRes.data.length > 0) {
          // Batch username lookup via SECURITY DEFINER function (bypasses RLS)
          const refereeIds = [...new Set(activityRes.data.map(a => a.referee_id))];
          const { data: usernameRows, error: rpcError } = await supabase
            .rpc('get_referral_usernames', { p_user_ids: refereeIds });
          if (rpcError) console.error('[ReferralActivity] username RPC error:', rpcError.message);
          const usernameMap = new Map((usernameRows || []).map((r: any) => [r.user_id, r.username]));
          const enriched = activityRes.data.map(a => {
            const uname = usernameMap.get(a.referee_id) || null;
            if (!uname && a.referee_id) {
              console.error(`[ReferralActivity] Missing username for referee_id: ${a.referee_id}`);
            }
            return {
              ...a,
              referee_profile: { username: uname, full_name: '', phone: null, email: null },
            };
          });
          setActivities(enriched as ReferralActivity[]);
        } else {
          setActivities([]);
        }
        if (claimsRes.data) setClaims(claimsRes.data as MilestoneClaim[]);
      } finally {
        if (!isRefetch) setLoading(false);
        loadPromiseRef.current = null;
      }
    };

    const promise = doLoad();
    if (!isRefetch) loadPromiseRef.current = promise;
    return promise;
  }, [user, navigate]);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  // Check for new tier unlocks (show modal once per tier per session)
  const prevSuccessRef = useRef<number | null>(null);
  useEffect(() => {
    if (!stats) return;
    const sc = stats.referral_success_count;
    const prev = prevSuccessRef.current;
    prevSuccessRef.current = sc;

    // Only trigger on actual count increase (not initial load unless first time)
    if (prev === null) return;
    if (sc <= prev) return;

    // Find the highest tier just crossed
    for (let i = TIERS.length - 1; i >= 0; i--) {
      const tier = TIERS[i];
      if (sc >= tier.cumulative && prev < tier.cumulative && !shownUnlocks.has(tier.id)) {
        // Check if there's already a claim for this tier (don't show if already claimed)
        const existingClaim = claims.find(c => c.milestone_id === tier.id);
        if (!existingClaim || existingClaim.status === 'rejected' || existingClaim.status === 'failed') {
          setUnlockTier(tier);
          setShownUnlocks(s => new Set(s).add(tier.id));
        }
        break;
      }
    }
  }, [stats?.referral_success_count, claims, shownUnlocks]);

  // Realtime: re-fetch claims when linked orders change status
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('reward-order-sync')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'reward_claims',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        // Show delivered celebration toast
        const newStatus = (payload.new as any)?.status;
        if (newStatus === 'delivered') {
          const milestoneId = (payload.new as any)?.milestone_id;
          const tier = TIERS.find(t => t.id === milestoneId);
          const payoutGb = (payload.new as any)?.payout_gb;
          const network = (payload.new as any)?.network;
          const phone = (payload.new as any)?.phone;
          toast.success(
            `🎉 ${payoutGb || tier?.deliverGb || '?'}GB Delivered to ${network} · ${phone}!`,
            { duration: 8000, icon: <PartyPopper className="w-5 h-5 text-amber-400" /> }
          );
        }
        loadData(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadData]);

  const handleCopy = useCallback(async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Link Copied ⚡');
      setTimeout(() => setCopied(false), 2500);
    } catch { toast.error('Copy failed. Please copy manually.'); }
  }, [referralLink]);

  const handleCodeCopy = useCallback(async () => {
    if (!stats?.referral_code) return;
    try {
      await navigator.clipboard.writeText(stats.referral_code);
      setCodeCopied(true);
      toast.success('Code Copied ⚡');
      setTimeout(() => setCodeCopied(false), 2500);
    } catch { toast.error('Copy failed.'); }
  }, [stats?.referral_code]);

  const handleShare = useCallback(async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Get FREE data on YieGo!', text: 'Join YieGo — buy affordable data bundles in Ghana. Use my referral link!', url: referralLink }); }
      catch { /* cancelled */ }
    } else { handleCopy(); }
  }, [referralLink, handleCopy]);

  /* ─── CLAIM MODAL OPEN ───────────────────────────────────────────── */
  const openClaimModal = useCallback((tier: TierDef) => {
    setEditClaimId(null);
    setClaimModal(tier);
    setClaimForm({ network: 'MTN', phone: '' });
    setTermsChecked(false);
  }, []);

  const openEditModal = useCallback((claim: MilestoneClaim) => {
    const tier = TIERS.find(t => t.id === claim.milestone_id);
    if (!tier) return;
    setEditClaimId(claim.id);
    setClaimModal(tier);
    setClaimForm({ network: claim.network, phone: claim.phone });
  }, []);

  /* ─── CLAIM SUBMIT ───────────────────────────────────────────────── */
  const handleClaimSubmit = useCallback(async () => {
    if (!claimModal) return;

    if (!claimForm.phone.trim()) { toast.error('Enter recipient phone number'); return; }
    const cleaned = claimForm.phone.replace(/\s+/g, '').replace(/^\+233/, '0');
    if (!/^0[235][0-9]{8}$/.test(cleaned)) {
      toast.error('Enter a valid Ghana phone number (e.g. 0551234567)');
      return;
    }

    if (editClaimId) {
      setEditClaimLoading(true);
      try {
        const { error } = await supabase
          .from('reward_claims')
          .update({ network: claimForm.network, phone: cleaned })
          .eq('id', editClaimId)
          .eq('user_id', user?.id ?? '')
          .eq('status', 'pending_admin');
        if (error) {
          console.error('[DashboardReferral] Edit claim error:', error);
          toast.error(error.message || 'Could not update claim. Please try again.');
        } else {
          toast.success('Claim updated successfully ✅');
          setClaimModal(null);
          setEditClaimId(null);
          await loadData();
        }
      } catch (err) {
        console.error('[DashboardReferral] Edit claim exception:', err);
        toast.error('Something went wrong.');
      } finally { setEditClaimLoading(false); }
      return;
    }

    setClaimSubmitting(true);

    if (termsChecked && !agreedToReferralTerms && user) {
      await supabase.from('profiles').update({
        referral_terms_accepted: true,
        referral_terms_accepted_at: new Date().toISOString(),
      }).eq('id', user.id);
      setAgreedToReferralTerms(true);
    }

    const payload = {
      milestone_id: claimModal.id,
      network: claimForm.network,
      phone: cleaned,
    };
    console.log('[DashboardReferral] Submitting claim payload:', payload);

    try {
      const { data, error } = await supabase.functions.invoke('referral-submit-claim', {
        body: payload,
      });

      console.log('[DashboardReferral] Claim response:', { data, error });

      if (error) {
        console.error('[DashboardReferral] Function invocation error:', error);
        let message = 'Failed to submit claim. Please try again.';
        try {
          const parsed = typeof error.context?.json === 'function'
            ? await error.context.json()
            : null;
          if (parsed?.error) message = parsed.error;
        } catch { /* ignore */ }
        toast.error(message);
        return;
      }

      if (!data) {
        toast.error('No response from server. Please try again.');
        return;
      }

      if (data.success) {
        setClaimModal(null);
        if (data.already_claimed) {
          toast.info(
            data.status === 'pending_admin'
              ? 'This reward is already pending admin review.'
              : 'You already have an active claim for this milestone.'
          );
        } else {
          toast.success(`🎉 ${claimModal.deliverGb}GB reward claimed! Pending admin verification.`, { duration: 5000 });
          setTimeout(() => {
            toast('View your reward order?', {
              action: { label: 'View Orders', onClick: () => navigate('/dashboard/orders') },
              duration: 6000,
            });
          }, 800);
        }
        await loadData();
      } else {
        const errMsg = data.error || data.detail || 'Failed to submit claim. Please try again.';
        const errCode = data.error_code;
        console.error('[DashboardReferral] Claim server error:', data);
        
        if (errCode === 'REWARDS_FROZEN') {
          toast.error(errMsg, { duration: 6000 });
          setClaimModal(null);
          await loadData();
        } else if (errCode === 'TIER_NOT_REACHED') {
          toast.error(errMsg, { duration: 5000 });
        } else if (errCode === 'ACCOUNT_SUSPENDED') {
          toast.error(errMsg, { duration: 8000 });
          setClaimModal(null);
        } else {
          toast.error(errMsg);
        }
      }
    } catch (err) {
      console.error('[DashboardReferral] Claim unexpected exception:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setClaimSubmitting(false);
    }
  }, [claimModal, claimForm, editClaimId, user, agreedToReferralTerms, termsChecked, loadData, navigate]);

  /* ─── DERIVED VALUES (memoized) ─────────────────────────────────── */
  const successCount = stats?.referral_success_count ?? 0;

  const tierInfo = useMemo(() => {
    const reachedIdx = getReachedTierIdx(successCount);
    const nextIdx = getNextTierIdx(successCount);
    const isElite = reachedIdx === TIERS.length - 1;
    const current = reachedIdx >= 0 ? TIERS[reachedIdx] : null;
    const next = TIERS[nextIdx];
    const currentReq = reachedIdx >= 0 ? TIERS[reachedIdx].cumulative : 0;
    const { progressPercent, remaining } = getTierProgressInfo(successCount, currentReq, next.cumulative);
    const showRefs = reachedIdx < 0;
    const firstTierToGo = Math.max(0, TIERS[0].cumulative - successCount);
    const isNear = !isElite && successCount >= TIERS[nextIdx].cumulative - Math.max(2, Math.ceil(TIERS[nextIdx].requiredPerTier * 0.15));
    return { reachedIdx, nextIdx, isElite, current, next, progressPercent, remaining, showRefs, firstTierToGo, isNear };
  }, [successCount]);

  const { reachedIdx: reachedTierIdx, nextIdx: nextTierIdx, isElite: isEliteReached, current: currentTier, next: nextTier, progressPercent: progressToNext, remaining: refsRemaining, showRefs: showRefsToGo, firstTierToGo: firstTierRefsToGo, isNear: isNearUnlock } = tierInfo;

  const { deliveredLabel, deliveredGb } = useMemo(() => {
    const gb = claims
      .filter(c => c.status === 'delivered')
      .reduce((sum, c) => sum + (Number(c.payout_gb) || 0), 0);
    return { deliveredGb: gb, deliveredLabel: gb > 0 ? `${gb}GB` : '0GB' };
  }, [claims]);

  // Stable callback maps for tier cards to avoid inline closures
  const tierClaimHandlers = useMemo(() =>
    TIERS.reduce((acc, tier) => {
      acc[tier.id] = {
        onClaim: () => openClaimModal(tier),
        onEdit: () => { const c = claims.find(cl => cl.milestone_id === tier.id); if (c) openEditModal(c); },
      };
      return acc;
    }, {} as Record<string, { onClaim: () => void; onEdit: () => void }>),
  [openClaimModal, openEditModal, claims]);

  /* ─── LOADING ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <DashboardLayout>
        <style>{`
          @keyframes rl-quest-gradient {
            0%   { background-position: 0% 50%; }
            50%  { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes rl-quest-fade-in {
            from { opacity: 0; transform: scale(0.92); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes rl-quest-orbit {
            0%   { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes rl-quest-dot-pulse {
            0%,100% { transform: scale(1); opacity: 0.7; }
            50%      { transform: scale(1.25); opacity: 1; }
          }
        `}</style>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div
            className="flex flex-col items-center gap-5"
            style={{ animation: 'rl-quest-fade-in 0.5s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            {/* Orbital ring loader */}
            <div className="relative" style={{ width: 96, height: 96 }}>
              {/* Outer orbit ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  border: '2.5px solid transparent',
                  borderTopColor: '#fbbf24',
                  borderRightColor: 'rgba(245,158,11,.3)',
                  animation: 'rl-quest-orbit 1.8s linear infinite',
                  willChange: 'transform',
                  filter: 'drop-shadow(0 0 8px rgba(251,191,36,.4))',
                }}
              />
              {/* Inner orbit ring (counter-rotate) */}
              <div
                className="absolute rounded-full"
                style={{
                  inset: 10,
                  border: '2px solid transparent',
                  borderBottomColor: '#f59e0b',
                  borderLeftColor: 'rgba(245,158,11,.2)',
                  animation: 'rl-quest-orbit 2.4s linear infinite reverse',
                  willChange: 'transform',
                  filter: 'drop-shadow(0 0 6px rgba(245,158,11,.3))',
                }}
              />
              {/* Center pulsing dot */}
              <div
                className="absolute top-1/2 left-1/2 rounded-full"
                style={{
                  width: 18,
                  height: 18,
                  transform: 'translate(-50%,-50%)',
                  background: 'radial-gradient(circle at 40% 35%, #fde68a, #f59e0b)',
                  boxShadow: '0 0 20px 6px rgba(251,191,36,.35)',
                  animation: 'rl-quest-dot-pulse 2s ease-in-out infinite',
                  willChange: 'transform, opacity',
                }}
              />
            </div>

            {/* Badge */}
            <span
              className="text-[9px] font-black uppercase tracking-[0.25em] px-3 py-1 rounded-full"
              style={{ background: 'rgba(245,158,11,.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,.25)' }}
            >
              REFERRAL QUEST
            </span>

            <p className="text-sm font-bold text-center" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Preparing your referral quest…
            </p>

            {/* Subtle gradient bar */}
            <div className="w-48 h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: '55%',
                  background: 'linear-gradient(90deg, #b45309, #f59e0b, #fbbf24, #4ade80, #fbbf24, #f59e0b)',
                  backgroundSize: '300% 100%',
                  animation: 'rl-quest-gradient 3s ease-in-out infinite',
                  willChange: 'background-position',
                  boxShadow: '0 0 8px 1px rgba(245,158,11,.25)',
                }}
              />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const accentColor = currentTier?.color ?? '#f59e0b';

  return (
    <DashboardLayout>
      <SEOHead title="Refer & Earn – YieGo" description="Invite friends to YieGo and earn up to 25GB in free data bundle rewards." path="/dashboard/referral" noIndex />
      <style>{LADDER_STYLES}</style>

      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.5) 100%)' }} />

      <div className="relative z-10 max-w-2xl mx-auto pb-44 md:pb-20 space-y-3 px-0">

        {/* ══ 1. HERO QUEST BANNER ════════════════════════════════════ */}
        <div
          className="relative overflow-hidden rounded-3xl shadow-2xl"
          style={{
            background: isEliteReached
              ? 'linear-gradient(145deg, hsl(38 100% 8%), hsl(43 100% 13%), hsl(48 90% 17%))'
              : 'linear-gradient(145deg, hsl(224 42% 8%), hsl(228 36% 11%), hsl(38 65% 11%))',
            border: isEliteReached ? '2px solid rgba(251,191,36,.65)' : '1px solid rgba(245,158,11,.22)',
            boxShadow: isEliteReached ? '0 0 70px 10px rgba(251,191,36,.18), 0 4px 40px rgba(0,0,0,.5)' : '0 4px 36px rgba(0,0,0,.45)',
          }}
        >
          <div className="rl-orb absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(245,158,11,.35) 0%, transparent 65%)', filter: 'blur(40px)' }} />
          <div className="rl-shimmer absolute inset-0 pointer-events-none opacity-[0.05]"
            style={{ background: 'linear-gradient(108deg, transparent 30%, rgba(255,255,255,1) 50%, transparent 70%)' }} />

          <div className="relative z-10 p-5 md:p-7">
            <div className="flex items-center justify-between mb-4">
              <span className="rl-badge-wobble inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
                style={{ background: 'rgba(245,158,11,.13)', border: '1px solid rgba(245,158,11,.35)', color: '#fcd34d' }}>
                <Zap className="w-3 h-3 rl-zap-pulse" style={{ color: '#fbbf24' }} />
                {isEliteReached ? 'ELITE REFERRER' : 'REWARD SEASON ACTIVE'}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-black" style={{ color: '#4ade80' }}>
                <span className="rl-blink w-2 h-2 rounded-full bg-green-400 inline-block" />
                ACTIVE
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-black leading-tight mb-1" style={{ color: '#ffffff' }}>
              {isEliteReached ? (
                <>
                  <Crown className="inline w-7 h-7 mb-1 mr-2" style={{ color: '#fbbf24', filter: 'drop-shadow(0 0 10px rgba(251,191,36,.8))' }} />
                  <span style={{ color: '#fbbf24', textShadow: '0 0 40px rgba(251,191,36,.8)' }}>Elite Achieved</span>
                  <span style={{ color: '#ffffff' }}> 🎉</span>
                </>
              ) : (
                <>
                  Earn up to{' '}
                  <span className="rl-25gb-shimmer inline-block" style={{
                    background: 'linear-gradient(100deg, #f59e0b 10%, #fbbf24 40%, #fff7b0 55%, #fbbf24 70%, #f59e0b 90%)',
                    backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent',
                    fontSize: '1.15em', textShadow: 'none',
                  }}>25GB</span>{' '}Free
                </>
              )}
            </h1>

            <p className="text-sm font-medium mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {isEliteReached
                ? "You've completed all milestones. You're a YieGo legend!"
                : 'Invite friends who place successful orders — climb the reward ladder.'}
            </p>

            {!isEliteReached && (
              <p className="text-[11px] font-bold mb-4" style={{ color: 'rgba(251,191,36,.85)' }}>
                {showRefsToGo
                  ? `${progressToNext}% to Bronze · ${firstTierRefsToGo} referral${firstTierRefsToGo !== 1 ? 's' : ''} to go`
                  : `${progressToNext}% to ${nextTier.tierName} · Keep sharing to level up!`}
              </p>
            )}
            {isEliteReached && (
              <p className="text-[11px] font-bold mb-4" style={{ color: '#4ade80' }}>
                👑 All milestones complete — 25GB Elite!
              </p>
            )}

            <div className="flex gap-2">
              <StatCapsule value={successCount} label="Successful" icon={<Star className="w-3.5 h-3.5" />} accent />
              <StatCapsule value={currentTier ? currentTier.tierName : '—'} label="Current Tier" icon={<TrendingUp className="w-3.5 h-3.5" />} tierColor={currentTier?.color} />
              <StatCapsule value={deliveredLabel} label="Delivered" icon={<Gift className="w-3.5 h-3.5" />} />
            </div>
          </div>
        </div>

        {/* ══ 2. REWARD LADDER ════════════════════════════════════════ */}
        <div ref={ladderRef} className="relative overflow-hidden rounded-3xl p-5 shadow-xl" style={darkCard}>
          <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }} />
          <div className="flex items-center justify-between mb-5 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <TrendingUp className="w-4 h-4" style={{ color: '#fbbf24' }} />
                <h2 className="font-black text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.9)' }}>Reward Ladder</h2>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {isEliteReached
                  ? '👑 All milestones complete — Elite level!'
                  : isNearUnlock
                  ? `Almost there! ${progressToNext}% to ${nextTier.tierName}`
                  : showRefsToGo
                  ? `${progressToNext}% to 1GB Bronze · ${firstTierRefsToGo} referral${firstTierRefsToGo !== 1 ? 's' : ''} to go`
                  : `${progressToNext}% to ${nextTier.tierName} · Keep sharing to level up!`}
              </p>
            </div>
            <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider"
              style={{ background: 'rgba(251,191,36,.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,.2)' }}>
              25GB MAX
            </span>
          </div>

          {/* Tier node track */}
          <div className="relative flex items-end justify-between gap-0 mb-4 px-1 relative z-10">
            <div className="absolute left-[5%] right-[5%] bottom-[28px] h-[3px] rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: isEliteReached ? '100%' : `${Math.min((successCount / MAX_CUMULATIVE) * 100, 100)}%`,
                  willChange: 'width',
                  background: `linear-gradient(90deg, #cd7f32, #94a3b8, #f59e0b, #67e8f9, #fbbf24)`,
                  boxShadow: '0 0 8px 2px rgba(245,158,11,.35)',
                }}
              />
            </div>
            {TIERS.map((tier) => {
              const reached = successCount >= tier.cumulative;
              const isNext = tier.id === nextTier.id && !reached;
              // Calculate progress toward this specific tier for brightness scaling
              const prevCum = TIERS.indexOf(tier) > 0 ? TIERS[TIERS.indexOf(tier) - 1].cumulative : 0;
              const tierProgress = isNext ? getTierProgressInfo(successCount, prevCum, tier.cumulative).progressPercent : 0;
              return (
                <TierNode key={tier.id} tier={tier} reached={reached} isNext={isNext} progressTowardThis={tierProgress} />
              );
            })}
          </div>

          {/* ── NEXT-TIER PROGRESS BAR ──── */}
          <NextTierProgressBar successCount={successCount} frozen={referralFrozen} frozenReason={referralFrozenReason} />

          {/* Per-tier cards with tier-specific glows */}
          <div className="space-y-3 relative z-10 mt-2">
            {TIERS.map((tier, i) => {
              const claim = claims.find(c => c.milestone_id === tier.id) ?? null;
              const reached = successCount >= tier.cumulative;
              const prevCumulative = i > 0 ? TIERS[i - 1].cumulative : 0;
              const refsInTier = Math.max(0, Math.min(successCount - prevCumulative, tier.requiredPerTier));
              const tierPct = Math.round((refsInTier / tier.requiredPerTier) * 100);
              const isLocked = !reached && !(claim);
              const isActive = !reached && (successCount > prevCumulative || i === 0);
              const isDelivered = claim?.status === 'delivered';
              const handlers = tierClaimHandlers[tier.id];

              return (
                <div
                  key={tier.id}
                  className="relative rounded-2xl p-3.5 transition-all duration-300 overflow-hidden"
                  style={{
                    background: reached
                      ? `rgba(${tier.glowRgb},.08)`
                      : isActive
                      ? 'rgba(255,255,255,.04)'
                      : 'rgba(255,255,255,.02)',
                    border: reached
                      ? `1px solid rgba(${tier.glowRgb},.35)`
                      : isActive
                      ? '1px solid rgba(255,255,255,.08)'
                      : '1px solid rgba(255,255,255,.04)',
                    boxShadow: reached
                      ? `0 0 20px 2px rgba(${tier.glowRgb},.12), inset 0 1px 0 rgba(${tier.glowRgb},.15)`
                      : 'none',
                  }}
                >
                  {/* Tier-specific ambient glow for reached tiers */}
                  {reached && (
                    <div className="absolute inset-0 pointer-events-none rounded-2xl"
                      style={{
                        background: `radial-gradient(ellipse at 20% 30%, rgba(${tier.glowRgb},.12), transparent 60%)`,
                        animation: tier.elite ? 'rl-tier-glow 3s ease-in-out infinite' : 'none',
                        willChange: tier.elite ? 'opacity' : 'auto',
                      }}
                    />
                  )}

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {reached ? (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center"
                            style={{
                              background: tier.color,
                              boxShadow: `0 0 8px 2px rgba(${tier.glowRgb},.4)`,
                              animation: 'rl-check-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                              willChange: 'transform, opacity',
                            }}>
                            <Check className="w-3 h-3" style={{ color: '#0a0a0a' }} />
                          </div>
                        ) : isLocked ? (
                          <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{
                            background: `rgba(${tier.glowRgb},.08)`,
                            border: `1px solid rgba(${tier.glowRgb},.2)`,
                          }}>
                            <tier.icon className="w-2.5 h-2.5" style={{ color: `rgba(${tier.glowRgb},.35)` }} />
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full" style={{ background: tier.color, boxShadow: `0 0 6px ${tier.color}` }} />
                        )}
                        <span className="text-xs font-black" style={{ color: reached ? tier.color : isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)' }}>
                          {tier.tierName}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                          background: reached ? `rgba(${tier.glowRgb},.18)` : 'rgba(255,255,255,.06)',
                          color: reached ? tier.color : 'rgba(255,255,255,0.35)',
                          border: `1px solid ${reached ? `rgba(${tier.glowRgb},.35)` : 'rgba(255,255,255,.06)'}`,
                        }}>
                          {tier.label}
                        </span>
                        {/* "Unlocked" pill for reached tiers without claims yet */}
                        {reached && !claim && (
                          <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                            style={{
                              background: `rgba(${tier.glowRgb},.2)`,
                              color: tier.color,
                              border: `1px solid rgba(${tier.glowRgb},.3)`,
                              animation: 'rl-tier-unlocked-pill 0.4s ease-out both',
                              willChange: 'transform, opacity',
                            }}>
                            Unlocked!
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold" style={{
                          color: isDelivered ? '#4ade80' : reached ? tier.color : isActive ? tier.color : 'rgba(255,255,255,.25)',
                        }}>
                          {isDelivered ? '✓ Delivered' : reached ? '✓ Reached' : isActive ? `${tierPct}%` : 'Next Target'}
                        </span>
                      </div>
                    </div>

                    {/* Claim action inside tier card */}
                    <TierClaimCard
                      tier={tier}
                      claim={claim}
                      reached={reached}
                      frozen={referralFrozen}
                      frozenReason={referralFrozenReason}
                      onClaim={handlers.onClaim}
                      onEdit={handlers.onEdit}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ 3. QUEST LINK ═══════════════════════════════════════════ */}
        <div className="relative overflow-hidden rounded-3xl p-5" style={darkCard}>
          <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,.15)' }}>
                <Link2 className="w-4 h-4" style={{ color: '#fbbf24' }} />
              </div>
              <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.9)' }}>Your Quest Link</h3>
            </div>

            <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid rgba(255,255,255,.09)', background: 'rgba(0,0,0,.3)' }}>
              <div className="px-3 py-2.5 flex items-center gap-2">
                <p className="text-xs flex-1 min-w-0 truncate font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {referralLink || 'Loading…'}
                </p>
                <button
                  onClick={handleCopy}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all active:scale-95"
                  style={{ background: 'rgba(245,158,11,.2)', color: '#fbbf24', border: '1px solid rgba(245,158,11,.3)' }}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {stats?.referral_code && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Code:</span>
                <code className="text-xs font-black tracking-widest px-2 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,.2)' }}>
                  {stats.referral_code}
                </code>
                <button
                  onClick={handleCodeCopy}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,.08)' }}
                >
                  {codeCopied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                  {codeCopied ? 'Copied' : 'Copy code'}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleShare}
                className="flex-1 h-10 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-[.98]"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#0a0a0a', boxShadow: '0 4px 20px rgba(245,158,11,.25)' }}
              >
                <Share2 className="w-3.5 h-3.5" />
                Share Link
              </button>
              <button
                onClick={handleCopy}
                className="flex-1 h-10 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-[.98]"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,.1)' }}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Link
              </button>
            </div>

            <div className="flex items-center gap-3 mt-3 pt-3 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3" style={{ color: '#a78bfa' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span className="font-black" style={{ color: 'rgba(255,255,255,0.75)' }}>{stats?.referral_signup_count ?? 0}</span> signed up
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Star className="w-3 h-3" style={{ color: '#fbbf24' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span className="font-black" style={{ color: 'rgba(255,255,255,0.75)' }}>{stats?.referral_success_count ?? 0}</span> successful
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ 3.5 WEEKLY LEADERBOARD (lazy + conditional) ════════════ */}
        <div ref={leaderboardLazy.ref}>
          {leaderboardEnabled && leaderboardLazy.visible && (
            <Suspense fallback={
              <div className="rounded-3xl p-5 flex items-center justify-center" style={darkCard}>
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'rgba(251,191,36,.4)', borderTopColor: 'transparent' }} />
              </div>
            }>
              <WeeklyLeaderboard />
            </Suspense>
          )}
        </div>

        {/* ══ 4. HOW IT WORKS ═══════════════════════════════════ */}
        <HowItWorks />

        {/* ══ 5. REFERRAL ACTIVITY ════════════════════════════════════ */}
        <ReferralActivitySection loading={loading} activities={activities} />

        {/* Referral Terms Link */}
        <div className="text-center pt-2 pb-4">
          <Link to="/referral-terms" className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors" style={{ color: 'rgba(251,191,36,.7)' }}>
            <ScrollText className="w-3.5 h-3.5" />
            Referral Program Terms & Conditions
          </Link>
        </div>

      </div>

      {/* ══ TIER UNLOCK CELEBRATION MODAL ════════════════════════════ */}
      <TierUnlockModal
        tier={unlockTier}
        open={!!unlockTier}
        onClose={() => setUnlockTier(null)}
      />

      {/* ══ CLAIM MODAL ═════════════════════════════════════════════ */}
      <Dialog open={!!claimModal} onOpenChange={open => { if (!open) { setClaimModal(null); setEditClaimId(null); } }}>
        <DialogContent className="max-w-sm mx-auto" style={{ background: 'hsl(222 28% 10%)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'rgba(255,255,255,0.9)' }}>
              {editClaimId ? `Edit Claim — ${claimModal?.label}` : `Claim ${claimModal?.tierName} Reward`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Delivery info */}
            {!editClaimId && claimModal && (
              <div className="rounded-xl p-3" style={{ background: `rgba(${claimModal.glowRgb},.08)`, border: `1px solid rgba(${claimModal.glowRgb},.25)` }}>
                <p className="text-xs font-bold" style={{ color: claimModal.color }}>🎁 {claimModal.deliverGb}GB will be delivered</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {claimModal.tierName} milestone: {claimModal.label} total · Payout: {claimModal.deliverGb}GB
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Already earned: {deliveredGb}GB · Reward delivered after admin verification.
                </p>
              </div>
            )}

            {/* Network selection */}
            <div>
              <Label className="text-xs font-black mb-2 block" style={{ color: 'rgba(255,255,255,0.7)' }}>Select Network</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['MTN', 'Telecel', 'AirtelTigo'] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setClaimForm(f => ({ ...f, network: n }))}
                    className="py-2 rounded-xl text-xs font-black transition-all active:scale-95"
                    style={{
                      background: claimForm.network === n ? `rgba(${claimModal?.glowRgb || '245,158,11'},.2)` : 'rgba(255,255,255,.06)',
                      color: claimForm.network === n ? (claimModal?.color || '#fbbf24') : 'rgba(255,255,255,0.55)',
                      border: claimForm.network === n ? `1.5px solid ${claimModal?.color || '#fbbf24'}66` : '1px solid rgba(255,255,255,.08)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Phone number */}
            <div>
              <Label className="text-xs font-black mb-2 block" style={{ color: 'rgba(255,255,255,0.7)' }}>Recipient Phone Number</Label>
              <Input
                value={claimForm.phone}
                onChange={e => setClaimForm(f => ({ ...f, phone: e.target.value.replace(/[^0-9+]/g, '') }))}
                placeholder="e.g. 0551234567"
                maxLength={15}
                className="h-11 text-sm"
                style={{ background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,0.9)' }}
              />
              <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                ⚠️ Double-check your number. Delivery to wrong number cannot be reversed.
              </p>
            </div>

            {/* Referral Terms Agreement */}
            {!editClaimId && !agreedToReferralTerms && (
              <label className="flex items-start gap-2 cursor-pointer rounded-xl p-3" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                <input
                  type="checkbox"
                  checked={termsChecked}
                  onChange={e => setTermsChecked(e.target.checked)}
                  className="mt-0.5 accent-amber-500"
                />
                <span className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  I agree to the{' '}
                  <Link to="/referral-terms" target="_blank" className="underline font-bold" style={{ color: '#fbbf24' }}>
                    Referral Program Terms & Conditions
                  </Link>
                </span>
              </label>
            )}

            <Button
              onClick={handleClaimSubmit}
              disabled={claimSubmitting || editClaimLoading || (!editClaimId && !agreedToReferralTerms && !termsChecked)}
              className="w-full h-11 font-black text-sm"
              style={{
                background: claimModal ? `linear-gradient(135deg, ${claimModal.color}, ${claimModal.color}cc)` : undefined,
                color: '#0a0a0a',
                border: 'none',
              }}
            >
              {(claimSubmitting || editClaimLoading) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editClaimId ? 'Update Claim' : `Claim ${claimModal?.deliverGb}GB Now`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default DashboardReferral;
