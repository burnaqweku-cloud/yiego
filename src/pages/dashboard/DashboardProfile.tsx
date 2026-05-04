import { useState, useRef, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAgent } from '@/hooks/useAgent';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { User, Save, Loader2, Camera, CheckCircle2, XCircle, Crown, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

// Elite badge threshold (must match DashboardReferral)
const ELITE_THRESHOLD = 95;

const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Only letters, numbers, underscores, and dots allowed');

const DashboardProfile = () => {
  const { user, profile } = useAuth();
  const { isActiveAgent } = useAgent();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [avatarUrl, setAvatarUrl] = useState<string | null>((profile as any)?.avatar_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEliteReferrer = successCount >= ELITE_THRESHOLD;

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('referral_success_count')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSuccessCount(data.referral_success_count ?? 0);
      });
  }, [user]);

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
    // Don't check if same as current
    if (value.toLowerCase() === (profile?.username || '').toLowerCase()) {
      setUsernameStatus('idle');
      return;
    }
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

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image');
      return;
    }
    // Max 2MB
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('user-avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error('Failed to upload image');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('user-avatars')
      .getPublicUrl(filePath);

    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    // Save to profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl } as any)
      .eq('id', user.id);

    if (updateError) {
      toast.error('Failed to save avatar');
    } else {
      setAvatarUrl(publicUrl);
      toast.success('Profile picture updated!');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (usernameStatus === 'taken') {
      toast.error('Username is already taken');
      return;
    }
    if (usernameStatus === 'invalid') {
      toast.error('Invalid username format');
      return;
    }

    setSaving(true);
    const updates: Record<string, any> = { full_name: fullName.trim() };
    if (username.trim() && username !== profile?.username) {
      updates.username = username.trim();
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    setSaving(false);
    if (error) {
      if (error.message?.includes('username')) {
        toast.error('Username is already taken');
      } else {
        toast.error('Failed to save changes');
      }
    } else {
      toast.success('Profile updated');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-display font-bold">Profile</h1>
          {isEliteReferrer && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
              style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,.18), rgba(251,191,36,.1))',
                border: '1px solid rgba(245,158,11,.4)',
                color: '#fbbf24',
                boxShadow: '0 0 10px rgba(245,158,11,.2)',
              }}
            >
              <Crown className="w-3 h-3" style={{ filter: 'drop-shadow(0 0 3px rgba(251,191,36,.8))' }} />
              Elite Referrer
            </span>
          )}
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 flex items-center justify-center bg-muted">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-semibold truncate">{profile?.full_name || 'User'}</p>
              {isActiveAgent && (
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] gap-1 shrink-0">
                  <ShieldCheck className="w-2.5 h-2.5" /> Agent
                </Badge>
              )}
              {isEliteReferrer && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0"
                  style={{ background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.35)', color: '#f59e0b' }}>
                  <Crown className="w-2.5 h-2.5" />
                  Elite
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">@{profile?.username || 'user'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-5 border border-border card-shadow space-y-4">
          <div>
            <Label className="text-sm font-medium">Full Name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="mt-1.5 h-11"
              maxLength={100}
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Username</Label>
            <div className="relative mt-1.5">
              <Input
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="your_username"
                className="h-11 pr-10"
                maxLength={20}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
                {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                {usernameStatus === 'taken' && <XCircle className="w-4 h-4 text-destructive" />}
                {usernameStatus === 'invalid' && <XCircle className="w-4 h-4 text-destructive" />}
              </div>
            </div>
            {usernameStatus === 'available' && (
              <p className="text-green-600 text-xs mt-1 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Username is available!
              </p>
            )}
            {usernameStatus === 'taken' && (
              <p className="text-destructive text-xs mt-1 font-medium">This username is already taken</p>
            )}
            {usernameStatus === 'invalid' && (
              <p className="text-destructive text-xs mt-1 font-medium">Only letters, numbers, underscores, and dots. 3–20 characters.</p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">Phone Number</Label>
            <Input
              value={profile?.phone || ''}
              disabled
              className="mt-1.5 h-11 bg-muted cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Phone number cannot be changed</p>
          </div>
          <div>
            <Label className="text-sm font-medium">Email</Label>
            <Input
              value={user?.email || ''}
              disabled
              className="mt-1.5 h-11 bg-muted cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Email is linked to your account</p>
          </div>

          <Button onClick={handleSave} disabled={saving || usernameStatus === 'taken' || usernameStatus === 'invalid'} className="w-full btn-press gap-2 h-11 font-bold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardProfile;
