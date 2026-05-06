import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { useAgent } from '@/hooks/useAgent';
import { useWallet } from '@/hooks/useWallet';
import { useLoyalty } from '@/hooks/useLoyalty';
import { useUserOrders } from '@/hooks/useUserOrders';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  User, Save, Loader2, Camera, CheckCircle2, XCircle, ShieldCheck,
  Wallet, ShoppingBag, Phone, Mail, AtSign, Copy, Sparkles, Calendar,
  ArrowRight, Lock, LogOut, Receipt, Hash, BadgeCheck, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { getDisplayName, getUsernameDisplay, getInitials } from '@/lib/user-display';
import { formatPrice } from '@/data/bundles';

const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Only letters, numbers, underscores, and dots allowed');

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function memberSinceFmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const DashboardProfile = () => {
  const { user, profile, signOut } = useAuth();
  const { isActiveAgent } = useAgent();
  const { wallet } = useWallet();
  const { orders } = useUserOrders();
  const { account: loyaltyAccount } = useLoyalty();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [avatarUrl, setAvatarUrl] = useState<string | null>((profile as any)?.avatar_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('created_at')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMemberSince((data as any).created_at ?? null);
      });
  }, [user]);

  const checkUsername = async (value: string) => {
    if (!value || value.length < 3) { setUsernameStatus('idle'); return; }
    try { usernameSchema.parse(value); } catch { setUsernameStatus('invalid'); return; }
    if (value.toLowerCase() === (profile?.username || '').toLowerCase()) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const { data, error } = await supabase.rpc('check_username_available', { p_username: value });
    if (error) { setUsernameStatus('idle'); return; }
    setUsernameStatus(data ? 'available' : 'taken');
  };

  const handleUsernameChange = (value: string) => {
    const sanitized = value.replace(/[^a-zA-Z0-9_.]/g, '');
    setUsername(sanitized);
    clearTimeout((window as any).__profileUsernameTimeout);
    (window as any).__profileUsernameTimeout = setTimeout(() => checkUsername(sanitized), 350);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) { toast.error('Please upload a JPG, PNG, or WebP image'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from('user-avatars').upload(filePath, file, { upsert: true });
    if (uploadError) { toast.error('Failed to upload image'); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('user-avatars').getPublicUrl(filePath);
    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl } as any).eq('id', user.id);
    if (updateError) toast.error('Failed to save avatar');
    else { setAvatarUrl(publicUrl); toast.success('Profile picture updated'); }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (usernameStatus === 'taken') { toast.error('Username is already taken'); return; }
    if (usernameStatus === 'invalid') { toast.error('Invalid username format'); return; }
    setSaving(true);
    const updates: Record<string, any> = { full_name: fullName.trim() };
    if (username.trim() && username !== profile?.username) updates.username = username.trim();
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    setSaving(false);
    if (error) toast.error(error.message?.includes('username') ? 'Username is already taken' : 'Failed to save changes');
    else toast.success('Profile updated');
  };

  const copyText = (text: string, msg = 'Copied') => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  // Stats
  const totalOrders = orders.length;
  const totalSpent = useMemo(() =>
    orders.filter(o => (o.status || '').toLowerCase() === 'delivered').reduce((s, o) => s + Number(o.amount_ghs || 0), 0),
    [orders]
  );
  const balance = Number(wallet?.balance_ghs || 0);
  const points = (loyaltyAccount as any)?.points_balance ?? 0;

  const initials = getInitials(profile, user);
  const displayName = getDisplayName(profile, user);
  const usernameDisplay = getUsernameDisplay(profile, user);
  const emailVerified = !!user?.email_confirmed_at;
  const lastSignIn = (user as any)?.last_sign_in_at as string | null;
  const memberId = user?.id ? user.id.slice(0, 8).toUpperCase() : '';

  return (
    <DashboardLayout>
      <SEOHead title="Profile | YieGo" description="Manage your YieGo profile." path="/dashboard/profile" noIndex />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-4xl mx-auto space-y-5">
        {/* ── Header ── */}
        <header>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">My account</span>
          </div>
          <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
            Profile
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-1">Manage your personal details and account.</p>
        </header>

        {/* ── Hero profile card ── */}
        <section className="relative overflow-hidden rounded-3xl glass-card p-5 sm:p-6">
          <div className="absolute -top-24 -right-16 w-64 h-64 rounded-full bg-primary/15 blur-3xl pointer-events-none glow-drift" />
          <div className="absolute -bottom-20 -left-12 w-52 h-52 rounded-full bg-accent/8 blur-3xl pointer-events-none glow-drift-slow" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent pointer-events-none" />
          <div className="noise-overlay" />

          <div className="relative flex items-start gap-4">
            {/* Avatar */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
              <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] p-[2px] shadow-[0_12px_28px_-8px_hsl(var(--primary)/0.55)]">
                <span className="block w-full h-full rounded-full overflow-hidden bg-card">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] text-primary-foreground font-display font-extrabold text-2xl">
                      {initials}
                    </span>
                  )}
                </span>
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.6)] ring-2 ring-card hover:scale-105 transition-transform"
                aria-label="Change photo"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} className="hidden" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-[1.4rem] font-display font-extrabold tracking-[-0.02em] truncate">
                  {displayName === 'there' ? 'Add your name' : displayName}
                </h2>
                {isActiveAgent && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25">
                    <ShieldCheck className="w-2.5 h-2.5" /> Agent
                  </span>
                )}
              </div>
              <button
                onClick={() => usernameDisplay && copyText(`@${usernameDisplay}`, 'Username copied')}
                className="mt-1 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors group"
              >
                <AtSign className="w-3.5 h-3.5" />
                <span className="font-medium">{usernameDisplay || 'set a username'}</span>
                {usernameDisplay && <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
              </button>

              {/* Status pills */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[10.5px] font-medium text-muted-foreground">
                  <Calendar className="w-3 h-3 text-primary" />
                  Member since {memberSinceFmt(memberSince)}
                </span>
                {emailVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck className="w-3 h-3" />
                    Email verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    Email unverified
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <StatTile icon={Wallet} label="Wallet" value={formatPrice(balance)} tone="primary" />
          <StatTile icon={ShoppingBag} label="Orders" value={totalOrders.toLocaleString('en-US')} tone="emerald" />
          <StatTile icon={Receipt} label="Total spent" value={formatPrice(totalSpent)} tone="sky" />
          <StatTile icon={Sparkles} label="Loyalty pts" value={Number(points).toLocaleString('en-US')} tone="amber" />
        </div>

        {/* ── Personal info + Account details ── */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Personal info */}
          <section className="rounded-3xl glass-card p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
                <User className="w-4 h-4" strokeWidth={2} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">Personal info</span>
                </div>
                <p className="text-[11px] text-muted-foreground">What people see when you check out</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Full name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="h-11 rounded-xl bg-muted/30 border-border/60 focus:bg-background"
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Username</Label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground/70 pointer-events-none">@</span>
                <Input
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="your_username"
                  className="h-11 rounded-xl pl-7 pr-10 bg-muted/30 border-border/60 focus:bg-background"
                  maxLength={20}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
                  {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <XCircle className="w-4 h-4 text-destructive" />}
                </div>
              </div>
              {usernameStatus === 'available' && (
                <p className="text-[10.5px] text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Available
                </p>
              )}
              {usernameStatus === 'taken' && <p className="text-[10.5px] text-destructive font-medium">Already taken</p>}
              {usernameStatus === 'invalid' && (
                <p className="text-[10.5px] text-destructive font-medium">Letters, numbers, underscores, dots — 3–20 chars.</p>
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || usernameStatus === 'taken' || usernameStatus === 'invalid'}
              className="w-full h-11 rounded-full font-bold gap-2 shadow-[0_10px_24px_-10px_hsl(var(--primary)/0.55)] hover:-translate-y-0.5 transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </section>

          {/* Account details */}
          <section className="rounded-3xl glass-card p-5 sm:p-6 space-y-3">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">Account & contact</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Read-only details linked to your account</p>
              </div>
            </div>

            <DetailRow icon={Phone} label="Phone" value={profile?.phone || '—'} mono note="Used for delivery & verification" />
            <DetailRow
              icon={Mail}
              label="Email"
              value={user?.email || '—'}
              note={emailVerified ? 'Verified' : 'Not yet verified'}
              noteTone={emailVerified ? 'emerald' : 'amber'}
            />
            <DetailRow
              icon={Hash}
              label="Member ID"
              value={memberId}
              mono
              copyable
              onCopy={() => copyText(memberId, 'Member ID copied')}
            />
            <DetailRow
              icon={Clock}
              label="Last sign-in"
              value={relativeTime(lastSignIn)}
              note={lastSignIn ? new Date(lastSignIn).toLocaleString('en-GB') : undefined}
            />
          </section>
        </div>

        {/* ── Quick actions ── */}
        <section className="grid sm:grid-cols-3 gap-2.5 sm:gap-3">
          <ActionCard
            to="/dashboard/settings"
            icon={Lock}
            title="Change password"
            desc="Update your account password"
          />
          <ActionCard
            to="/dashboard/transactions"
            icon={Receipt}
            title="Transaction history"
            desc="Wallet & order activity"
          />
          <ActionCard
            onClick={handleSignOut}
            icon={LogOut}
            title="Sign out"
            desc="End this session"
            danger
          />
        </section>

        <div aria-hidden className="h-2" />
      </div>
    </DashboardLayout>
  );
};

const StatTile = ({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: 'primary' | 'emerald' | 'sky' | 'amber';
}) => {
  const tones: Record<typeof tone, string> = {
    primary: 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-primary/25',
    emerald: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 ring-emerald-500/25',
    sky: 'bg-gradient-to-br from-sky-500/20 to-sky-500/5 text-sky-500 ring-sky-500/25',
    amber: 'bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-500 ring-amber-500/25',
  };
  return (
    <div className="relative overflow-hidden rounded-2xl glass-card p-3.5 group hover:-translate-y-0.5 transition-transform duration-300">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className={`w-9 h-9 rounded-xl ring-1 ${tones[tone]} flex items-center justify-center shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)] mb-2.5`}>
        <Icon className="w-4 h-4" strokeWidth={2} />
      </div>
      <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground/70 leading-tight">{label}</p>
      <p className="text-[15px] font-display font-extrabold tabular leading-tight mt-1 truncate">{value}</p>
    </div>
  );
};

const DetailRow = ({
  icon: Icon,
  label,
  value,
  note,
  noteTone = 'default',
  mono,
  copyable,
  onCopy,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  note?: string;
  noteTone?: 'default' | 'emerald' | 'amber';
  mono?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
}) => {
  const noteColor = noteTone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : noteTone === 'amber' ? 'text-amber-600 dark:text-amber-400'
    : 'text-muted-foreground/70';
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-muted/30 border border-border/50">
      <div className="w-8 h-8 rounded-lg bg-card/60 ring-1 ring-border/60 text-muted-foreground flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] uppercase tracking-[0.14em] font-bold text-muted-foreground/70 leading-tight">{label}</p>
        <p className={`text-[12.5px] font-semibold leading-tight mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
        {note && <p className={`text-[10px] leading-tight mt-0.5 ${noteColor}`}>{note}</p>}
      </div>
      {copyable && (
        <button
          onClick={onCopy}
          className="w-8 h-8 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors flex items-center justify-center shrink-0"
          aria-label={`Copy ${label}`}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

const ActionCard = ({
  to,
  onClick,
  icon: Icon,
  title,
  desc,
  danger = false,
}: {
  to?: string;
  onClick?: () => void;
  icon: typeof Lock;
  title: string;
  desc: string;
  danger?: boolean;
}) => {
  const inner = (
    <div
      className={`group relative overflow-hidden rounded-2xl glass-card p-4 transition-all duration-300 hover:-translate-y-0.5 ${
        danger ? 'hover:border-destructive/35 hover:shadow-[0_18px_40px_-18px_hsl(var(--destructive)/0.3)]'
               : 'hover:border-primary/35 hover:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.3)]'
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${danger ? 'via-destructive/40' : 'via-primary/40'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          danger ? 'bg-destructive/10 ring-1 ring-destructive/20 text-destructive'
                 : 'bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/25 text-primary'
        } group-hover:scale-105 transition-transform`}>
          <Icon className="w-4 h-4" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-bold leading-tight tracking-tight ${danger ? 'text-destructive' : ''}`}>{title}</p>
          <p className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">{desc}</p>
        </div>
        <ArrowRight className={`w-3.5 h-3.5 ${danger ? 'text-destructive/40 group-hover:text-destructive' : 'text-muted-foreground/40 group-hover:text-primary'} group-hover:translate-x-0.5 transition-all shrink-0`} />
      </div>
    </div>
  );
  if (to) return <Link to={to} className="block">{inner}</Link>;
  return <button onClick={onClick} className="block w-full text-left">{inner}</button>;
};

export default DashboardProfile;
