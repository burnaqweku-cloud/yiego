import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Lock, Eye, EyeOff, CheckCircle, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import SEOHead from '@/components/seo/SEOHead';
import AuthLayout from '@/components/layout/AuthLayout';
import PasswordStrengthBar from '@/components/auth/PasswordStrengthBar';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      }
      setChecking(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
        setChecking(false);
      }
    });

    checkSession();

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      setError('Password must contain at least one letter');
      return;
    }
    if (!/[\d\W_]/.test(newPassword)) {
      setError('Password must contain at least one number or symbol');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message || 'Failed to update password');
    } else {
      setSuccess(true);
      toast.success('Password updated successfully!');
      setTimeout(() => navigate('/dashboard', { replace: true }), 2500);
    }
  };

  if (checking) {
    return (
      <AuthLayout title="Reset Password" subtitle="Verifying your reset link...">
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Verifying reset link...</p>
        </div>
      </AuthLayout>
    );
  }

  const title = success ? 'Password Updated' : 'Set New Password';
  const subtitle = success ? 'You can now sign in with your new password' : 'Choose a strong password for your account';

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      <SEOHead title="Reset Password | DataSika" description="Set your new DataSika password securely." path="/reset-password" noIndex />

      {success ? (
        <div className="bg-card dark:bg-[hsl(222_35%_11%)] rounded-2xl p-6 md:p-7 card-shadow-elevated border border-border/60 dark:border-border/40 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
          <Link to="/dashboard">
            <Button className="w-full h-12 rounded-xl font-bold gradient-gold text-primary-foreground">Go to Dashboard</Button>
          </Link>
        </div>
      ) : !sessionReady ? (
        <div className="bg-card dark:bg-[hsl(222_35%_11%)] rounded-2xl p-6 md:p-7 card-shadow-elevated border border-border/60 dark:border-border/40 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="font-display font-semibold">Invalid or Expired Link</h3>
          <p className="text-sm text-muted-foreground">
            This password reset link is invalid or has expired. Please request a new one from the login page.
          </p>
          <Link to="/auth">
            <Button variant="outline" className="w-full h-12 rounded-xl font-semibold gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} autoComplete="on" className="bg-card dark:bg-[hsl(222_35%_11%)] rounded-2xl p-6 md:p-7 card-shadow-elevated border border-border/60 dark:border-border/40 space-y-5">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl flex items-start gap-2 border border-destructive/20">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="newPassword" className="text-sm font-medium">New Password</Label>
            <div className="relative mt-2">
              <Input
                id="newPassword"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="h-12 bg-background dark:bg-[hsl(222_30%_8%)] border-border/60 dark:border-border/40 rounded-xl transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 pr-11"
                maxLength={128}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-2">
              <PasswordStrengthBar password={newPassword} />
            </div>
          </div>

          <div>
            <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
            <Input
              id="confirmPassword"
              name="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
              className="mt-2 h-12 bg-background dark:bg-[hsl(222_30%_8%)] border-border/60 dark:border-border/40 rounded-xl transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
              maxLength={128}
            />
          </div>

          {/* Match check */}
          {confirmPassword.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle className={`w-3.5 h-3.5 ${newPassword === confirmPassword ? 'text-success' : 'text-muted-foreground/40'}`} />
              <span className={newPassword === confirmPassword ? 'text-success font-medium' : 'text-muted-foreground'}>
                Passwords match
              </span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-sm font-bold rounded-xl transition-all duration-200 active:scale-[0.98] gradient-gold text-primary-foreground shadow-md hover:shadow-lg hover:shadow-primary/20 gap-2"
            disabled={loading || !newPassword || !confirmPassword}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating...
              </span>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Update Password
              </>
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};

export default ResetPassword;
