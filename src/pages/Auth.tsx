import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Eye, EyeOff, Wallet, ClipboardList, Zap, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { generateDeviceFingerprint } from '@/lib/device-fingerprint';
import { z } from 'zod';
import AuthLayout from '@/components/layout/AuthLayout';
import SEOHead from '@/components/seo/SEOHead';
import PasswordStrengthBar, { getStrength } from '@/components/auth/PasswordStrengthBar';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');
const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Only letters, numbers, underscores, and dots allowed');

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'login' | 'signup'>(
    searchParams.get('tab') === 'signup' ? 'signup' : 'login'
  );

  return (
    <AuthLayout
      title={tab === 'login' ? 'Sign In to YieGo' : 'Create Your YieGo Account'}
      subtitle={tab === 'login'
        ? 'Access your wallet, orders, and fast checkout'
        : 'Join thousands of Ghanaians buying data the smart way'}
    >
      <SEOHead
        title={tab === 'login' ? 'Sign In to YieGo' : 'Create Your YieGo Account'}
        description={tab === 'login'
          ? 'Sign in to your YieGo account to manage your wallet, orders, and buy affordable data bundles in Ghana.'
          : 'Create a free YieGo account for fast checkout, wallet top-ups, and order tracking for MTN, Telecel & AirtelTigo data bundles.'}
        path="/auth"
        noIndex
      />

      {/* Premium Tabs */}
      <div className="flex bg-muted/50 dark:bg-muted/30 backdrop-blur-sm rounded-2xl p-1 mb-6 ring-1 ring-border/60" role="tablist">
        {(['login', 'signup'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] ${
              tab === t
                ? 'bg-card text-foreground shadow-[0_2px_10px_-2px_hsl(var(--primary)/0.2)] ring-1 ring-primary/25'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        ))}
      </div>

      {tab === 'login' ? <LoginForm /> : <SignupForm />}

      {/* Benefits */}
      {tab === 'signup' && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: Wallet, label: 'Wallet System' },
            { icon: ClipboardList, label: 'Order History' },
            { icon: Zap, label: 'Fast Checkout' },
          ].map((b) => (
            <div key={b.label} className="text-center p-3 rounded-xl surface-premium">
              <div className="w-7 h-7 mx-auto mb-1.5 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                <b.icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[10px] font-semibold text-foreground/80">{b.label}</span>
            </div>
          ))}
        </div>
      )}
    </AuthLayout>
  );
};

/* ─── AUTH CARD WRAPPER ─── */
const AuthCard = ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => (
  <form
    {...props}
    className="surface-premium rounded-3xl p-6 md:p-7 space-y-5 shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.25)]"
  >
    {children}
  </form>
);

/* ─── PREMIUM INPUT ─── */
const PremiumInput = (props: React.ComponentProps<typeof Input>) => (
  <Input
    {...props}
    className={`h-12 bg-background dark:bg-[hsl(222_30%_8%)] border-border/60 dark:border-border/40 rounded-xl transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/60 ${props.className || ''}`}
  />
);

/* ─── GOLD GRADIENT BUTTON ─── */
const GoldButton = ({ children, loading, ...props }: React.ComponentProps<typeof Button> & { loading?: boolean }) => (
  <Button
    {...props}
    className="w-full h-12 text-sm font-bold rounded-xl transition-all duration-200 active:scale-[0.98] gradient-gold text-primary-foreground shadow-md hover:shadow-lg hover:shadow-primary/20"
  >
    {loading ? (
      <span className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {children}
      </span>
    ) : children}
  </Button>
);

