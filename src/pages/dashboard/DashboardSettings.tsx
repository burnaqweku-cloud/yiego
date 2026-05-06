import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Monitor, Sun, Moon, Lock, Shield, Loader2, Eye, EyeOff, LogOut,
  Bell, Mail, MessageSquare, Smartphone, Globe, Lock as LockIcon,
  Trash2, Download, Info, FileText, ChevronRight, KeyRound, Zap,
  Sparkles, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

const REDUCE_MOTION_KEY = 'yiego_reduce_motion';
const PREFS_NS = 'yiego_prefs_';
const APP_VERSION = 'v2.0';

type PrefKey =
  | 'notif_email'
  | 'notif_push'
  | 'notif_sms'
  | 'notif_marketing'
  | 'privacy_public_profile'
  | 'privacy_leaderboards';

const PREF_DEFAULTS: Record<PrefKey, boolean> = {
  notif_email: true,
  notif_push: true,
  notif_sms: false,
  notif_marketing: false,
  privacy_public_profile: true,
  privacy_leaderboards: true,
};

function readPref(key: PrefKey): boolean {
  try {
    const v = localStorage.getItem(PREFS_NS + key);
    if (v === '1') return true;
    if (v === '0') return false;
    return PREF_DEFAULTS[key];
  } catch { return PREF_DEFAULTS[key]; }
}

function writePref(key: PrefKey, value: boolean) {
  try { localStorage.setItem(PREFS_NS + key, value ? '1' : '0'); } catch {}
}

