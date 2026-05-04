import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Activity, RefreshCw, ShieldAlert, Clock, Zap, Timer, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react';
import { useDeliveryTracker, type DeliverySeverity } from '@/hooks/useDeliveryTracker';

interface OverrideData {
  active: boolean;
  severity: DeliverySeverity;
  message: string;
  expires_at: string | null;
  reason: string;
  set_by: string | null;
  set_at: string | null;
}

const SEVERITY_OPTIONS: { value: DeliverySeverity; label: string; icon: typeof Zap; color: string }[] = [
  { value: 'healthy', label: 'Instant delivery', icon: Zap, color: 'text-emerald-500' },
  { value: 'good', label: 'Within minutes', icon: CheckCircle2, color: 'text-blue-500' },
  { value: 'moderate', label: '1–2 hours', icon: Clock, color: 'text-amber-500' },
  { value: 'slow', label: '2–4 hours', icon: Timer, color: 'text-orange-500' },
  { value: 'delayed', label: 'Delayed 4+ hours', icon: AlertTriangle, color: 'text-red-500' },
];

const DURATION_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '0', label: 'Until manually cleared' },
];

const SEVERITY_MESSAGES: Record<DeliverySeverity, string> = {
  healthy: 'Orders are being delivered instantly right now',
  good: 'Orders are being delivered within minutes',
  moderate: 'Orders are currently taking about 1–2 hours',
  slow: 'Orders may take 2–4 hours due to network delays',
  delayed: 'Deliveries are currently delayed. Orders are still being processed',
};

