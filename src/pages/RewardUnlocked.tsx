import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Crown, Copy, Share2, ArrowRight, Loader2, Check, Sparkles } from 'lucide-react';
import Logo from '@/components/layout/Logo';
import { toast } from 'sonner';

/* ─── Simple Confetti ────────────────────────────────────────────────── */
interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  size: number;
}

function Confetti() {
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: ['#fbbf24', '#f59e0b', '#fcd34d', '#fff', '#fde68a', '#fbbf24', '#a78bfa', '#60a5fa'][Math.floor(Math.random() * 8)],
      delay: Math.random() * 0.8,
      duration: 1.8 + Math.random() * 1.2,
      size: 4 + Math.random() * 6,
    }))
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: '-10px',
            width: p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            background: p.color,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s both`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/**
 * /reward-unlocked
 * Shown after FIRST successful purchase for a referral user.
 * Celebrates activation and prompts immediate sharing.
 */
export default function RewardUnlocked() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth', { replace: true }); return; }

    const run = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_code, referred_by, reward_activated')
        .eq('id', user.id)
        .maybeSingle();

      // Only show this page to users who came via referral
      if (!profile?.referred_by) {
        navigate('/dashboard/referral', { replace: true });
        return;
      }

      setReferralCode(profile?.referral_code ?? '');
      setLoading(false);
    };

    run();

    // Auto-hide confetti after 3s
    const t = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(t);
  }, [user, authLoading, navigate]);

  const referralLink = `https://datasika.com/r/${referralCode}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy link');
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Earn 25GB FREE on DataSika!',
          text: 'Join DataSika via my link and we both earn free data! Buy any bundle and start climbing to 25GB.',
          url: referralLink,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222 47% 6%)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, hsl(222 47% 6%) 0%, hsl(222 42% 9%) 55%, hsl(222 38% 12%) 100%)' }}
    >
      <style>{`
        @keyframes ru-fade-up {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ru-crown-bounce {
          0%,100% { transform: translateY(0) rotate(-3deg); }
          50%      { transform: translateY(-10px) rotate(3deg); }
        }
        @keyframes ru-shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes ru-ring {
          0%   { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0; transform: scale(2.4); }
        }
        @keyframes ru-orb {
          0%,100% { opacity: 0.15; transform: scale(1); }
          50%      { opacity: 0.28; transform: scale(1.1); }
        }
        @keyframes ru-burst {
          0%   { opacity: 0; transform: scale(0.5); }
          30%  { opacity: 1; }
          100% { opacity: 0; transform: scale(1.8); }
        }
        .ru-fade-1 { animation: ru-fade-up 0.5s ease-out 0.05s both; }
        .ru-fade-2 { animation: ru-fade-up 0.5s ease-out 0.20s both; }
        .ru-fade-3 { animation: ru-fade-up 0.5s ease-out 0.35s both; }
        .ru-fade-4 { animation: ru-fade-up 0.5s ease-out 0.50s both; }
        .ru-fade-5 { animation: ru-fade-up 0.5s ease-out 0.65s both; }
        .ru-fade-6 { animation: ru-fade-up 0.5s ease-out 0.80s both; }
        .ru-crown  { animation: ru-crown-bounce 2.4s ease-in-out infinite; }
        .ru-25gb {
          background: linear-gradient(90deg, hsl(45 100% 50%), hsl(48 100% 68%), hsl(45 100% 50%), hsl(38 100% 60%));
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: ru-shimmer 2.5s linear infinite;
        }
        .ru-ring-1 { animation: ru-ring 2s ease-out 0.3s infinite; }
        .ru-ring-2 { animation: ru-ring 2s ease-out 0.8s infinite; }
      `}</style>

      {/* Confetti burst */}
      {showConfetti && <Confetti />}

      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[340px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse, hsl(45 100% 50% / 0.18), transparent 60%)', animation: 'ru-orb 7s ease-in-out infinite' }}
        aria-hidden
      />

      {/* Pulsing rings around crown area */}
      <div className="pointer-events-none fixed top-[22%] left-1/2 -translate-x-1/2" aria-hidden>
        <div className="ru-ring-1 w-28 h-28 rounded-full border-2" style={{ borderColor: 'rgba(251,191,36,0.3)' }} />
        <div className="ru-ring-2 absolute inset-0 w-28 h-28 rounded-full border" style={{ borderColor: 'rgba(251,191,36,0.15)' }} />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/5 backdrop-blur-md" style={{ background: 'hsl(222 47% 6% / 0.85)' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/">
            <Logo height="h-7" />
          </Link>
          <Link to="/dashboard/referral" className="text-sm text-slate-400 hover:text-white transition-colors">
            My Rewards
          </Link>
        </div>
      </nav>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-sm w-full text-center">

          {/* Crown icon */}
          <div className="ru-fade-1 relative inline-block mb-6">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto"
              style={{
                background: 'radial-gradient(circle at 40% 35%, rgba(245,158,11,0.25), rgba(245,158,11,0.05))',
                border: '2px solid rgba(245,158,11,0.35)',
                boxShadow: '0 0 40px 8px rgba(245,158,11,0.2)',
              }}>
              <Crown className="ru-crown w-12 h-12 text-yellow-400" style={{ filter: 'drop-shadow(0 0 12px rgba(251,191,36,0.8))' }} />
            </div>
          </div>

          {/* Headline */}
          <h1 className="ru-fade-2 text-3xl sm:text-4xl font-black text-white mb-2 leading-tight">
            🎉 Reward Ladder<br />
            <span style={{ color: '#fbbf24', textShadow: '0 0 30px rgba(251,191,36,0.5)' }}>Unlocked!</span>
          </h1>

          <p className="ru-fade-3 text-slate-300 text-sm mb-1">
            You can now earn up to{' '}
            <span className="ru-25gb font-black text-xl">25GB</span>
            {' '}in free data.
          </p>
          <p className="ru-fade-3 text-xs mb-8" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Share your link. Friends sign up & buy. You climb the ladder.
          </p>

          {/* Progress bar (0% start) */}
          <div className="ru-fade-4 mb-6 text-left rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                Your Progress
              </span>
              <span className="font-black" style={{ color: '#fbbf24' }}>0% to 1GB Bronze</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="h-full rounded-full" style={{ width: '0%', background: 'linear-gradient(90deg, hsl(45 100% 50%), hsl(45 100% 65%))' }} />
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Start referring to earn your first 1GB 🏆</p>
          </div>

          {/* Referral link card */}
          <div
            className="ru-fade-5 rounded-2xl border p-4 mb-5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <p className="text-xs font-black mb-2 text-left" style={{ color: 'rgba(255,255,255,0.5)' }}>YOUR REFERRAL LINK</p>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 rounded-xl border px-3 py-2 text-xs font-mono truncate"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
              >
                {referralLink}
              </div>
              <button
                onClick={copyLink}
                className="shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center transition-all hover:border-yellow-400/40 hover:text-yellow-400"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                title="Copy link"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* CTAs */}
          <div className="ru-fade-6 space-y-3">
            <button
              onClick={shareLink}
              className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl font-black text-base transition-all"
              style={{
                background: 'linear-gradient(135deg, hsl(45 100% 50%), hsl(44 100% 58%))',
                color: '#1a1a0a',
                boxShadow: '0 4px 32px rgba(245,158,11,0.4)',
              }}
            >
              <Share2 className="w-5 h-5" />
              Start Sharing Now
            </button>
            <Link
              to="/dashboard/referral"
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              View Reward Ladder
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
