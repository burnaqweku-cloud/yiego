import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  CheckCircle2, Clock, AlertTriangle, Shield, Play, Pause,
  RotateCcw, ChevronRight, Settings, Package, Phone,
  TrendingUp, Activity, Timer, Calendar, Info, X, ExternalLink, Loader2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────
interface CheckpointSettings {
  id: string;
  enabled: boolean;
  test_network: string;
  test_phone: string;
  test_bundle_id: string | null;
  test_bundle_name: string | null;
  min_gap_hours: number;
  daily_max: number;
  active_hours_start: number;
  active_hours_end: number;
}

interface DeliveryCheckpoint {
  id: string;
  created_at: string;
  confirmed_at: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'PAUSED' | 'LIMIT_REACHED';
  test_phone: string;
  network: string;
  bundle_id: string | null;
  bundle_name: string | null;
  supplier_order_id: string | null;
  internal_order_id: string | null;
  created_by_admin_id: string;
  confirmed_by_admin_id: string | null;
  orders_delivered_count: number;
  notes: string | null;
}

interface MtnBundle {
  id: string;
  network: string;
  bundle_size_gb: number;
  price_ghs: number;
  active: boolean;
}

interface TodaySummary {
  totalMtnPaid: number;
  totalMtnDelivered: number;
  totalMtnProcessing: number;
  deliveredByCheckpoints: number;
  avgConfirmMinutes: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const formatTime = (iso: string) => format(new Date(iso), 'dd MMM yyyy, HH:mm');

// ── Main Component ─────────────────────────────────────────────────────────
const AdminDeliveryCheckpoints = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { log } = useAuditLog();
  const navigate = useNavigate();

