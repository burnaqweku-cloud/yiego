import { useState, useEffect, useCallback } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import AgentPayoutMethods from '@/components/agent/AgentPayoutMethods';
import { detectNetwork } from '@/components/agent/AgentPayoutMethods';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Wallet, ArrowDownCircle, Clock, AlertCircle } from 'lucide-react';
import { parseEdgeFunctionError } from '@/lib/edge-function-error';

const MIN_WITHDRAWAL = 10;
const WITHDRAWAL_FEE = 1.00; // applied only when Paystack auto mode is enabled

interface PayoutProfile {
  id: string;
  label: string | null;
  momo_number: string;
  momo_name: string;
  network: string | null;
  is_default: boolean;
}

const AgentWithdrawals = () => {
  const { agent, wallet, refresh } = useAgent();
  const { storeStatus, loading: statusLoading } = useStoreStatus();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [amount, setAmount] = useState('');
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [momoNetwork, setMomoNetwork] = useState('MTN');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Payout profiles
  const [payoutProfiles, setPayoutProfiles] = useState<PayoutProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('manual');
  const [saveMethod, setSaveMethod] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');

  // Live payout mode (mirrors server site_settings.withdrawals_paystack_enabled)
  const [paystackAutoMode, setPaystackAutoMode] = useState<boolean>(false);
  const effectiveFee = paystackAutoMode ? WITHDRAWAL_FEE : 0;

  useEffect(() => {
    if (!agent || storeStatus !== 'active') return;
    fetchWithdrawals();
    fetchPayoutProfiles();
    // Read current mode (best-effort; RPC is the authoritative source at submit time)
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'withdrawals_paystack_enabled')
      .maybeSingle()
      .then(({ data }) => setPaystackAutoMode((data as any)?.value === 'true'));
  }, [agent, storeStatus]);

  const fetchWithdrawals = async () => {
    if (!agent) return;
    setLoading(true);
    const { data } = await supabase
      .from('agent_withdrawals' as any)
      .select('*')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false });
    if (data) setWithdrawals(data);
    setLoading(false);
  };

  const fetchPayoutProfiles = async () => {
    if (!agent) return;
    const { data } = await supabase
      .from('agent_payout_profiles' as any)
      .select('*')
      .eq('agent_id', agent.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (data) {
      const profiles = data as any as PayoutProfile[];
      setPayoutProfiles(profiles);
      // Pre-select default
      const defaultProfile = profiles.find(p => p.is_default);
      if (defaultProfile) {
        setSelectedProfileId(defaultProfile.id);
        setMomoNumber(defaultProfile.momo_number);
        setMomoName(defaultProfile.momo_name);
        const net = defaultProfile.network || detectNetwork(defaultProfile.momo_number);
        if (net) setMomoNetwork(net);
      }
    }
  };

  const handleProfileSelect = (profileId: string) => {
    setSelectedProfileId(profileId);
    if (profileId === 'manual') {
      setMomoNumber('');
      setMomoName('');
      setMomoNetwork('MTN');
      return;
    }
    const profile = payoutProfiles.find(p => p.id === profileId);
    if (profile) {
      setMomoNumber(profile.momo_number);
      setMomoName(profile.momo_name);
      const net = profile.network || detectNetwork(profile.momo_number);
      if (net) setMomoNetwork(net);
    }
  };

  const ERROR_MESSAGES: Record<string, string> = {
    NOT_AUTHENTICATED: 'Please log in to request a withdrawal.',
    ACCOUNT_NOT_AGENT: 'Your agent account is not active.',
    ACCOUNT_SUSPENDED: 'Your account is suspended. Contact support.',
    INVALID_AMOUNT: 'Invalid withdrawal amount.',
    INVALID_MOMO_NUMBER: 'Enter a valid Ghana MoMo number (e.g. 0551234567).',
    INVALID_NETWORK: 'Select a valid mobile network.',
    PENDING_WITHDRAWAL_EXISTS: 'You already have a pending withdrawal request.',
    INSUFFICIENT_BALANCE: 'Insufficient balance for this withdrawal.',
    SERVER_ERROR: 'Something went wrong. Please try again.',
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(amount);
    const available = wallet?.available_balance || 0;
    const totalNeeded = (amt || 0) + effectiveFee;

    if (!amt || amt < MIN_WITHDRAWAL) { toast.error(`Minimum withdrawal is GHS ${MIN_WITHDRAWAL}`); return; }
    if (totalNeeded > available) {
      const maxAllowed = Math.max(0, available - effectiveFee);
      const feeNote = effectiveFee > 0 ? ` (incl. GHS ${effectiveFee.toFixed(2)} fee)` : '';
      toast.error(`Insufficient balance. You need GHS ${totalNeeded.toFixed(2)}${feeNote}. Max withdrawable: GHS ${maxAllowed.toFixed(2)}`);
      return;
    }
    if (!momoNumber || momoNumber.length < 10) { toast.error('Enter a valid 10-digit MoMo number'); return; }
    if (!agent) return;
    if (submitting) return; // double-click guard

    setSubmitting(true);
    try {
      const detectedNet = detectNetwork(momoNumber);
      const { data, error } = await supabase.rpc('request_agent_withdrawal', {
        p_amount: amt,
        p_momo_number: momoNumber,
        p_momo_network: momoNetwork,
        p_payout_momo_name: momoName.trim() || null,
        p_payout_network: detectedNet || momoNetwork,
        p_payout_profile_id: selectedProfileId !== 'manual' ? selectedProfileId : null,
        p_created_from_flow: 'agent_dashboard',
      });

      if (error) throw error;

      const result = data as any;
      if (!result?.success) {
        const errorCode = result?.error || 'SERVER_ERROR';
        const msg = result?.message || ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.SERVER_ERROR;
        toast.error(msg);
        return;
      }

      // Sync local mode display with the authoritative server flag
      setPaystackAutoMode(result.paystack_auto === true);

      // Save new payout method if requested
      if (saveMethod && selectedProfileId === 'manual' && momoName.trim().length >= 4) {
        const activeCount = payoutProfiles.length;
        if (activeCount < 3) {
          const detectedNet = detectNetwork(momoNumber);
          await (supabase.from('agent_payout_profiles' as any) as any).insert({
            agent_id: agent.id,
            label: saveLabel.trim() || null,
            momo_number: momoNumber,
            momo_name: momoName.trim(),
            network: detectedNet,
            is_default: activeCount === 0,
          });
        }
      }

      // ── Auto-invoke Paystack payout when enabled (server-confirmed flag) ──
      if (result.paystack_auto === true && result.withdrawal_id) {
        try {
          const { data: payoutData, error: payoutErr } = await supabase.functions.invoke(
            'process-agent-withdrawal',
            { body: { withdrawal_id: result.withdrawal_id } }
          );
          if (payoutErr) {
            // Surface the REAL backend error (auth failure, Paystack reason, etc.)
            // instead of an opaque generic warning. Admin sees the full reason via
            // the edge-function logs + admin debug strip.
            const parsed = await parseEdgeFunctionError(payoutErr, 'Auto-payout could not start.');
            console.error('Auto-payout invoke error:', parsed.code, parsed.status, parsed.message);
            toast.warning(
              `Auto-payout could not start: ${parsed.message}. Admin will review.`,
              { duration: 8000 }
            );
          } else {
            const pr = payoutData as any;
            if (pr?.success) {
              toast.success(pr.message || 'Payout submitted to Paystack.');
            } else {
              const msg = pr?.message || pr?.error || 'Auto-payout could not start. Admin will review.';
              toast.warning(msg, { duration: 8000 });
            }
          }
        } catch (e: any) {
          console.error('Auto-payout failed (will fall back to admin):', e);
          toast.warning(
            `Withdrawal recorded but auto-payout could not start: ${e?.message || 'unknown error'}. Admin will review.`,
            { duration: 8000 }
          );
        }
      } else {
        toast.success('Withdrawal request submitted! Your balance has been updated.');
      }

      // Fire-and-forget SMS notifications
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const { data: profile } = await supabase.from('profiles').select('phone').eq('id', currentUser.id).maybeSingle();
          if (profile?.phone) {
            supabase.functions.invoke('send-sms', {
              body: {
                to: profile.phone,
                event_type: 'withdrawal_requested',
                agent_id: agent.id,
                reference: result.withdrawal_id,
                template_vars: { amount: amt.toFixed(2) },
              },
            }).catch(() => {});
          }
        }

        // Admin alert SMS for new withdrawal
        supabase.functions.invoke('send-sms', {
          body: {
            to: '233557375894', // JJS admin number
            event_type: 'admin_withdrawal_alert',
            agent_id: agent.id,
            reference: result.withdrawal_id,
            template_vars: { amount: amt.toFixed(2), agent_name: agent.store_name || 'Agent' },
          },
        }).catch(() => {});

        // Admin alert: Telegram (fire-and-forget — never blocks the request)
        supabase.functions.invoke('telegram-notify-admin', {
          body: {
            kind: 'withdrawal_request',
            agent_name: agent.store_name || 'Agent',
            agent_phone: agent.whatsapp_number || null,
            amount_ghs: amt,
            momo_number: momoNumber,
            momo_network: momoNetwork,
            withdrawal_id: result.withdrawal_id,
            agent_id: agent.id,
          },
        }).catch(() => {});
      } catch {}

      setAmount('');
      setMomoNumber('');
      setMomoName('');
      setSaveMethod(false);
      setSaveLabel('');
      fetchWithdrawals();
      fetchPayoutProfiles();
      refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-pending',
      pending_review: 'badge-pending',
      approved: 'badge-processing',
      payout_processing: 'badge-processing',
      paid: 'badge-delivered',
      payout_failed: 'badge-failed',
      rejected: 'badge-failed',
    };
    const labels: Record<string, string> = {
      pending: 'Pending Review',
      pending_review: 'Pending Review',
      approved: 'Approved',
      payout_processing: 'Processing Payout',
      paid: 'Paid',
      payout_failed: 'Failed',
      rejected: 'Rejected',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[status] || 'badge-pending'}`}>{labels[status] || status}</span>;
  };

  return (
    <AgentGate>
    <AgentLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold">Withdrawals</h1>
          <p className="text-xs text-muted-foreground">Request withdrawal of your earnings</p>
        </div>

        {/* Balance Card */}
        <Card className="card-shadow border-primary/20 overflow-hidden">
          <div className="h-1 gradient-gold" />
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available Balance</p>
                <p className="text-2xl font-bold">GHS {(wallet?.available_balance || 0).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payout Methods */}
        <AgentPayoutMethods />

        {/* Withdrawal Form */}
        <Card className="card-shadow border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Request Withdrawal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Amount (GHS)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Minimum: GHS {MIN_WITHDRAWAL}</p>
            </div>

            {/* Payout method selector */}
            {payoutProfiles.length > 0 && (
              <div>
                <Label className="text-xs">Payout Method</Label>
                <Select value={selectedProfileId} onValueChange={handleProfileSelect}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    {payoutProfiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label || 'Payout Method'} — •••{p.momo_number.slice(-4)} ({p.momo_name})
                      </SelectItem>
                    ))}
                    <SelectItem value="manual">Enter manually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">MoMo Number</Label>
              <Input
                value={momoNumber}
                onChange={e => {
                  setMomoNumber(e.target.value);
                  if (selectedProfileId !== 'manual') setSelectedProfileId('manual');
                }}
                placeholder="0551234567"
                maxLength={12}
                className="mt-1"
              />
              {momoNumber.length >= 3 && detectNetwork(momoNumber) && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Detected: <span className="font-semibold">{detectNetwork(momoNumber)}</span>
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">Name on Account</Label>
              <Input
                value={momoName}
                onChange={e => {
                  setMomoName(e.target.value);
                  if (selectedProfileId !== 'manual') setSelectedProfileId('manual');
                }}
                placeholder="Full name on MoMo account"
                maxLength={60}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Network</Label>
              <Select value={momoNetwork} onValueChange={setMomoNetwork}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MTN">MTN MoMo</SelectItem>
                  <SelectItem value="Telecel">Telecel Cash</SelectItem>
                  <SelectItem value="AirtelTigo">AirtelTigo Money</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Save method option (only for manual entry) */}
            {selectedProfileId === 'manual' && payoutProfiles.length < 3 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="save-method"
                    checked={saveMethod}
                    onCheckedChange={(v) => setSaveMethod(!!v)}
                  />
                  <label htmlFor="save-method" className="text-xs cursor-pointer">Save this payout method</label>
                </div>
                {saveMethod && (
                  <div>
                    <Label className="text-xs">Label (optional)</Label>
                    <Input value={saveLabel} onChange={e => setSaveLabel(e.target.value)} placeholder='e.g. "My MTN"' className="mt-1" maxLength={30} />
                  </div>
                )}
              </div>
            )}

            {/* Fee breakdown */}
            {parseFloat(amount) > 0 && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">You will receive</span>
                  <span className="font-semibold">GHS {parseFloat(amount).toFixed(2)}</span>
                </div>
                {effectiveFee > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Withdrawal fee</span>
                    <span className="font-semibold">GHS {effectiveFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                  <span className="font-medium">Total deducted</span>
                  <span className="font-bold text-primary">GHS {(parseFloat(amount) + effectiveFee).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 bg-muted/50 rounded-xl p-3">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                {effectiveFee > 0
                  ? `Auto-processed within minutes. A flat GHS ${effectiveFee.toFixed(2)} fee applies per withdrawal.`
                  : 'Reviewed and paid manually by the admin team. No fee applies in this mode.'}
              </p>
            </div>

            <Button onClick={handleWithdraw} disabled={submitting} className="w-full" size="lg">
              {submitting ? 'Submitting...' : 'Request Withdrawal'}
            </Button>
          </CardContent>
        </Card>

        {/* Withdrawal History */}
        <Card className="card-shadow border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Withdrawal History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><div className="spinner" /></div>
            ) : withdrawals.length === 0 ? (
              <div className="py-10 text-center">
                <ArrowDownCircle className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No withdrawal requests yet</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {withdrawals.map((w: any) => (
                  <div key={w.id} className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">GHS {Number(w.amount_ghs).toFixed(2)}
                        {Number(w.withdrawal_fee_ghs ?? 0) > 0 && (
                          <span className="text-[10px] font-normal text-muted-foreground ml-1">
                            (+ GHS {Number(w.withdrawal_fee_ghs).toFixed(2)} fee)
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {w.payout_network || w.momo_network} · {w.momo_number}
                        {w.payout_momo_name && ` · ${w.payout_momo_name}`}
                        {' · '}{w.created_at ? format(new Date(w.created_at), 'dd MMM, HH:mm') : ''}
                      </p>
                      {w.admin_notes && w.status === 'rejected' && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-destructive" />
                          <p className="text-[10px] text-destructive">{w.admin_notes}</p>
                        </div>
                      )}
                      {w.payout_failure_reason && w.status === 'payout_failed' && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-destructive" />
                          <p className="text-[10px] text-destructive">Payout failed: {w.payout_failure_reason}. Funds restored to your balance.</p>
                        </div>
                      )}
                    </div>
                    {statusBadge(w.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
    </AgentGate>
  );
};

export default AgentWithdrawals;