const AdminDeliveryTrackerControl = () => {
  const { data: trackerData, loading: trackerLoading } = useDeliveryTracker();
  const [override, setOverride] = useState<OverrideData | null>(null);
  const [loadingOverride, setLoadingOverride] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedSeverity, setSelectedSeverity] = useState<DeliverySeverity>('healthy');
  const [duration, setDuration] = useState('60');
  const [reason, setReason] = useState('');

  const fetchOverride = useCallback(async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'delivery_tracker_override')
      .maybeSingle();

    if (data?.value) {
      try {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        // Check if expired
        if (parsed.active && parsed.expires_at && new Date(parsed.expires_at) <= new Date()) {
          // Auto-clear expired override
          await supabase
            .from('site_settings')
            .update({ value: JSON.stringify({ active: false }), updated_at: new Date().toISOString() })
            .eq('key', 'delivery_tracker_override');
          setOverride({ ...parsed, active: false });
        } else {
          setOverride(parsed);
        }
      } catch {
        setOverride(null);
      }
    } else {
      setOverride(null);
    }
    setLoadingOverride(false);
  }, []);

  useEffect(() => { fetchOverride(); }, [fetchOverride]);

  // Refresh every 30s to catch expiry
  useEffect(() => {
    const interval = setInterval(fetchOverride, 30_000);
    return () => clearInterval(interval);
  }, [fetchOverride]);

  const handleActivateOverride = async () => {
    setSaving(true);
    try {
      const now = new Date();
      const durationMins = parseInt(duration);
      const expiresAt = durationMins > 0
        ? new Date(now.getTime() + durationMins * 60_000).toISOString()
        : null;

      const payload: OverrideData = {
        active: true,
        severity: selectedSeverity,
        message: SEVERITY_MESSAGES[selectedSeverity],
        expires_at: expiresAt,
        reason: reason.trim(),
        set_by: (await supabase.auth.getUser()).data.user?.email || 'admin',
        set_at: now.toISOString(),
      };

      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'delivery_tracker_override', value: JSON.stringify(payload), updated_at: now.toISOString() }, { onConflict: 'key' });

      if (error) throw error;
      setOverride(payload);
      toast.success('Override activated');
    } catch {
      toast.error('Failed to activate override');
    }
    setSaving(false);
  };

  const handleClearOverride = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('site_settings')
        .update({ value: JSON.stringify({ active: false }), updated_at: new Date().toISOString() })
        .eq('key', 'delivery_tracker_override');

      if (error) throw error;
      setOverride({ active: false } as OverrideData);
      toast.success('Override cleared — tracker returned to automatic');
    } catch {
      toast.error('Failed to clear override');
    }
    setSaving(false);
  };

  const isOverrideActive = override?.active && (!override.expires_at || new Date(override.expires_at) > new Date());

  const getTimeRemaining = () => {
    if (!override?.expires_at) return 'Until manually cleared';
    const remaining = new Date(override.expires_at).getTime() - Date.now();
    if (remaining <= 0) return 'Expired';
    const mins = Math.ceil(remaining / 60_000);
    if (mins < 60) return `${mins}m remaining`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m remaining`;
  };

  const getSeverityDisplay = (severity: DeliverySeverity) => {
    return SEVERITY_OPTIONS.find(s => s.value === severity);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Delivery Tracker Control
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Monitor automatic tracker status and apply temporary overrides when needed
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchOverride}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Current Automatic Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Current Automatic Status
            </CardTitle>
            <CardDescription>Real-time status from live order data</CardDescription>
          </CardHeader>
          <CardContent>
            {trackerLoading ? (
              <div className="animate-pulse h-16 bg-muted rounded-lg" />
            ) : trackerData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {(() => {
                    const display = getSeverityDisplay(trackerData.severity);
                    if (!display) return null;
                    const Icon = display.icon;
                    return (
                      <>
                        <Icon className={`w-5 h-5 ${display.color}`} />
                        <div>
                          <p className="font-semibold text-sm">{display.label}</p>
                          <p className="text-xs text-muted-foreground">{trackerData.message}</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {trackerData.stats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                    <div className="bg-muted/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Sample Size</p>
                      <p className="text-sm font-bold">{trackerData.stats.recentSampleSize}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Median Delivery</p>
                      <p className="text-sm font-bold">{trackerData.stats.medianMinutes ?? '—'}m</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Active Waiting</p>
                      <p className="text-sm font-bold">{trackerData.stats.activeWaitingCount}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Last Updated</p>
                      <p className="text-sm font-bold">{new Date(trackerData.fetchedAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to load tracker data</p>
            )}
          </CardContent>
        </Card>

        {/* Active Override Banner */}
        {isOverrideActive && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Manual Override Active</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Public tracker is showing: <strong>{getSeverityDisplay(override!.severity)?.label}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {getTimeRemaining()}
                    </p>
                    {override!.reason && (
                      <p className="text-xs text-muted-foreground mt-1 italic">Reason: {override!.reason}</p>
                    )}
                    {override!.set_by && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Set by {override!.set_by} at {override!.set_at ? new Date(override!.set_at).toLocaleString() : '—'}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearOverride}
                  disabled={saving}
                  className="shrink-0"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Clear Override
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Override Controls */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              {isOverrideActive ? 'Update Override' : 'Apply Temporary Override'}
            </CardTitle>
            <CardDescription>
              Temporarily override the public tracker when automatic data is inaccurate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Severity Selection */}
            <div>
              <Label className="text-xs font-semibold mb-2 block">Override Status</Label>
              <RadioGroup value={selectedSeverity} onValueChange={(v) => setSelectedSeverity(v as DeliverySeverity)} className="space-y-2">
                {SEVERITY_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSeverity === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <RadioGroupItem value={opt.value} />
                      <Icon className={`w-4 h-4 ${opt.color}`} />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            {/* Duration */}
            <div>
              <Label className="text-xs font-semibold mb-2 block">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason (optional) */}
            <div>
              <Label className="text-xs font-semibold mb-2 block">Internal Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. tracker inaccurate, supplier delay not reflected yet"
                rows={2}
                className="text-sm"
              />
            </div>

            <Button
              onClick={handleActivateOverride}
              disabled={saving}
              className="w-full"
            >
              {saving ? 'Saving...' : isOverrideActive ? 'Update Override' : 'Activate Override'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDeliveryTrackerControl;