  // State
  const [settings, setSettings] = useState<CheckpointSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<CheckpointSettings | null>(null);
  const [checkpoints, setCheckpoints] = useState<DeliveryCheckpoint[]>([]);
  const [mtnBundles, setMtnBundles] = useState<MtnBundle[]>([]);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [confirmNote, setConfirmNote] = useState('');
  const [notReceivedNote, setNotReceivedNote] = useState('');
  const [startingCheckpoint, setStartingCheckpoint] = useState(false);
  const [confirmingCheckpoint, setConfirmingCheckpoint] = useState(false);
  const [resultsModal, setResultsModal] = useState<{ count: number; coveredUntil: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, authLoading, navigate]);

  // ── Data fetch ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [settingsRes, checkpointsRes, bundlesRes] = await Promise.all([
      supabase.from('checkpoint_settings' as any).select('*').limit(1).single(),
      supabase
        .from('delivery_checkpoints' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('products')
        .select('id, network, bundle_size_gb, price_ghs, active')
        .eq('network', 'MTN')
        .eq('active', true)
        .order('bundle_size_gb'),
    ]);

    if (settingsRes.data) {
      setSettings(settingsRes.data as unknown as CheckpointSettings);
      setSettingsDraft(settingsRes.data as unknown as CheckpointSettings);
    }
    if (checkpointsRes.data) {
      setCheckpoints(checkpointsRes.data as unknown as DeliveryCheckpoint[]);
    }
    if (bundlesRes.data) {
      setMtnBundles(bundlesRes.data as unknown as MtnBundle[]);
    }

    // Today summary
    await fetchTodaySummary();
    setLoading(false);
  }, []);

  const fetchTodaySummary = useCallback(async () => {
    const start = todayStart();

    const [mtnOrdersRes, checkpointsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('status, payment_status')
        .eq('network', 'MTN')
        .gte('created_at', start)
        .eq('is_checkpoint', false),
      supabase
        .from('delivery_checkpoints' as any)
        .select('orders_delivered_count, created_at, confirmed_at')
        .gte('created_at', start)
        .eq('status', 'CONFIRMED'),
    ]);

    const mtnOrders = (mtnOrdersRes.data || []) as { status: string; payment_status: string | null }[];
    const todayConfirmed = ((checkpointsRes.data as unknown) || []) as { orders_delivered_count: number; created_at: string; confirmed_at: string | null }[];

    const paid = mtnOrders.filter(o => o.payment_status === 'paid' || o.status === 'Delivered' || o.status === 'Processing');
    const delivered = mtnOrders.filter(o => o.status === 'Delivered');
    const processing = mtnOrders.filter(o => o.status === 'Processing');
    const checkpointDelivered = todayConfirmed.reduce((sum, c) => sum + (c.orders_delivered_count || 0), 0);

    let avgMinutes: number | null = null;
    if (todayConfirmed.length > 0) {
      const diffs = todayConfirmed
        .filter(c => c.confirmed_at)
        .map(c => (new Date(c.confirmed_at!).getTime() - new Date(c.created_at).getTime()) / 60000);
      if (diffs.length > 0) avgMinutes = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    }

    setTodaySummary({
      totalMtnPaid: paid.length,
      totalMtnDelivered: delivered.length,
      totalMtnProcessing: processing.length,
      deliveredByCheckpoints: checkpointDelivered,
      avgConfirmMinutes: avgMinutes,
    });
  }, []);

  useEffect(() => {
    if (user && isAdmin) fetchAll();
  }, [user, isAdmin, fetchAll]);

  // ── Derived state ───────────────────────────────────────────────────────
  const pendingCheckpoint = checkpoints.find(c => c.status === 'PENDING') || null;

  const canStart = settings?.enabled && !pendingCheckpoint;

  const systemStatus = (() => {
    if (!settings?.enabled) return { label: 'Paused', color: 'text-muted-foreground', bg: 'bg-muted', icon: Pause };
    if (pendingCheckpoint) return { label: 'Waiting Confirmation', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Timer };
    return { label: 'Active', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: CheckCircle2 };
  })();

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleStartCheckpoint = async () => {
    if (!settings || !canStart || !user) return;
    if (!settings.test_phone) {
      toast.error('Please configure a test phone number in Checkpoint Settings first.');
      setShowSettings(true);
      return;
    }

    setStartingCheckpoint(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/checkpoint-start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            test_phone: settings.test_phone,
            test_bundle_id: settings.test_bundle_id,
            test_bundle_name: settings.test_bundle_name || '1GB',
            network: 'MTN',
          }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to start checkpoint');
      }

      toast.success(
        `Checkpoint started. ${result.sent_to_supplier} orders sent to supplier, ${result.failed} failed. Monitor test phone for bundle.`
      );
      await fetchAll();
    } catch (err: any) {
      toast.error(`Failed to start checkpoint: ${err.message}`);
    } finally {
      setStartingCheckpoint(false);
    }
  };

  const handleConfirmReceived = async () => {
    if (!pendingCheckpoint || !user) return;
    setConfirmingCheckpoint(true);
    try {
      const confirmedAt = new Date().toISOString();

      // Bulk mark eligible MTN processing orders as Delivered (normal orders)
      const [normalBulkResult, agentBulkResult] = await Promise.all([
        supabase
          .from('orders')
          .update({ status: 'Delivered', delivery_note: `Delivered via checkpoint ${pendingCheckpoint.id}` } as any)
          .eq('network', 'MTN')
          .eq('status', 'Processing')
          .eq('payment_status', 'paid')
          .eq('is_checkpoint', false)
          .lte('created_at', pendingCheckpoint.created_at)
          .select('id'),
        // Also update agent_store MTN orders in Processing (agent orders confirmed via same checkpoint)
        supabase
          .from('agent_orders')
          .update({ status: 'Delivered' } as any)
          .eq('network', 'MTN')
          .eq('status', 'Processing')
          .eq('payment_status', 'paid')
          .lte('created_at', pendingCheckpoint.created_at)
          .select('id'),
      ]);

      if (normalBulkResult.error) throw normalBulkResult.error;
      // Agent orders bulk update is best-effort; log but don't throw
      if (agentBulkResult.error) {
        console.error('[checkpoint] Agent orders bulk update error:', agentBulkResult.error);
      }

      const normalDeliveredCount = normalBulkResult.data?.length || 0;
      const agentDeliveredCount = agentBulkResult.data?.length || 0;
      const deliveredCount = normalDeliveredCount + agentDeliveredCount;

      console.log(`[checkpoint] Confirmed: normal=${normalDeliveredCount}, agent=${agentDeliveredCount}, total=${deliveredCount}`);

      // Confirm the checkpoint
      const { error: cpError } = await supabase
        .from('delivery_checkpoints' as any)
        .update({
          status: 'CONFIRMED',
          confirmed_at: confirmedAt,
          confirmed_by_admin_id: user.id,
          orders_delivered_count: deliveredCount,
          notes: confirmNote || null,
        })
        .eq('id', pendingCheckpoint.id);

      if (cpError) throw cpError;

      // Also update the linked checkpoint order
      if (pendingCheckpoint.internal_order_id) {
        await supabase
          .from('orders')
          .update({ status: 'Delivered' } as any)
          .eq('order_id', pendingCheckpoint.internal_order_id);
      }

      await log({
        action: 'checkpoint.confirmed',
        entity_type: 'delivery_checkpoint',
        entity_id: pendingCheckpoint.id,
        changes: { orders_delivered_count: { before: 0, after: deliveredCount } },
        metadata: {
          confirmed_at: confirmedAt,
          note: confirmNote,
          normal_orders_delivered: normalDeliveredCount,
          agent_orders_delivered: agentDeliveredCount,
        },
      });

      setResultsModal({ count: deliveredCount, coveredUntil: pendingCheckpoint.created_at });
      setConfirmNote('');
      await fetchAll();
    } catch (err: any) {
      toast.error(`Failed to confirm: ${err.message}`);
    } finally {
      setConfirmingCheckpoint(false);
    }
  };


  const handleNotReceived = async () => {
    if (!pendingCheckpoint) return;
    try {
      await supabase
        .from('delivery_checkpoints' as any)
        .update({ notes: notReceivedNote || 'Not received yet' })
        .eq('id', pendingCheckpoint.id);
      toast.info('Note saved. Checkpoint remains pending.');
      setNotReceivedNote('');
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTogglePause = async () => {
    if (!settings || !settingsDraft) return;
    const newEnabled = !settings.enabled;
    try {
      await supabase
        .from('checkpoint_settings' as any)
        .update({ enabled: newEnabled, updated_by: user?.id })
        .eq('id', settings.id);
      setSettings({ ...settings, enabled: newEnabled });
      setSettingsDraft({ ...settingsDraft, enabled: newEnabled });
      toast.success(newEnabled ? 'Checkpoint system resumed.' : 'Checkpoint system paused.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('checkpoint_settings' as any)
        .update({
          enabled: settingsDraft.enabled,
          test_phone: settingsDraft.test_phone,
          test_bundle_id: settingsDraft.test_bundle_id,
          test_bundle_name: settingsDraft.test_bundle_name,
          min_gap_hours: settingsDraft.min_gap_hours,
          daily_max: settingsDraft.daily_max,
          active_hours_start: settingsDraft.active_hours_start,
          active_hours_end: settingsDraft.active_hours_end,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settingsDraft.id);
      if (error) throw error;
      setSettings({ ...settingsDraft });
      toast.success('Checkpoint settings saved.');
      setShowSettings(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  if (authLoading || loading) {
    return (
      <AdminLayout>
        <div className="space-y-4 max-w-4xl">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AdminLayout>
    );
  }

  const StatusIcon = systemStatus.icon;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-display font-bold">Delivery Checkpoints</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              Confirm MTN bundle delivery using a test phone, then bulk-mark eligible orders as Delivered.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowSettings(true); }}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAll}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── Control Card ─────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${systemStatus.bg}`}>
                <StatusIcon className={`w-5 h-5 ${systemStatus.color}`} />
              </div>
              <div>
                <p className="font-semibold text-sm">System Status</p>
                <p className={`text-xs font-medium ${systemStatus.color}`}>{systemStatus.label}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {settings?.enabled ? (
                <Button variant="outline" size="sm" onClick={handleTogglePause} className="gap-2 text-xs">
                  <Pause className="w-3.5 h-3.5" /> Pause System
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleTogglePause} className="gap-2 text-xs">
                  <Play className="w-3.5 h-3.5" /> Resume System
                </Button>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
            <StatCell
              label="Last Created"
              value={checkpoints[0] ? formatTime(checkpoints[0].created_at) : '—'}
              icon={<Calendar className="w-4 h-4" />}
            />
            <StatCell
              label="Last Confirmed"
              value={(() => {
                const lc = checkpoints.find(c => c.status === 'CONFIRMED');
                return lc?.confirmed_at ? formatTime(lc.confirmed_at) : '—';
              })()}
              icon={<CheckCircle2 className="w-4 h-4" />}
            />
            <StatCell
              label="Status"
              value={pendingCheckpoint ? 'Running' : 'Ready'}
              highlight={!pendingCheckpoint}
              icon={<ChevronRight className="w-4 h-4" />}
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            {canStart && (
              <Button
                onClick={handleStartCheckpoint}
                disabled={startingCheckpoint}
                className="gap-2"
                size="sm"
              >
                {startingCheckpoint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Checkpoint
              </Button>
            )}
            {pendingCheckpoint && (
              <>
                <Button
                  onClick={handleConfirmReceived}
                  disabled={confirmingCheckpoint}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="sm"
                >
                  {confirmingCheckpoint ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm Received
                </Button>
              </>
            )}
            {!canStart && !pendingCheckpoint && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <Info className="w-3.5 h-3.5" />
                {!settings?.enabled
                  ? 'System is paused.'
                  : 'Ready — click Start Checkpoint.'}
              </p>
            )}
          </div>
        </div>

        {/* ── Pending Checkpoint Section ────────────────────────────── */}
        {pendingCheckpoint && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <Timer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">Pending Checkpoint</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Created {formatDistanceToNow(new Date(pendingCheckpoint.created_at))} ago
                </p>
              </div>
              <Badge className="ml-auto bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200">
                PENDING
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Network</p>
                <p className="font-medium">{pendingCheckpoint.network}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Test Phone</p>
                <p className="font-medium font-mono">{pendingCheckpoint.test_phone}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Bundle</p>
                <p className="font-medium">{pendingCheckpoint.bundle_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Order ID</p>
                <p className="font-mono text-xs">{pendingCheckpoint.internal_order_id || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Created At</p>
                <p className="font-medium">{formatTime(pendingCheckpoint.created_at)}</p>
              </div>
              {pendingCheckpoint.supplier_order_id && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Supplier Ref</p>
                  <p className="font-mono text-xs">{pendingCheckpoint.supplier_order_id}</p>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Important:</strong> Only confirm after you physically receive the data bundle on the test phone{' '}
                <span className="font-mono font-bold">{pendingCheckpoint.test_phone}</span>.
                This will bulk-mark all eligible MTN Processing orders as Delivered.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Admin Note (optional)</Label>
              <Textarea
                value={confirmNote}
                onChange={e => setConfirmNote(e.target.value)}
                placeholder="e.g. Received 1GB bundle at 14:32, network latency noted."
                rows={2}
                className="text-sm"
                maxLength={300}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleConfirmReceived}
                disabled={confirmingCheckpoint}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
              >
                {confirmingCheckpoint ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm Received
              </Button>
              <div className="flex gap-2 items-center flex-1">
                <Input
                  value={notReceivedNote}
                  onChange={e => setNotReceivedNote(e.target.value)}
                  placeholder="Note why not received yet..."
                  className="text-sm h-8 flex-1"
                  maxLength={200}
                />
                <Button variant="outline" size="sm" onClick={handleNotReceived} className="gap-2 shrink-0">
                  Not Received Yet
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Today Summary Strip ───────────────────────────────────── */}
        {todaySummary && (
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Today's MTN Summary
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <SummaryCell label="MTN Paid Orders" value={todaySummary.totalMtnPaid} />
              <SummaryCell label="Delivered" value={todaySummary.totalMtnDelivered} color="text-emerald-600 dark:text-emerald-400" />
              <SummaryCell label="Processing" value={todaySummary.totalMtnProcessing} color="text-amber-600 dark:text-amber-400" />
              <SummaryCell label="By Checkpoints" value={todaySummary.deliveredByCheckpoints} color="text-primary" />
              <SummaryCell
                label="Avg Confirm Time"
                value={todaySummary.avgConfirmMinutes !== null ? `${todaySummary.avgConfirmMinutes}m` : '—'}
              />
            </div>
          </div>
        )}

        {/* ── Checkpoint History ─────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-sm font-semibold">Checkpoint History</p>
          </div>
          <div className="divide-y divide-border">
            {checkpoints.length === 0 && (
              <div className="px-5 py-8 text-center text-muted-foreground text-sm">
                No checkpoints yet. Start your first checkpoint above.
              </div>
            )}
            {checkpoints.map(cp => (
              <div key={cp.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <StatusDot status={cp.status} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{cp.network} · {cp.bundle_name || 'Bundle'}</p>
                    <p className="text-[11px] text-muted-foreground">{formatTime(cp.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {cp.status === 'CONFIRMED' && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {cp.orders_delivered_count} delivered
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={
                      cp.status === 'CONFIRMED'
                        ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400 text-[10px]'
                        : cp.status === 'PENDING'
                        ? 'border-blue-400 text-blue-600 dark:text-blue-400 text-[10px]'
                        : 'text-[10px]'
                    }
                  >
                    {cp.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Settings Dialog ────────────────────────────────────────────── */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" /> Checkpoint Settings
            </DialogTitle>
          </DialogHeader>
          {settingsDraft && (
            <div className="space-y-4 pt-2">
              {/* Enabled */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">System Enabled</Label>
                  <p className="text-xs text-muted-foreground">Turn off to pause all checkpoint creation</p>
                </div>
                <Switch
                  checked={settingsDraft.enabled}
                  onCheckedChange={v => setSettingsDraft({ ...settingsDraft, enabled: v })}
                />
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Test Configuration</p>

                <div>
                  <Label className="text-sm">Test Network</Label>
                  <Input value="MTN" disabled className="mt-1 opacity-60 font-mono" />
                  <p className="text-xs text-muted-foreground mt-1">Fixed to MTN for this version</p>
                </div>

                <div>
                  <Label className="text-sm">Test Phone Number *</Label>
                  <Input
                    value={settingsDraft.test_phone}
                    onChange={e => setSettingsDraft({ ...settingsDraft, test_phone: e.target.value })}
                    placeholder="e.g. 0241234567"
                    className="mt-1 font-mono"
                    maxLength={15}
                  />
                  <p className="text-xs text-muted-foreground mt-1">The MTN number that will receive the test bundle</p>
                </div>

                <div>
                  <Label className="text-sm">Test Bundle</Label>
                  <Select
                    value={settingsDraft.test_bundle_id || ''}
                    onValueChange={v => {
                      const bundle = mtnBundles.find(b => b.id === v);
                      setSettingsDraft({
                        ...settingsDraft,
                        test_bundle_id: v,
                        test_bundle_name: bundle ? `${bundle.bundle_size_gb}GB` : v,
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select MTN bundle..." />
                    </SelectTrigger>
                    <SelectContent>
                      {mtnBundles.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.bundle_size_gb}GB — GHS {b.price_ghs.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Smallest bundle recommended to minimise cost</p>
                </div>
              </div>




              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Shield className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Mode: <strong>Create next checkpoint only after confirmation</strong> — fixed ON.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveSettings} disabled={savingSettings} className="flex-1 gap-2">
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Settings
                </Button>
                <Button variant="outline" onClick={() => { setSettingsDraft(settings ? { ...settings } : null); setShowSettings(false); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Results Modal ──────────────────────────────────────────────── */}
      <Dialog open={!!resultsModal} onOpenChange={() => setResultsModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
              Checkpoint Confirmed
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="text-center py-4">
              <div className="text-5xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                {resultsModal?.count ?? 0}
              </div>
              <p className="text-sm text-muted-foreground">Orders marked as Delivered</p>
            </div>
            {resultsModal && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground text-center">
                Covered MTN Processing orders placed up to{' '}
                <strong className="text-foreground">{formatTime(resultsModal.coveredUntil)}</strong>
              </div>
            )}
            <Button onClick={() => setResultsModal(null)} className="w-full">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────
const StatCell = ({
  label, value, icon, highlight,
}: {
  label: string; value: string; icon?: React.ReactNode; highlight?: boolean;
}) => (
  <div className="bg-muted/50 rounded-lg p-3">
    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </div>
    <p className={`text-sm font-semibold ${highlight ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{value}</p>
  </div>
);

const SummaryCell = ({
  label, value, color = '',
}: {
  label: string; value: string | number; color?: string;
}) => (
  <div className="text-center">
    <p className={`text-xl font-bold ${color}`}>{value}</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
  </div>
);

const StatusDot = ({ status }: { status: string }) => {
  const color =
    status === 'CONFIRMED' ? 'bg-emerald-500' :
    status === 'PENDING' ? 'bg-blue-500' :
    'bg-muted-foreground';
  return <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
};

export default AdminDeliveryCheckpoints;
