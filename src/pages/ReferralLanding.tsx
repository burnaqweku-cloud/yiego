import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PasswordStrengthBar from '@/components/auth/PasswordStrengthBar';
import {
  Gift, Star, ShieldCheck, Zap, ChevronRight,
  CheckCircle2, XCircle, Loader2, Eye, EyeOff,
  AlertCircle, ArrowRight, Lock, Users, Package
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import Logo from '@/components/layout/Logo';

/* ─── Zod schemas (same as Auth.tsx) ─────────────────────────────── */
const emailSchema = z.string().email('Please enter a valid email address');
const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Only letters, numbers, underscores, and dots allowed');

/* ─── Ghana phone validation ──────────────────────────────────────── */
const isValidGhanaPhone = (v: string) =>
  /^(?:0|\+233)?\d{9,10}$/.test(v.replace(/\s/g, ''));

/* ─── Milestone ladder (visual only) ─────────────────────────────── */
const MILESTONES = [
  { gb: 1,  label: 'Bronze' },
  { gb: 5,  label: 'Silver' },
  { gb: 10, label: 'Gold' },
  { gb: 15, label: 'Platinum' },
  { gb: 25, label: 'Elite' },
];

/* ─── Referrer info type ──────────────────────────────────────────── */
interface ReferrerInfo {
  username: string | null;
  user_id: string;
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function ReferralLanding() {
  const { referral_code } = useParams<{ referral_code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [referrer, setReferrer] = useState<ReferrerInfo | null>(null);
  const [validating, setValidating] = useState(true);
  const [invalid, setInvalid] = useState(false);

  /* ── Resolve referral code on mount ──────────────────────────── */
  useEffect(() => {
    if (!referral_code) { setInvalid(true); setValidating(false); return; }

    const code = referral_code.trim().toUpperCase().slice(0, 20);

    // Persist in session + cookie + localStorage for up to 7 days
    sessionStorage.setItem('ds_ref', code);
    document.cookie = `ds_ref=${code}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
    // Track referral source for post-auth routing
    localStorage.setItem('ds_referral_source', 'landing');
    localStorage.setItem('ds_referral_code', code);
    localStorage.setItem('ds_referral_ts', String(Date.now()));

    supabase
      .rpc('resolve_referral_code', { p_code: code })
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) {
          setInvalid(true);
        } else {
          setReferrer({ username: data[0].username, user_id: data[0].user_id });
          // Self-referral guard for logged-in users
          if (user && user.id === data[0].user_id) {
            setInvalid(true);
          }
        }
        setValidating(false);
      });
  }, [referral_code, user]);

  /* ── Loading ──────────────────────────────────────────────────── */
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, hsl(222 47% 8%), hsl(222 40% 12%))' }}>
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    );
  }

  /* ── Invalid code ─────────────────────────────────────────────── */
  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, hsl(222 47% 8%), hsl(222 40% 12%))' }}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Invalid Invitation</h1>
          <p className="text-slate-400 text-sm mb-6">
            This invitation link is invalid or has expired.
          </p>
          <Button asChild className="bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold">
            <Link to="/">Go to DataSika</Link>
          </Button>
        </div>
      </div>
    );
  }

  const referrerName = referrer?.username ?? 'a friend';
  const code = referral_code!.trim().toUpperCase();

  return (
    <div className="min-h-screen"
      style={{ background: 'linear-gradient(160deg, hsl(222 47% 7%) 0%, hsl(222 40% 11%) 50%, hsl(222 35% 14%) 100%)' }}>

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 backdrop-blur-md"
        style={{ background: 'hsl(222 47% 7% / 0.8)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/">
            <Logo height="h-8" />
          </Link>
          <Link to="/auth" className="text-sm text-slate-300 hover:text-white transition-colors">
            Sign In
          </Link>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <HeroSection referrerName={referrerName} />

      {/* ── HOW IT WORKS ───────────────────────────────────────── */}
      <HowItWorksSection />

      {/* ── REWARD LADDER ──────────────────────────────────────── */}
      <RewardLadderSection />

      {/* ── TRUST SIGNALS ──────────────────────────────────────── */}
      <TrustSection />

      {/* ── REGISTRATION FORM ──────────────────────────────────── */}
      <RegistrationSection referrerName={referrerName} referralCode={code} />

      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-8 px-4 text-center">
        <p className="text-slate-500 text-xs">
          © {new Date().getFullYear()} DataSika. All rights reserved. &nbsp;·&nbsp;
          <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
          &nbsp;·&nbsp;
          <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
        </p>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* HERO SECTION                                                         */
/* ═══════════════════════════════════════════════════════════════════ */
function HeroSection({ referrerName }: { referrerName: string }) {
  const scrollToForm = () => {
    const el = document.getElementById('referral-register-form');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative overflow-hidden py-16 px-4 sm:py-28">
      {/* Animated gradient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% -10%, hsl(45 100% 50% / 0.12), transparent 70%)',
          animation: 'rl-hero-pulse 6s ease-in-out infinite alternate',
        }}
        aria-hidden
      />

      {/* Gold glow blob behind headline */}
      <div
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(ellipse, hsl(45 100% 55%), transparent 65%)' }}
        aria-hidden
      />

      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-yellow-400/20"
            style={{
              width: `${4 + (i % 3) * 3}px`,
              height: `${4 + (i % 3) * 3}px`,
              left: `${10 + i * 11}%`,
              top: `${20 + (i % 4) * 15}%`,
              animation: `rl-float-${i % 3} ${4 + i}s ease-in-out infinite`,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes rl-hero-pulse {
          from { opacity: 0.7; }
          to { opacity: 1; }
        }
        @keyframes rl-float-0 {
          0%, 100% { transform: translateY(0px); opacity: 0.3; }
          50% { transform: translateY(-14px); opacity: 0.6; }
        }
        @keyframes rl-float-1 {
          0%, 100% { transform: translateY(0px); opacity: 0.2; }
          50% { transform: translateY(-20px); opacity: 0.5; }
        }
        @keyframes rl-float-2 {
          0%, 100% { transform: translateY(0px); opacity: 0.25; }
          50% { transform: translateY(-10px); opacity: 0.55; }
        }
        @keyframes rl-shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes rl-btn-pulse {
          0%, 100% { box-shadow: 0 0 0 0 hsl(45 100% 50% / 0.5); }
          50% { box-shadow: 0 0 0 12px hsl(45 100% 50% / 0); }
        }
        .rl-gold-shimmer {
          background: linear-gradient(90deg,
            hsl(45 100% 50%),
            hsl(48 100% 68%),
            hsl(45 100% 50%),
            hsl(38 100% 60%),
            hsl(45 100% 50%)
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: rl-shimmer 3s linear infinite;
        }
        .rl-cta-btn {
          animation: rl-btn-pulse 3s ease-in-out infinite;
        }
        .rl-trust-card:hover {
          transform: translateY(-3px);
          border-color: hsl(45 100% 50% / 0.3);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .rl-tier-row { transition: transform 0.2s ease; }
        .rl-tier-row:hover { transform: translateX(4px); }
      `}</style>

      <div className="relative max-w-2xl mx-auto text-center">
        {/* Season badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-yellow-400/30 bg-yellow-400/10 text-yellow-300 text-xs font-semibold mb-6 tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Season Active
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white leading-tight mb-5">
          Earn{' '}
          <span className="rl-gold-shimmer">25GB</span>
          {' '}Free
        </h1>

        {/* Sub-headline */}
        <p className="text-slate-200 text-base sm:text-lg mb-3 leading-relaxed">
          You've been invited by{' '}
          <span className="text-white font-bold">{referrerName}</span>{' '}
          to earn 25GB in free data rewards.
        </p>
        <p className="text-slate-400 text-sm mb-10 max-w-md mx-auto">
          Create a free account, buy any bundle, and start unlocking rewards instantly.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            onClick={scrollToForm}
            className="rl-cta-btn w-full sm:w-auto h-14 px-10 text-base font-black rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-900 transition-all flex items-center justify-center gap-2"
          >
            Create Free Account
            <ArrowRight className="w-5 h-5" />
          </button>
          <Link
            to="/auth"
            className="text-slate-400 text-sm hover:text-white transition-colors"
          >
            Already have an account? <span className="underline underline-offset-4">Log in</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* HOW IT WORKS                                                         */
/* ═══════════════════════════════════════════════════════════════════ */
const STEPS = [
  {
    icon: Users,
    number: '01',
    title: 'Create your free account',
    desc: 'Sign up in under a minute. No card required.',
  },
  {
    icon: Package,
    number: '02',
    title: 'Buy any data bundle',
    desc: 'MTN, Telecel, or AirtelTigo. Fast delivery.',
  },
  {
    icon: Gift,
    number: '03',
    title: 'Unlock milestone rewards',
    desc: 'Refer friends and climb your way to 25GB in free data.',
  },
];

function HowItWorksSection() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">How You Start Earning</h2>
          <p className="text-slate-400 text-sm">Three simple steps to free data.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="relative rounded-2xl border border-white/10 p-6 flex flex-col gap-4 transition-all duration-200 hover:-translate-y-1 hover:border-yellow-400/20"
              style={{ background: 'hsl(222 40% 11% / 0.9)' }}
            >
              {/* Step number */}
              <span className="text-xs font-black text-yellow-400/70 tracking-widest">{step.number}</span>

              {/* Icon */}
              <div className="w-11 h-11 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                <step.icon className="w-5 h-5 text-yellow-400" />
              </div>

              <div>
                <h3 className="font-bold text-white text-base mb-1.5">{step.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{step.desc}</p>
              </div>

              {/* Connector arrow */}
              {i < STEPS.length - 1 && (
                <div className="hidden sm:block absolute -right-3.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full border border-yellow-400/20 bg-yellow-400/8 flex items-center justify-center">
                  <ChevronRight className="w-4 h-4 text-yellow-400/60" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* REWARD LADDER PREVIEW                                                */
/* ═══════════════════════════════════════════════════════════════════ */
const TIER_COLORS: Record<string, { border: string; text: string; bg: string; glow: string }> = {
  Bronze:   { border: 'hsl(30 60% 50% / 0.5)',  text: 'hsl(30 80% 65%)',  bg: 'hsl(30 60% 50% / 0.08)',  glow: '' },
  Silver:   { border: 'hsl(220 15% 70% / 0.4)', text: 'hsl(220 15% 80%)', bg: 'hsl(220 15% 70% / 0.06)', glow: '' },
  Gold:     { border: 'hsl(45 100% 50% / 0.5)', text: 'hsl(45 100% 60%)', bg: 'hsl(45 100% 50% / 0.08)', glow: '' },
  Platinum: { border: 'hsl(200 60% 70% / 0.5)', text: 'hsl(200 60% 80%)', bg: 'hsl(200 60% 70% / 0.07)', glow: '' },
  Elite:    { border: 'hsl(45 100% 50% / 0.7)', text: 'hsl(45 100% 55%)', bg: 'hsl(45 100% 50% / 0.12)', glow: '0 0 20px hsl(45 100% 50% / 0.25)' },
};

function RewardLadderSection() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">Your Reward Ladder</h2>
          <p className="text-slate-300 text-sm">Unlock bigger rewards as you refer more friends. Up to 25GB total.</p>
        </div>

        <div
          className="rounded-2xl border border-white/10 p-6 sm:p-8 space-y-3"
          style={{ background: 'hsl(222 40% 11% / 0.9)' }}
        >
          {MILESTONES.map((m, i) => {
            const tc = TIER_COLORS[m.label] ?? TIER_COLORS.Gold;
            const isElite = m.label === 'Elite';
            return (
              <div
                key={m.gb}
                className="rl-tier-row flex items-center gap-4 rounded-xl px-4 py-3 border"
                style={{
                  background: tc.bg,
                  borderColor: tc.border,
                  boxShadow: tc.glow || undefined,
                }}
              >
                {/* Node */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black text-sm"
                  style={{ background: tc.bg, border: `2px solid ${tc.border}`, color: tc.text }}
                >
                  {i + 1}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base" style={{ color: tc.text }}>{m.gb}GB</span>
                    <span className="text-xs font-semibold" style={{ color: tc.text, opacity: 0.7 }}>{m.label}</span>
                    {isElite && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 tracking-wider uppercase">Max</span>
                    )}
                  </div>
                </div>

                {/* Icon */}
                <div style={{ color: tc.text, opacity: 0.5 }}>
                  <Gift className="w-4 h-4" />
                </div>
              </div>
            );
          })}

          <p className="text-center text-xs pt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Your progress starts when your referred friend makes their first purchase.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* TRUST SIGNALS                                                        */
/* ═══════════════════════════════════════════════════════════════════ */
const TRUST = [
  { icon: Package, stat: '6,000+', label: 'Bundles Delivered' },
  { icon: Users, stat: '1,000+', label: 'Users Earning Daily' },
  { icon: ShieldCheck, stat: 'Secure Checkout', label: 'Encrypted Payments' },
  { icon: Zap, stat: 'Fast', label: 'Data Delivery' },
];

function TrustSection() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {TRUST.map((t) => (
            <div
              key={t.label}
              className="rl-trust-card text-center rounded-2xl border border-white/10 p-5 cursor-default"
              style={{ background: 'hsl(222 40% 11% / 0.8)' }}
            >
              <div className="w-10 h-10 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mx-auto mb-3">
                <t.icon className="w-5 h-5 text-yellow-400" />
              </div>
              <div className="font-black text-white text-lg leading-none">{t.stat}</div>
              <div className="text-slate-300 text-xs mt-1.5 leading-snug">{t.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* REGISTRATION SECTION                                                 */
/* ═══════════════════════════════════════════════════════════════════ */
function RegistrationSection({ referrerName, referralCode }: { referrerName: string; referralCode: string }) {
  return (
    <section id="referral-register-form" className="py-14 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          {/* Invitation badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-yellow-400/40 bg-yellow-400/12 text-yellow-200 text-sm font-bold mb-5 tracking-wide">
            <Gift className="w-4 h-4 text-yellow-400" />
            Invitation from <span className="text-yellow-300">{referrerName}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
            Create Your Free Account
          </h2>
          <p className="text-slate-300 text-sm">Start earning up to 25GB in free data rewards — Reward Season is active.</p>
        </div>

        <ReferralSignupForm referrerName={referrerName} referralCode={referralCode} />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* REFERRAL SIGNUP FORM                                                 */
/* ═══════════════════════════════════════════════════════════════════ */
function ReferralSignupForm({ referrerName, referralCode }: { referrerName: string; referralCode: string }) {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  const checkUsername = async (value: string) => {
    if (!value || value.length < 3) { setUsernameStatus('idle'); return; }
    try { usernameSchema.parse(value); } catch { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    const { data, error } = await supabase.rpc('check_username_available', { p_username: value });
    if (error) { setUsernameStatus('idle'); return; }
    setUsernameStatus(data ? 'available' : 'taken');
  };

  const handleUsernameChange = (value: string) => {
    const sanitized = value.replace(/[^a-zA-Z0-9_.]/g, '');
    setUsername(sanitized);
    clearTimeout((window as any).__refUsernameTimeout);
    (window as any).__refUsernameTimeout = setTimeout(() => checkUsername(sanitized), 350);
  };

  // Redirect helper with fallback timeout
  const safeRedirect = (path: string) => {
    try {
      navigate(path, { replace: true });
    } catch (e) {
      console.error('[ReferralLanding] navigate failed, using fallback', e);
      window.location.href = path;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) { setError('Full name is required'); return; }
    if (!username.trim()) { setError('Username is required'); return; }

    try { usernameSchema.parse(username); } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Invalid username'); return;
    }

    if (usernameStatus === 'taken') { setError('This username is already taken'); return; }
    if (usernameStatus === 'invalid') { setError('Username can only contain letters, numbers, underscores, and dots'); return; }

    if (!phone.trim()) { setError('Phone number is required'); return; }
    if (!isValidGhanaPhone(phone)) { setError('Please enter a valid Ghana phone number (e.g. 0551234567)'); return; }

    try { emailSchema.parse(email); } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Invalid email'); return;
    }

    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/[a-zA-Z]/.test(password)) { setError('Password must contain at least one letter'); return; }
    if (!/[\d\W_]/.test(password)) { setError('Password must contain at least one number or symbol'); return; }

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service, Privacy Policy, and Disclaimer to continue.');
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await signUp(email, password, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        username: username.trim(),
      });

      if (authError) {
        setLoading(false);
        if (authError.message?.includes('already registered')) {
          setError('This email is already registered. Try signing in instead.');
        } else if (authError.message?.includes('profiles_username_unique')) {
          setError('This username is already taken. Please choose another.');
        } else {
          setError(authError.message || 'Signup failed. Please try again.');
        }
        return;
      }

      // Show success state immediately — prevents blank screen
      setSignupSuccess(true);
      setLoading(false);

      // Post-signup tasks (non-blocking, wrapped in try-catch)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const now = new Date().toISOString();
          // Save legal agreements
          await supabase.from('profiles').update({
            accepted_terms: true, accepted_terms_at: now, accepted_terms_version: 'v1.0',
            accepted_privacy: true, accepted_privacy_at: now, accepted_privacy_version: 'v1.0',
            accepted_disclaimer: true, accepted_disclaimer_at: now, accepted_disclaimer_version: 'v1.0',
          } as any).eq('id', user.id);

          // Attach referral — fire-and-forget
          if (referralCode && user.id) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-register`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({ referee_id: user.id, referral_code: referralCode }),
            }).catch((err) => console.warn('[ReferralLanding] referral-register failed:', err));
          }
        }
      } catch (postErr) {
        console.error('[ReferralLanding] post-signup tasks failed (non-blocking):', postErr);
      }

      // Clear stored referral
      sessionStorage.removeItem('ds_ref');
      document.cookie = 'ds_ref=; path=/; max-age=0';

      toast.success('🎉 Account created! Welcome to DataSika.', {
        description: 'Complete your first data purchase to activate your rewards.',
      });

      // Redirect after a short delay to let auth settle
      setTimeout(() => safeRedirect('/reward-activation'), 800);
    } catch (unexpectedErr) {
      console.error('[ReferralLanding] unexpected signup error:', unexpectedErr);
      setLoading(false);
      setSignupSuccess(true); // Still show success fallback if auth actually succeeded
      setTimeout(() => safeRedirect('/dashboard'), 1500);
    }
  };

  // ── Signup success fallback screen ──
  if (signupSuccess) {
    return (
      <div className="rounded-2xl border border-yellow-400/20 p-8 text-center space-y-4"
        style={{ background: 'hsl(222 40% 11% / 0.9)' }}>
        <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-green-400" />
        </div>
        <h3 className="text-xl font-bold text-white">Account Created Successfully!</h3>
        <p className="text-slate-300 text-sm">Redirecting you…</p>
        <Loader2 className="w-5 h-5 animate-spin text-yellow-400 mx-auto" />
        <Button
          onClick={() => safeRedirect('/reward-activation')}
          className="bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold mt-2"
        >
          Go to Dashboard →
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="on"
      className="rounded-2xl border border-white/10 p-6 space-y-4"
      style={{ background: 'hsl(222 40% 11% / 0.8)', backdropFilter: 'blur(12px)' }}
    >
      {error && (
        <div className="bg-red-500/10 text-red-300 text-sm p-3 rounded-xl flex items-start gap-2 border border-red-500/20">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Full Name */}
      <div>
        <Label htmlFor="rf-name" className="text-sm font-medium text-slate-300">Full Name</Label>
        <Input
          id="rf-name" name="name" autoComplete="name"
          value={fullName} onChange={(e) => setFullName(e.target.value)}
          placeholder="Kwame Asante" maxLength={100}
          className="mt-1.5 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-yellow-400/50"
        />
      </div>

      {/* Username */}
      <div>
        <Label htmlFor="rf-username" className="text-sm font-medium text-slate-300">Username</Label>
        <div className="relative mt-1.5">
          <Input
            id="rf-username" name="username" autoComplete="username"
            value={username} onChange={(e) => handleUsernameChange(e.target.value)}
            placeholder="kwame_asante" maxLength={20}
            className="h-11 pr-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-yellow-400/50"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
            {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <XCircle className="w-4 h-4 text-red-400" />}
          </div>
        </div>
        {usernameStatus === 'taken' && <p className="text-red-400 text-xs mt-1">Username is already taken</p>}
        {usernameStatus === 'invalid' && <p className="text-red-400 text-xs mt-1">Only letters, numbers, underscores, dots. 3–20 chars.</p>}
        {usernameStatus === 'available' && <p className="text-green-400 text-xs mt-1">Username is available!</p>}
      </div>

      {/* Phone */}
      <div>
        <Label htmlFor="rf-phone" className="text-sm font-medium text-slate-300">Phone Number</Label>
        <Input
          id="rf-phone" name="tel" type="tel" autoComplete="tel"
          value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="0551234567" maxLength={10}
          className="mt-1.5 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-yellow-400/50"
        />
      </div>

      {/* Email */}
      <div>
        <Label htmlFor="rf-email" className="text-sm font-medium text-slate-300">Email</Label>
        <Input
          id="rf-email" name="email" type="email" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com" maxLength={255}
          className="mt-1.5 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-yellow-400/50"
        />
      </div>

      {/* Password */}
      <div>
        <Label htmlFor="rf-password" className="text-sm font-medium text-slate-300">Password</Label>
        <div className="relative mt-1.5">
          <Input
            id="rf-password" name="new-password" autoComplete="new-password"
            type={showPassword ? 'text' : 'password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters" maxLength={128}
            className="h-11 pr-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-yellow-400/50"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="mt-2">
          <PasswordStrengthBar password={password} />
        </div>
      </div>

      {/* Invitation badge */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-yellow-400/8 border border-yellow-400/20">
        <Gift className="w-4 h-4 text-yellow-400 shrink-0" />
        <p className="text-yellow-200 text-xs">
          You joined via invitation from <span className="font-bold">{referrerName}</span>.
          Referral code: <span className="font-mono font-bold text-yellow-300">{referralCode}</span>
        </p>
      </div>

      {/* Terms checkbox */}
      <div className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
        agreedToTerms ? 'border-yellow-400/30 bg-yellow-400/5' : 'border-white/10 bg-white/3'
      }`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={agreedToTerms}
          onClick={() => setAgreedToTerms(!agreedToTerms)}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 ${
            agreedToTerms
              ? 'bg-yellow-400 border-yellow-400'
              : 'border-white/20 bg-white/5 hover:border-yellow-400/40'
          }`}
        >
          {agreedToTerms && (
            <svg className="w-3 h-3 text-slate-900" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
            </svg>
          )}
        </button>
        <p className="text-xs text-slate-400 leading-relaxed">
          I agree to the{' '}
          <Link to="/terms" target="_blank" className="text-yellow-400 hover:underline font-medium">Terms of Service</Link>
          {', '}
          <Link to="/privacy" target="_blank" className="text-yellow-400 hover:underline font-medium">Privacy Policy</Link>
          {', and '}
          <Link to="/disclaimer" target="_blank" className="text-yellow-400 hover:underline font-medium">Disclaimer</Link>.
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !agreedToTerms}
        className="rl-cta-btn w-full h-13 py-3 text-sm font-black rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-900 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" />
            Creating account...
          </>
        ) : (
          <>
            Create My Free Account →
          </>
        )}
      </button>

      <p className="text-center text-xs text-slate-400">
        Already have an account?{' '}
        <Link to="/auth" className="text-yellow-400 hover:underline font-medium">Sign in instead</Link>
      </p>
    </form>
  );
}
