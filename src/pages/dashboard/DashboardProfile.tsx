import { useState, useRef, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  User, Save, Loader2, Camera, CheckCircle2, XCircle, Crown, ShieldCheck,
  Wallet, ShoppingBag, Calendar, Phone, Mail, AtSign, Copy, Sparkles, Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

const ELITE_THRESHOLD = 95;

const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Only letters, numbers, underscores, and dots allowed');

const fmtGHS = (n: number) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(n || 0);

const DashboardProfile = () => {
  const { user, profile } = useAuth();
  const { isActiveAgent } = useAgent();
  const { wallet } = useWallet();
  const { orders } = useUserOrders();
  const { account: loyaltyAccount } = useLoyalty();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [avatarUrl, setAvatarUrl] = useState<string | null>((profile as any)?.avatar_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEliteReferrer = successCount >= ELITE_THRESHOLD;
  const totalOrders = orders.length;
  const balance = wallet?.balance_ghs || 0;

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('referral_success_count, created_at')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSuccessCount((data as any).referral_success_count ?? 0);
          setMemberSince((data as any).created_at ?? null);
        }
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
    else { setAvatarUrl(publicUrl); toast.success('Profile picture updated!'); }
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

  const copyUsername = () => {
    if (!profile?.username) return;
    navigator.clipboard.writeText(`@${profile.username}`);
    toast.success('Username copied');
  };

  const memberSinceFmt = memberSince
    ? new Date(memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : '—';

  const initials = (profile?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase();

  return (
    <DashboardLayout>
      <SEOHead title="Profile | YieGo" description="Manage your YieGo profile." path="/dashboard/profile" noIndex />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-6 max-w-4xl mx-auto space-y-5">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:p-6">
          <div aria-hidden className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-4 ring-background shadow-lg">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full gradient-gold flex items-center justify-center text-primary-foreground font-black text-2xl">
                    {initials}
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
                aria-label="Change photo"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} className="hidden" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-display font-black truncate">{profile?.full_name || 'YieGo user'}</h1>
                {isActiveAgent && (
                  <Badge className="bg-primary/15 text-primary border-primary/25 text-[10px] gap-1">
                    <ShieldCheck className="w-3 h-3" /> Agent
                  </Badge>
                )}
                {isEliteReferrer && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black"
                    style={{ background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.4)', color: '#f59e0b' }}>
                    <Crown className="w-3 h-3" /> Elite
                  </span>
                )}
              </div>
              <button onClick={copyUsername} className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <AtSign className="w-3.5 h-3.5" />
                <span className="font-medium">{profile?.username || 'user'}</span>
                {profile?.username && <Copy className="w-3 h-3 opacity-60" />}
              </button>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                <Calendar className="w-3 h-3" /> Member since {memberSinceFmt}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="relative mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl bg-background/60 backdrop-blur border border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <Wallet className="w-3 h-3" /> Wallet
              </div>
              <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums truncate">{fmtGHS(balance)}</div>
            </div>
            <div className="rounded-xl bg-background/60 backdrop-blur border border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <ShoppingBag className="w-3 h-3" /> Orders
              </div>
              <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums">{totalOrders}</div>
            </div>
            <div className="rounded-xl bg-background/60 backdrop-blur border border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <Sparkles className="w-3 h-3" /> Points
              </div>
              <div className="mt-1 text-base sm:text-lg font-display font-bold tabular-nums">{loyaltyPoints ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Personal info */}
          <section className="bg-card rounded-2xl p-5 border border-border/70 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <h2 className="font-display font-bold">Personal Info</h2>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" className="mt-1.5 h-11" maxLength={100} />
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Username</Label>
              <div className="relative mt-1.5">
                <Input value={username} onChange={(e) => handleUsernameChange(e.target.value)} placeholder="your_username" className="h-11 pr-10" maxLength={20} />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
                  {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                  {usernameStatus === 'taken' && <XCircle className="w-4 h-4 text-destructive" />}
                  {usernameStatus === 'invalid' && <XCircle className="w-4 h-4 text-destructive" />}
                </div>
              </div>
              {usernameStatus === 'available' && (
                <p className="text-green-600 text-[11px] mt-1 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Username is available
                </p>
              )}
              {usernameStatus === 'taken' && <p className="text-destructive text-[11px] mt-1 font-medium">Already taken</p>}
              {usernameStatus === 'invalid' && <p className="text-destructive text-[11px] mt-1 font-medium">Letters, numbers, underscores, dots — 3–20 chars.</p>}
            </div>

            <Button onClick={handleSave} disabled={saving || usernameStatus === 'taken' || usernameStatus === 'invalid'} className="w-full btn-press gap-2 h-11 font-bold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </section>

          {/* Account & contact */}
          <section className="bg-card rounded-2xl p-5 border border-border/70 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h2 className="font-display font-bold">Account & Contact</h2>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" /> Phone Number</Label>
              <Input value={profile?.phone || ''} disabled className="mt-1.5 h-11 bg-muted cursor-not-allowed font-mono" />
              <p className="text-[11px] text-muted-foreground mt-1">Locked — used for delivery & verification.</p>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Mail className="w-3 h-3" /> Email</Label>
              <Input value={user?.email || ''} disabled className="mt-1.5 h-11 bg-muted cursor-not-allowed" />
              <p className="text-[11px] text-muted-foreground mt-1">Linked to your account login.</p>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/60 p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight">Refer & Earn</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{successCount} successful referral{successCount === 1 ? '' : 's'} so far.</p>
              </div>
              <a href="/dashboard/referral" className="text-[11px] font-bold text-primary hover:underline shrink-0">Open</a>
            </div>
          </section>
        </div>

        <div aria-hidden className="h-20 md:h-2" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardProfile;