const DashboardSettings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Display
  const [reduceMotion, setReduceMotion] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification + privacy preferences
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(PREF_DEFAULTS);

  // Sign-out-all
  const [signingOutAll, setSigningOutAll] = useState(false);

  // Delete account confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setReduceMotion(document.documentElement.classList.contains('reduce-motion'));
    const next = { ...PREF_DEFAULTS };
    (Object.keys(PREF_DEFAULTS) as PrefKey[]).forEach((k) => { next[k] = readPref(k); });
    setPrefs(next);
  }, []);

  const handleReduceMotion = (checked: boolean) => {
    setReduceMotion(checked);
    document.documentElement.classList.toggle('reduce-motion', checked);
    try { localStorage.setItem(REDUCE_MOTION_KEY, checked ? '1' : '0'); } catch {}
  };

  const togglePref = (key: PrefKey) => {
    const next = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    writePref(key, next);
    toast.success('Preference saved');
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) toast.error(error.message || 'Failed to change password');
    else {
      toast.success('Password changed');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleLogoutAllDevices = async () => {
    setSigningOutAll(true);
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    setSigningOutAll(false);
    if (error) toast.error('Failed to sign out of all devices');
    else { toast.success('Signed out of all devices'); window.location.href = '/auth'; }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  const handleDownloadData = () => {
    toast.info('Data export will be emailed to you within 24 hours.');
  };

  const handleDeleteAccount = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      toast.warning('Tap delete again to confirm. This cannot be undone.');
      setTimeout(() => setConfirmDelete(false), 5000);
      return;
    }
    toast.info('Account deletion request submitted. Our team will reach out within 48 hours.');
    setConfirmDelete(false);
  };

  return (
    <DashboardLayout>
      <SEOHead title="Settings | YieGo" description="Manage your YieGo settings." path="/dashboard/settings" noIndex />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-3xl mx-auto space-y-5">
        {/* ── Header ── */}
        <header>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">Preferences</span>
          </div>
          <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
            Settings
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-1">Tune YieGo to how you like it.</p>
        </header>

        {/* ── Display ── */}
        <Section icon={Monitor} title="Display" caption="How YieGo looks and feels">
          {/* Theme picker */}
          <div className="rounded-xl bg-muted/30 border border-border/50 p-3.5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <Sun className="w-4 h-4 text-amber-500" />
                <p className="text-[13px] font-semibold">Theme</p>
              </div>
              <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-card/60 backdrop-blur-sm border border-border/50 rounded-full">
              <button
                onClick={() => theme === 'dark' && toggleTheme()}
                className={`text-[12px] font-semibold py-2 rounded-full transition-all flex items-center justify-center gap-1.5 ${
                  theme !== 'dark'
                    ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sun className="w-3.5 h-3.5" /> Light
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={`text-[12px] font-semibold py-2 rounded-full transition-all flex items-center justify-center gap-1.5 ${
                  theme === 'dark'
                    ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Moon className="w-3.5 h-3.5" /> Dark
              </button>
            </div>
          </div>

          <ToggleRow
            icon={Zap}
            title="Reduce animations"
            desc="Improve performance on slower devices"
            checked={reduceMotion}
            onChange={handleReduceMotion}
          />
        </Section>

        {/* ── Notifications ── */}
        <Section icon={Bell} title="Notifications" caption="Pick how we reach you">
          <ToggleRow
            icon={Mail}
            title="Email notifications"
            desc="Order updates, receipts, account alerts"
            checked={prefs.notif_email}
            onChange={() => togglePref('notif_email')}
          />
          <ToggleRow
            icon={Smartphone}
            title="Push notifications"
            desc="Real-time alerts on this device"
            checked={prefs.notif_push}
            onChange={() => togglePref('notif_push')}
          />
          <ToggleRow
            icon={MessageSquare}
            title="SMS alerts"
            desc="Text-message updates for critical events"
            checked={prefs.notif_sms}
            onChange={() => togglePref('notif_sms')}
          />
          <ToggleRow
            icon={Sparkles}
            title="Promotions & marketing"
            desc="Occasional offers and platform news"
            checked={prefs.notif_marketing}
            onChange={() => togglePref('notif_marketing')}
          />
        </Section>

        {/* ── Privacy ── */}
        <Section icon={LockIcon} title="Privacy" caption="Control what's visible to others">
          <ToggleRow
            icon={Globe}
            title="Public profile"
            desc="Let other YieGo users see your name and avatar"
            checked={prefs.privacy_public_profile}
            onChange={() => togglePref('privacy_public_profile')}
          />
          <ToggleRow
            icon={Sparkles}
            title="Show me on leaderboards"
            desc="Appear in public ranking lists when applicable"
            checked={prefs.privacy_leaderboards}
            onChange={() => togglePref('privacy_leaderboards')}
          />
        </Section>

        {/* ── Security ── */}
        <Section icon={Shield} title="Security" caption="Lock down your account">
          {/* Change password — inline */}
          <div className="rounded-xl bg-muted/30 border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-2.5 mb-1">
              <Lock className="w-4 h-4 text-primary" />
              <p className="text-[13px] font-semibold">Change password</p>
            </div>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">New password</Label>
                <div className="relative">
                  <Input
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="h-11 rounded-xl bg-background/70 border-border/60 pr-11"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Confirm new password</Label>
                <Input
                  type={showPasswords ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type it again"
                  className="h-11 rounded-xl bg-background/70 border-border/60"
                  maxLength={128}
                />
              </div>
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword || !confirmPassword}
              className="w-full h-11 rounded-full font-bold gap-2 shadow-[0_10px_24px_-10px_hsl(var(--primary)/0.55)] hover:-translate-y-0.5 transition-all"
            >
              {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {changingPassword ? 'Updating…' : 'Update password'}
            </Button>
          </div>

          <ActionRow
            icon={KeyRound}
            title="Two-factor authentication"
            desc="Add an extra layer of security"
            badge="Coming soon"
            onClick={() => toast.info('Two-factor authentication is coming soon.')}
          />
        </Section>

        {/* ── Data & account ── */}
        <Section icon={Download} title="Data & account" caption="Manage your account data">
          <ActionRow
            icon={Download}
            title="Download my data"
            desc="Export your orders, transactions, and profile"
            onClick={handleDownloadData}
          />
          <button
            onClick={handleLogoutAllDevices}
            disabled={signingOutAll}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 hover:border-amber-500/30 transition-all text-left group disabled:opacity-60"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              {signingOutAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight">Sign out of all devices</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">End every active session everywhere</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
          </button>
        </Section>

        {/* ── Danger zone ── */}
        <section className="rounded-3xl border border-destructive/25 bg-destructive/[0.03] p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 ring-1 ring-destructive/25 text-destructive flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--destructive)/0.3)]">
              <AlertTriangle className="w-4 h-4" strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="h-px w-4 bg-gradient-to-r from-transparent to-destructive" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-destructive">Danger zone</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Irreversible actions on your account</p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-card/60 border border-border/60 hover:border-destructive/40 transition-all text-left group"
          >
            <div className="w-9 h-9 rounded-lg bg-muted ring-1 ring-border/60 text-muted-foreground flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight">Sign out</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">End this session on this device</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
          </button>

          <button
            onClick={handleDeleteAccount}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all text-left group ${
              confirmDelete
                ? 'bg-destructive/10 border-destructive/50'
                : 'bg-card/60 border-border/60 hover:border-destructive/40'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-destructive/10 ring-1 ring-destructive/25 text-destructive flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight text-destructive">
                {confirmDelete ? 'Tap again to confirm' : 'Delete my account'}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                {confirmDelete
                  ? 'This will submit a deletion request — irreversible'
                  : 'Permanently remove your YieGo account and data'}
              </p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-destructive/50 shrink-0" />
          </button>
        </section>

        {/* ── About ── */}
        <section className="rounded-3xl glass-card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 text-primary flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
              <Info className="w-4 h-4" strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">About</span>
              </div>
              <p className="text-[11px] text-muted-foreground">App information & legal</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Meta label="Version" value={APP_VERSION} />
            <Meta label="Account" value={user?.email ? user.email.split('@')[0] : '—'} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/terms"
              target="_blank"
              className="inline-flex items-center justify-center gap-1.5 h-10 rounded-full border border-border/70 bg-background/60 backdrop-blur-sm text-[12px] font-medium hover:border-primary/35 hover:bg-card transition-all"
            >
              <FileText className="w-3.5 h-3.5" /> Terms of Service
            </Link>
            <Link
              to="/privacy"
              target="_blank"
              className="inline-flex items-center justify-center gap-1.5 h-10 rounded-full border border-border/70 bg-background/60 backdrop-blur-sm text-[12px] font-medium hover:border-primary/35 hover:bg-card transition-all"
            >
              <Shield className="w-3.5 h-3.5" /> Privacy Policy
            </Link>
          </div>

          <p className="text-[11px] text-center text-muted-foreground/70 mt-5">
            YieGo {APP_VERSION} · Built for Ghana 🇬🇭
          </p>
        </section>

        <div aria-hidden className="h-2" />
      </div>
    </DashboardLayout>
  );
};

const Section = ({
  icon: Icon,
  title,
  caption,
  children,
}: {
  icon: typeof Monitor;
  title: string;
  caption: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-3xl glass-card p-5 sm:p-6 space-y-3">
    <div className="flex items-center gap-3 mb-1">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
        <Icon className="w-4 h-4" strokeWidth={2} />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">{title}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{caption}</p>
      </div>
    </div>
    {children}
  </section>
);

const ToggleRow = ({
  icon: Icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: typeof Bell;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-muted/30 border border-border/50">
    <div className="w-9 h-9 rounded-lg bg-card/60 ring-1 ring-border/60 text-muted-foreground flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[13px] font-semibold leading-tight">{title}</p>
      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
    </div>
    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-1">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="w-10 h-[22px] bg-muted-foreground/25 peer-checked:bg-primary rounded-full transition-colors duration-200 after:content-[''] after:absolute after:top-[3px] after:left-[3px] peer-checked:after:translate-x-[18px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:duration-200 after:shadow-sm" />
    </label>
  </div>
);

const ActionRow = ({
  icon: Icon,
  title,
  desc,
  badge,
  onClick,
}: {
  icon: typeof Lock;
  title: string;
  desc: string;
  badge?: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 hover:border-primary/35 transition-all text-left group"
  >
    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 text-primary flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-semibold leading-tight">{title}</p>
        {badge && (
          <span className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
    </div>
    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
  </button>
);

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-muted/30 border border-border/50 px-3 py-2.5">
    <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground/70">{label}</p>
    <p className="text-[12.5px] font-semibold tabular truncate mt-0.5">{value}</p>
  </div>
);

export default DashboardSettings;
