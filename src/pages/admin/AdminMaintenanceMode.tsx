import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle, CheckCircle, Copy, ExternalLink, RefreshCw, Shield,
} from 'lucide-react';

const KEYS = [
  'site_maintenance_enabled',
  'maintenance_message',
  'maintenance_eta',
  'maintenance_bypass_token',
] as const;

type Settings = {
  site_maintenance_enabled: string;
  maintenance_message: string;
  maintenance_eta: string;
  maintenance_bypass_token: string;
};

const upsertSetting = async (key: string, value: string) => {
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error;
};

const generateToken = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const AdminMaintenanceMode = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>({
    site_maintenance_enabled: 'false',
    maintenance_message: "We're improving YieGo for a better experience.",
    maintenance_eta: '',
    maintenance_bypass_token: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatingToken, setGeneratingToken] = useState(false);

  const isEnabled = settings.site_maintenance_enabled === 'true';
  const bypassUrl = settings.maintenance_bypass_token
    ? `${window.location.origin}/?bypass=${settings.maintenance_bypass_token}`
    : '';

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', KEYS as unknown as string[]);
    if (data) {
      const map = Object.fromEntries(data.map((r) => [r.key, r.value])) as Partial<Settings>;
      setSettings((prev) => ({ ...prev, ...map }));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const errors: string[] = [];
    for (const [key, value] of Object.entries(settings)) {
      const err = await upsertSetting(key, value);
      if (err) errors.push(key);
    }
    setSaving(false);
    if (errors.length === 0) {
      toast({ title: 'Settings saved', description: 'Maintenance mode settings updated successfully.' });
    } else {
      toast({ title: 'Error saving settings', description: `Failed: ${errors.join(', ')}`, variant: 'destructive' });
    }
  };

  const handleToggle = (checked: boolean) => {
    setSettings((s) => ({ ...s, site_maintenance_enabled: checked ? 'true' : 'false' }));
  };

  const handleGenerateToken = async () => {
    setGeneratingToken(true);
    const token = generateToken();
    const err = await upsertSetting('maintenance_bypass_token', token);
    if (!err) {
      setSettings((s) => ({ ...s, maintenance_bypass_token: token }));
      toast({ title: 'Bypass token generated', description: 'Old token is now invalid.' });
    } else {
      toast({ title: 'Failed to generate token', variant: 'destructive' });
    }
    setGeneratingToken(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied!` });
    });
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Maintenance Mode</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control site-wide maintenance mode. Admins always retain full access.
          </p>
        </div>

        {/* Status Banner */}
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border font-medium text-sm transition-all duration-300 ${
            isEnabled
              ? 'bg-destructive/10 border-destructive/30 text-destructive'
              : 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
          }`}
        >
          {isEnabled ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 shrink-0" />
          )}
          <span>
            Maintenance mode is currently{' '}
            <strong>{isEnabled ? 'ACTIVE — Site is blocked for public' : 'INACTIVE — Site is running normally'}</strong>
          </span>
        </div>

        {/* Main Toggle Card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">Enable Maintenance Mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, all public routes are blocked. Admins always have access.
              </p>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggle}
              className="data-[state=checked]:bg-destructive"
            />
          </div>
        </div>

        {/* Message & ETA */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Maintenance Page Content</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Maintenance Message</label>
            <Textarea
              rows={3}
              value={settings.maintenance_message}
              onChange={(e) =>
                setSettings((s) => ({ ...s, maintenance_message: e.target.value }))
              }
              placeholder="We're improving YieGo for a better experience."
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Shown to users on the maintenance page.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Expected Return (ETA) <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={settings.maintenance_eta}
              onChange={(e) =>
                setSettings((s) => ({ ...s, maintenance_eta: e.target.value }))
              }
              placeholder="e.g. Today at 3:00 PM GMT"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to hide the ETA from users.
            </p>
          </div>
        </div>

        {/* Bypass Token */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Bypass Token (Trusted Testers)</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Generate a secret URL that grants temporary access (12h) to non-admin testers even when maintenance is ON.
            Regenerating invalidates the old token immediately.
          </p>

          {settings.maintenance_bypass_token ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={bypassUrl}
                  className="text-xs font-mono bg-muted"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(bypassUrl, 'Bypass link')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Token: <code className="font-mono text-primary">{settings.maintenance_bypass_token}</code>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No bypass token set.</p>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateToken}
            disabled={generatingToken}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generatingToken ? 'animate-spin' : ''}`} />
            {settings.maintenance_bypass_token ? 'Regenerate Bypass Link' : 'Generate Bypass Link'}
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.open('/maintenance', '_blank')}
          >
            <ExternalLink className="w-4 h-4" />
            Preview Maintenance Page
          </Button>
        </div>

        {/* Info note */}
        <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Admin Safety:</strong> Admin accounts always bypass maintenance mode and
          can access the admin panel at <code>/admin</code> regardless of this setting.
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminMaintenanceMode;