const LoginForm = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) { setError('Please enter your email or username'); return; }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    let emailToUse = trimmedIdentifier;
    let suspendedChecked = false;

    // Check if input is a username (not an email)
    if (!trimmedIdentifier.includes('@')) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      let resolved: { email: string | null; is_suspended: boolean; suspended_reason: string | null } | null = null;

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/resolve-username`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ username: trimmedIdentifier }),
        });

        if (res.status === 429) {
          setLoading(false);
          setError('Too many attempts. Please wait a moment and try again.');
          return;
        }

        const json = await res.json();
        if (!res.ok || json.error) {
          setLoading(false);
          setError('Invalid credentials. Please check and try again.');
          return;
        }

        resolved = json;
      } catch {
        setLoading(false);
        setError('Invalid credentials. Please check and try again.');
        return;
      }

      if (!resolved || !resolved.email) {
        setLoading(false);
        setError('Invalid credentials. Please check and try again.');
        return;
      }

      if (resolved.is_suspended) {
        setLoading(false);
        setError(`Account suspended${resolved.suspended_reason ? ': ' + resolved.suspended_reason : '. Contact support for help.'}`);
        return;
      }
      suspendedChecked = true;

      emailToUse = resolved.email;
    }

    const { error: authError } = await signIn(emailToUse, password);

    if (authError) {
      setLoading(false);
      if (authError.message?.includes('Invalid login credentials')) {
        setError('Wrong password. Please try again.');
      } else {
        setError(authError.message || 'Login failed. Please try again.');
      }
      return;
    }

    if (!suspendedChecked) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('suspended, suspended_reason')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.suspended) {
          await supabase.auth.signOut();
          setLoading(false);
          setError(`Account suspended${profile.suspended_reason ? ': ' + profile.suspended_reason : '. Contact support for help.'}`);
          return;
        }
      }
    }

    setLoading(false);
    toast.success('Welcome back!');

    const lsSource = localStorage.getItem('ds_referral_source');
    const lsCode = localStorage.getItem('ds_referral_code');
    const lsTs = Number(localStorage.getItem('ds_referral_ts') || '0');
    const isRecentReferral = lsSource && lsCode && (Date.now() - lsTs < 24 * 60 * 60 * 1000);

    let profileReferral = false;
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) {
        const { data: prof } = await supabase.from('profiles').select('referred_by, referral_qualified, reward_activated').eq('id', u.id).maybeSingle();
        if (prof?.referred_by && !prof.referral_qualified && !prof.reward_activated) {
          profileReferral = true;
        }
      }
    } catch {}

    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');

    let target: string;
    if (isRecentReferral || profileReferral) {
      target = '/reward-activation';
    } else if (next && next.startsWith('/')) {
      target = next;
    } else {
      const lastPage = localStorage.getItem('yiego_last_dashboard_page');
      target = lastPage && lastPage.startsWith('/dashboard') ? lastPage : '/dashboard';
    }
    navigate(target, { replace: true });
  };

  return (
    <AuthCard onSubmit={handleSubmit} autoComplete="on">
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl flex items-start gap-2 border border-destructive/20">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <div>
        <Label htmlFor="loginIdentifier" className="text-sm font-medium">Email or Username</Label>
        <PremiumInput
          id="loginIdentifier"
          name="username"
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="your@email.com or username"
          className="mt-2"
          maxLength={255}
        />
      </div>
      <div>
        <Label htmlFor="loginPassword" className="text-sm font-medium">Password</Label>
        <div className="relative mt-2">
          <PremiumInput
            id="loginPassword"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="pr-11"
            maxLength={128}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150 p-1"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <GoldButton type="submit" disabled={loading} loading={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </GoldButton>
      <div className="text-center">
        <button
          type="button"
          onClick={async () => {
            const email = identifier.trim();
            if (!email || !email.includes('@')) {
              toast.error('Enter your email above first, then click Forgot Password');
              return;
            }
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            if (error) {
              toast.error(error.message || 'Failed to send reset email');
            } else {
              toast.success('Password reset link sent to your email');
            }
          }}
          className="text-xs text-primary hover:underline font-medium"
        >
          Forgot your password?
        </button>
      </div>
    </AuthCard>
  );
};

const SignupForm = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [referralCode, setReferralCode] = useState(searchParams.get('ref') || '');

  const checkUsername = async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    try {
      usernameSchema.parse(value);
    } catch {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    const { data, error } = await supabase.rpc('check_username_available', { p_username: value });

    if (error) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus(data ? 'available' : 'taken');
  };

  const handleUsernameChange = (value: string) => {
    const sanitized = value.replace(/[^a-zA-Z0-9_.]/g, '');
    setUsername(sanitized);

    clearTimeout((window as any).__usernameTimeout);
    (window as any).__usernameTimeout = setTimeout(() => checkUsername(sanitized), 350);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) { setError('Full name is required'); return; }
    if (!username.trim()) { setError('Username is required'); return; }

    try {
      usernameSchema.parse(username);
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Invalid username');
      return;
    }

    if (usernameStatus === 'taken') { setError('This username is already taken'); return; }
    if (usernameStatus === 'invalid') { setError('Username can only contain letters, numbers, underscores, and dots'); return; }

    if (!phone.trim()) { setError('Phone number is required'); return; }

    try {
      emailSchema.parse(email);
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Invalid email');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      setError('Password must contain at least one letter');
      return;
    }
    if (!/[\d\W_]/.test(password)) {
      setError('Password must contain at least one number or symbol');
      return;
    }

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service, Privacy Policy, and Disclaimer to continue.');
      return;
    }

    setLoading(true);
    const trimmedRefCode = (referralCode || searchParams.get('ref') || '').trim().toUpperCase();
    const { error: authError } = await signUp(email, password, {
      full_name: fullName.trim(),
      phone: phone.trim(),
      username: username.trim(),
      ...(trimmedRefCode ? { loyalty_ref_code: trimmedRefCode } : {}),
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

    // Save legal agreement acceptance to profile + device fingerprint
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const now = new Date().toISOString();
        let deviceHash: string | null = null;
        try { deviceHash = await generateDeviceFingerprint(); } catch {}

        await supabase.from('profiles').update({
          accepted_terms: true, accepted_terms_at: now, accepted_terms_version: 'v1.0',
          accepted_privacy: true, accepted_privacy_at: now, accepted_privacy_version: 'v1.0',
          accepted_disclaimer: true, accepted_disclaimer_at: now, accepted_disclaimer_version: 'v1.0',
          ...(deviceHash ? { device_hash: deviceHash } : {}),
          ...((referralCode || searchParams.get('ref') || '').trim()
            ? { referral_source: localStorage.getItem('ds_referral_source') === 'landing' ? 'landing_page' : 'referral_code' }
            : {}),
        } as any).eq('id', user.id);

        // Process referral code if provided (non-blocking)
        const code = (referralCode || searchParams.get('ref') || '').trim();
        if (code && user.id) {
          try {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-register`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
              body: JSON.stringify({ referee_id: user.id, referral_code: code, device_hash: deviceHash }),
            });
          } catch { /* non-blocking */ }
        }
      }
    } catch {
      // Non-blocking — account is already created
    }

    setLoading(false);
    toast.success('Account created! Welcome to YieGo.');

    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    const refCode = (referralCode || searchParams.get('ref') || '').trim();
    const lsSource = localStorage.getItem('ds_referral_source');
    const lsCode = localStorage.getItem('ds_referral_code');
    const lsTs = Number(localStorage.getItem('ds_referral_ts') || '0');
    const isRecentReferral = lsSource && lsCode && (Date.now() - lsTs < 24 * 60 * 60 * 1000);

    let target: string;
    if (refCode || isRecentReferral) {
      if (refCode && !isRecentReferral) {
        localStorage.setItem('ds_referral_source', 'code');
        localStorage.setItem('ds_referral_code', refCode.toUpperCase());
        localStorage.setItem('ds_referral_ts', String(Date.now()));
      }
      target = '/reward-activation';
    } else if (next && next.startsWith('/')) {
      target = next;
    } else {
      target = '/dashboard';
    }
    navigate(target, { replace: true });
  };

  return (
    <AuthCard onSubmit={handleSubmit} autoComplete="on">
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl flex items-start gap-2 border border-destructive/20">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <div>
        <Label htmlFor="signupName" className="text-sm font-medium">Full Name</Label>
        <PremiumInput id="signupName" name="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Kwame Asante" className="mt-2" maxLength={100} />
      </div>
      <div>
        <Label htmlFor="signupUsername" className="text-sm font-medium">Username</Label>
        <div className="relative mt-2">
          <PremiumInput
            id="signupUsername"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            placeholder="kwame_asante"
            className="pr-11"
            maxLength={20}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
            {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-success" />}
            {usernameStatus === 'taken' && <XCircle className="w-4 h-4 text-destructive" />}
            {usernameStatus === 'invalid' && <XCircle className="w-4 h-4 text-destructive" />}
          </div>
        </div>
        {usernameStatus === 'taken' && (
          <p className="text-destructive text-xs mt-1 font-medium">This username is already taken</p>
        )}
        {usernameStatus === 'invalid' && (
          <p className="text-destructive text-xs mt-1 font-medium">Only letters, numbers, underscores, and dots. 3–20 characters.</p>
        )}
        {usernameStatus === 'available' && (
          <p className="text-success text-xs mt-1 font-medium">Username is available!</p>
        )}
      </div>
      <div>
        <Label htmlFor="signupPhone" className="text-sm font-medium">Phone Number</Label>
        <PremiumInput id="signupPhone" name="tel" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0551234567" className="mt-2" maxLength={10} />
      </div>
      <div>
        <Label htmlFor="signupEmail" className="text-sm font-medium">Email</Label>
        <PremiumInput id="signupEmail" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="mt-2" maxLength={255} />
      </div>
      <div>
        <Label htmlFor="signupPassword" className="text-sm font-medium">Password</Label>
        <div className="relative mt-2">
          <PremiumInput
            id="signupPassword"
            name="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="pr-11"
            maxLength={128}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150 p-1"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="mt-2">
          <PasswordStrengthBar password={password} />
        </div>
      </div>

      {/* Referral Code */}
      <div>
        <Label htmlFor="referralCode" className="text-sm font-medium text-muted-foreground">Referral Code <span className="text-xs">(optional)</span></Label>
        <PremiumInput
          id="referralCode"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value.trim().slice(0, 20))}
          placeholder="Enter code (e.g. ABC12345)"
          className="mt-2 font-mono uppercase"
          maxLength={20}
        />
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
          Got a friend's code? Both of you earn rewards on your first delivered order.
        </p>
      </div>

      {/* Legal Agreement Checkbox */}
      <div className={`flex items-start gap-3 p-4 rounded-xl border transition-colors duration-200 ${agreedToTerms ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-muted/20'}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={agreedToTerms}
          onClick={() => setAgreedToTerms(!agreedToTerms)}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 transition-all duration-150 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            agreedToTerms
              ? 'bg-primary border-primary'
              : 'border-border bg-background hover:border-primary/50'
          }`}
        >
          {agreedToTerms && (
            <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
            </svg>
          )}
        </button>
        <p className="text-xs text-muted-foreground leading-relaxed">
          I agree to the{' '}
          <Link to="/terms" target="_blank" className="text-primary hover:underline font-medium">Terms of Service</Link>
          {', '}
          <Link to="/privacy" target="_blank" className="text-primary hover:underline font-medium">Privacy Policy</Link>
          {', and '}
          <Link to="/disclaimer" target="_blank" className="text-primary hover:underline font-medium">Disclaimer</Link>
          {'.'}
        </p>
      </div>

      <GoldButton type="submit" disabled={loading || !agreedToTerms} loading={loading}>
        {loading ? 'Creating account...' : 'Create Account'}
      </GoldButton>
    </AuthCard>
  );
};

export default Auth;
