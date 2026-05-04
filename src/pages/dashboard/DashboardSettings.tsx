import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Monitor, Info, Lock, Shield, Loader2, Eye, EyeOff, LogOut, Trophy, ChevronRight, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

const VIEWED_KEY = 'yiego_referral_viewed_at';

const DashboardSettings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [rewardDot, setRewardDot] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setReduceMotion(document.documentElement.classList.contains('reduce-motion'));
  }, []);

  // Check for reward notification dot
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('referral_success_count')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const count = data?.referral_success_count ?? 0;
        const lastViewed = localStorage.getItem(VIEWED_KEY);
        setRewardDot(count > 0 && (!lastViewed || count > parseInt(lastViewed, 10)));
      });
  }, [user]);

  const handleToggle = (checked: boolean) => {
    setReduceMotion(checked);
    document.documentElement.classList.toggle('reduce-motion', checked);
    try { localStorage.setItem('yiego_reduce_motion', checked ? '1' : '0'); } catch {}
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);

    if (error) {
      toast.error(error.message || 'Failed to change password');
    } else {
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleLogoutAllDevices = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      toast.error('Failed to sign out of all devices');
    } else {
      toast.success('Signed out of all devices');
      window.location.href = '/auth';
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-lg">
        <h1 className="text-xl font-display font-bold">Settings</h1>

        {/* Display Settings */}
        <div className="bg-card rounded-2xl p-5 border border-border card-shadow space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">Display</h3>
              <p className="text-xs text-muted-foreground">Customize how YieGo looks</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3.5 bg-secondary/50 rounded-xl border border-border">
              <div>
                <p className="text-sm font-medium">Reduce Animations</p>
                <p className="text-xs text-muted-foreground mt-0.5">Improve performance on slower devices</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={reduceMotion}
                  onChange={(e) => handleToggle(e.target.checked)}
                />
                <div className="w-10 h-[22px] bg-muted-foreground/20 peer-checked:bg-primary rounded-full transition-colors duration-200 after:content-[''] after:absolute after:top-[3px] after:left-[3px] peer-checked:after:translate-x-[18px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:duration-200 after:shadow-sm" />
              </label>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-card rounded-2xl p-5 border border-border card-shadow space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">Change Password</h3>
              <p className="text-xs text-muted-foreground">Update your account password</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium">New Password</Label>
              <div className="relative mt-1">
                <Input
                  type={showPasswords ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="h-10 pr-10"
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Confirm New Password</Label>
              <Input
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="mt-1 h-10"
                maxLength={128}
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword || !confirmPassword}
              className="w-full h-10 gap-2 font-semibold"
              variant="outline"
            >
              {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {changingPassword ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </div>

        {/* My Rewards & Referrals */}
        <button
          onClick={() => {
            localStorage.setItem(VIEWED_KEY, String(Date.now()));
            setRewardDot(false);
            navigate('/dashboard/referral');
          }}
          className="w-full bg-card rounded-2xl p-5 border border-border card-shadow flex items-center gap-3 hover:border-primary/30 transition-colors"
        >
          <div
            className="relative w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, hsl(44 96% 52% / 0.15), hsl(44 96% 52% / 0.08))',
              border: '1px solid hsl(44 96% 52% / 0.2)',
            }}
          >
            <Trophy className="w-5 h-5" style={{ color: 'hsl(44 96% 52%)' }} />
            {rewardDot && (
              <div
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: 'hsl(0 80% 55%)', boxShadow: '0 0 6px hsl(0 80% 55% / 0.6)' }}
              />
            )}
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-display font-semibold text-sm">My Rewards & Referrals</h3>
            <p className="text-xs text-muted-foreground">Earn up to 25GB free data</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>

        {/* Connect Telegram */}
        <button
          onClick={() => navigate('/dashboard/connect-telegram')}
          className="w-full bg-card rounded-2xl p-5 border border-border card-shadow flex items-center gap-3 hover:border-primary/30 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-display font-semibold text-sm">Connect Telegram</h3>
            <p className="text-xs text-muted-foreground">Link your account to the YieGo bot</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>

        {/* Security */}
        <div className="bg-card rounded-2xl p-5 border border-border card-shadow space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">Security</h3>
              <p className="text-xs text-muted-foreground">Manage your account security</p>
            </div>
          </div>

          <button
            onClick={handleLogoutAllDevices}
            className="w-full flex items-center justify-between p-3.5 bg-destructive/5 rounded-xl border border-destructive/20 hover:bg-destructive/10 transition-colors"
          >
            <div className="text-left">
              <p className="text-sm font-medium text-destructive">Log Out All Devices</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sign out of all sessions everywhere</p>
            </div>
            <LogOut className="w-4 h-4 text-destructive shrink-0" />
          </button>
        </div>

        {/* Support intentionally hidden */}

        {/* About */}
        <div className="bg-card rounded-2xl p-5 border border-border card-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-info" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">About</h3>
              <p className="text-xs text-muted-foreground">App information</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            YieGo v2.0 — Your trusted platform for affordable data bundles in Ghana.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardSettings;
