import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { Copy, Flag, MessageSquare, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const AdminAgentWithdrawals = () => {
  const { user, isAdmin } = useAuth();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [auditLogs, setAuditLogs] = useState<Record<string, any[]>>({});
  const [paystackEnabled, setPaystackEnabled] = useState<boolean>(false);

  useEffect(() => { fetchWithdrawals(); }, []);

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'withdrawals_paystack_enabled')
      .maybeSingle()
      .then(({ data }) => setPaystackEnabled(data?.value === 'true'));
  }, []);

  const fetchWithdrawals = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('agent_withdrawals' as any)
      .select('*, agents!inner(store_name)')
      .order('created_at', { ascending: false });
    if (data) setWithdrawals(data);
    setLoading(false);
  };

  const fetchAuditLogs = useCallback(async (withdrawalId: string) => {
    const { data } = await supabase
      .from('withdrawal_audit_logs' as any)
      .select('*')
      .eq('withdrawal_id', withdrawalId)
      .order('created_at', { ascending: false });
    if (data) setAuditLogs(prev => ({ ...prev, [withdrawalId]: data as any }));
  }, []);

  const logAudit = async (withdrawalId: string, action: string, details?: any) => {
    if (!user) return;
    await (supabase.from('withdrawal_audit_logs' as any) as any).insert({
      withdrawal_id: withdrawalId,
      actor_id: user.id,
      action,
      details: details || null,
    });
  };

  const handleApproveAndPay = async (id: string) => {
    if (!isAdmin) { toast.error('Admin only'); return; }
    if (processing) return;
    setProcessing(id);
    try {
      const { data, error } = await supabase.functions.invoke('process-agent-withdrawal', {
        body: { withdrawal_id: id },
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        toast.error(result?.message || result?.error || 'Payout failed');
      } else {
        await logAudit(id, 'AUTO_PAYOUT_TRIGGERED', {
          transfer_reference: result.transfer_reference,
          internal_status: result.internal_status,
        });
        toast.success(result.message || 'Payout submitted');
      }
      fetchWithdrawals();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setProcessing(null);
    }
  };

  const handleMarkAsPaid = async (w: any) => {
    if (!isAdmin) { toast.error('Admin only'); return; }
    if (processing) return;
    if (!confirm(`Mark withdrawal of GHS ${Number(w.amount_ghs).toFixed(2)} to ${w.momo_network} ${w.momo_number} as PAID?\n\nOnly do this AFTER you have manually sent the money.`)) return;
    setProcessing(w.id);
    try {
      // Atomic guard: only flip from a pre-paid status; never double-mark
      const { data: updatedRow, error: updateErr } = await (supabase.from('agent_withdrawals' as any) as any)
        .update({
          status: 'paid',
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
          payout_completed_at: new Date().toISOString(),
        })
        .eq('id', w.id)
        .in('status', ['pending', 'pending_review', 'approved'])
        .select('id')
        .maybeSingle();

      if (updateErr) throw updateErr;
      if (!updatedRow) {
        toast.error('Withdrawal is no longer pending — refresh to see latest status.');
        fetchWithdrawals();
        return;
      }

      await logAudit(w.id, 'MANUAL_MARK_PAID', { amount: Number(w.amount_ghs) });

      // Notify agent via SMS (best effort)
      try {
        const { data: agentData } = await supabase.from('agents' as any).select('user_id').eq('id', w.agent_id).maybeSingle();
        if (agentData) {
          const { data: profile } = await supabase.from('profiles').select('phone').eq('id', (agentData as any).user_id).maybeSingle();
          if (profile?.phone) {
            supabase.functions.invoke('send-sms', {
              body: {
                to: profile.phone,
                message: `D-SIKA Agents: Your withdrawal of GHS ${Number(w.amount_ghs).toFixed(2)} has been paid to ${w.momo_network} ${w.momo_number}.`,
                event_type: 'withdrawal_paid',
                agent_id: w.agent_id,
                reference: w.id,
              },
            }).catch(() => {});
          }
        }
      } catch {}

      toast.success('Marked as paid');
      fetchWithdrawals();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setProcessing(null);
    }
  };

  const handleAction = async (id: string, agentId: string, amount: number, action: 'rejected', fee: number = 0) => {
    if (!isAdmin) { toast.error('Admin only'); return; }
    setProcessing(id);
    try {
      await (supabase.from('agent_withdrawals' as any) as any).update({
        status: action,
        processed_by: user?.id,
        processed_at: new Date().toISOString(),
      }).eq('id', id);
      await logAudit(id, 'REJECTED');

      const refundTotal = amount + (fee || 0);
      const { data: walletRaw } = await supabase.from('agent_wallets' as any).select('*').eq('agent_id', agentId).maybeSingle();
      const wallet = walletRaw as any;
      if (wallet) {
        await (supabase.from('agent_wallets' as any) as any).update({
          available_balance: Number(wallet.available_balance) + refundTotal,
        }).eq('id', wallet.id);

        await (supabase.from('agent_wallet_transactions' as any) as any).insert({
          agent_id: agentId,
          type: 'withdrawal_reversed',
          amount_ghs: refundTotal,
          description: `Withdrawal rejected — GHS ${refundTotal.toFixed(2)} restored${fee > 0 ? ` (incl. GHS ${fee.toFixed(2)} fee)` : ''}`,
          reference: `reversed-${id}`,
          status: 'completed',
        }).then(() => {}).catch(() => {});
      }

      const { data: agentData } = await supabase.from('agents' as any).select('user_id').eq('id', agentId).maybeSingle();
      if (agentData) {
        const { data: profile } = await supabase.from('profiles').select('phone').eq('id', (agentData as any).user_id).maybeSingle();
        if (profile?.phone) {
          supabase.functions.invoke('send-sms', {
            body: {
              to: profile.phone,
              message: `D-SIKA Agents: Withdrawal request of GHS ${amount.toFixed(2)} was rejected. Funds restored to your balance.`,
              event_type: 'withdrawal_rejected',
              agent_id: agentId,
              reference: id,
            },
          }).catch(() => {});
        }
      }

      toast.success(`Withdrawal rejected`);
      fetchWithdrawals();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setProcessing(null);
    }
  };

  const handleToggleFlag = async (w: any) => {
    if (!isAdmin) { toast.error('Admin only'); return; }
    const newFlag = w.review_flag === 'NAME_MISMATCH' ? null : 'NAME_MISMATCH';
    await (supabase.from('agent_withdrawals' as any) as any)
      .update({ review_flag: newFlag }).eq('id', w.id);
    await logAudit(w.id, newFlag ? 'FLAG_NAME_MISMATCH' : 'CLEAR_FLAG');
    toast.success(newFlag ? 'Flagged for name mismatch' : 'Flag cleared');
    fetchWithdrawals();
  };

  const handleSaveNote = async (w: any) => {
    if (!isAdmin) { toast.error('Admin only'); return; }
    setSavingNote(true);
    await (supabase.from('agent_withdrawals' as any) as any)
      .update({ internal_note: noteText }).eq('id', w.id);
    await logAudit(w.id, 'ADD_NOTE', { note: noteText });
    toast.success('Note saved');
    setSavingNote(false);
    fetchWithdrawals();
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      const w = withdrawals.find((wd: any) => wd.id === id);
      if (w?.internal_note) setNoteText(w.internal_note);
      else setNoteText('');
      fetchAuditLogs(id);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    const digits = text.replace(/\D/g, '');
    navigator.clipboard.writeText(label === 'Number' ? digits : text);
    toast.success(`${label} copied`);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      pending_review: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      approved: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
      payout_processing: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
      paid: 'bg-green-500/10 text-green-700 dark:text-green-400',
      payout_failed: 'bg-red-500/10 text-red-700 dark:text-red-400',
      rejected: 'bg-red-500/10 text-red-700 dark:text-red-400',
    };
    const labels: Record<string, string> = {
      pending: 'pending review',
      pending_review: 'pending review',
      payout_processing: 'processing',
      payout_failed: 'failed',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[status] || 'bg-muted text-muted-foreground'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const networkBadge = (network: string | null) => {
    if (!network) return null;
    const colors: Record<string, string> = {
      MTN: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      Telecel: 'bg-red-500/10 text-red-700 dark:text-red-400',
      AirtelTigo: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    };
    return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${colors[network] || 'bg-muted text-muted-foreground'}`}>{network}</span>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold">Agent Withdrawals</h1>
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
            paystackEnabled
              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          }`}>
            {paystackEnabled ? 'Paystack payout mode active' : 'Manual payout mode active'}
          </span>
        </div>

        <Card className="card-shadow">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-8"><div className="spinner" /></div>
            ) : withdrawals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No withdrawal requests</p>
            ) : (
              <div className="divide-y divide-border">
                {withdrawals.map((w: any) => (
                  <div key={w.id} className="px-4 py-3">
                    {/* Main row */}
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(w.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{w.agents?.store_name || '—'}</span>
                          {statusBadge(w.status)}
                          {w.review_flag === 'NAME_MISMATCH' && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1.5 gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" /> Mismatch
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-sm font-bold">GHS {Number(w.amount_ghs).toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {w.momo_network} {w.momo_number}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(w.momo_number, 'Number'); }}
                            className="p-0.5 rounded hover:bg-muted transition-colors"
                            title="Copy number"
                          >
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </button>
                          {w.payout_momo_name && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs font-medium">{w.payout_momo_name}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(w.payout_momo_name, 'Name'); }}
                                className="p-0.5 rounded hover:bg-muted transition-colors"
                                title="Copy name"
                              >
                                <Copy className="w-3 h-3 text-muted-foreground" />
                              </button>
                            </>
                          )}
                          {(w.payout_network || w.momo_network) && networkBadge(w.payout_network || w.momo_network)}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {w.created_at ? format(new Date(w.created_at), 'dd MMM yyyy, HH:mm') : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Action buttons — Admin only */}
                        {isAdmin && (w.status === 'pending' || w.status === 'pending_review' || w.status === 'approved') && (
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {paystackEnabled ? (
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleApproveAndPay(w.id)} disabled={processing === w.id}>
                                {processing === w.id ? 'Processing…' : 'Approve & Pay'}
                              </Button>
                            ) : (
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleMarkAsPaid(w)} disabled={processing === w.id}>
                                {processing === w.id ? 'Saving…' : 'Mark as Paid'}
                              </Button>
                            )}
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleAction(w.id, w.agent_id, Number(w.amount_ghs), 'rejected', Number(w.withdrawal_fee_ghs ?? 0))} disabled={processing === w.id}>Reject</Button>
                          </div>
                        )}
                        {isAdmin && w.status === 'payout_processing' && (
                          <span className="text-[10px] text-muted-foreground italic">awaiting webhook</span>
                        )}
                        {expandedId === w.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {expandedId === w.id && (
                      <div className="mt-3 pl-0 space-y-3 border-t border-border/50 pt-3">
                        {/* MoMo Details */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">MoMo Number</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className="font-mono font-semibold">{w.momo_number}</p>
                              <button onClick={() => copyToClipboard(w.momo_number, 'Number')} className="p-0.5 rounded hover:bg-muted"><Copy className="w-3 h-3 text-primary" /></button>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Account Name</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className="font-semibold">{w.payout_momo_name || '—'}</p>
                              {w.payout_momo_name && (
                                <button onClick={() => copyToClipboard(w.payout_momo_name, 'Name')} className="p-0.5 rounded hover:bg-muted"><Copy className="w-3 h-3 text-primary" /></button>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Network</p>
                            <p className="font-semibold mt-0.5">{w.payout_network || w.momo_network || '—'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Amount (to agent)</p>
                            <p className="font-semibold mt-0.5">GHS {Number(w.amount_ghs).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Withdrawal Fee</p>
                            <p className="font-semibold mt-0.5">GHS {Number(w.withdrawal_fee_ghs ?? 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total Deducted</p>
                            <p className="font-semibold mt-0.5">GHS {(Number(w.amount_ghs) + Number(w.withdrawal_fee_ghs ?? 0)).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Payout Mode</p>
                            <p className="font-semibold mt-0.5">
                              {w.payout_mode === 'paystack' ? 'Paystack (auto)' : w.payout_mode === 'manual' ? 'Manual' : (w.paystack_transfer_reference ? 'Paystack' : 'Manual')}
                            </p>
                          </div>
                        </div>

                        {/* Automation debug strip — admin-only diagnostic */}
                        <div className="rounded-md bg-muted/40 border border-border/40 p-2 space-y-1 text-[11px]">
                          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[9px]">Automation Debug</p>
                          <div><span className="text-muted-foreground">Attempted:</span> <span className="font-semibold">{w.automation_attempted ? 'Yes' : 'No'}</span>{w.automation_attempted_at && <span className="text-muted-foreground"> · {format(new Date(w.automation_attempted_at), 'dd MMM HH:mm:ss')}</span>}</div>
                          {w.created_from_flow && (
                            <div><span className="text-muted-foreground">Source:</span> {w.created_from_flow}</div>
                          )}
                          {w.paystack_recipient_code && (
                            <div className="font-mono"><span className="text-muted-foreground">Recipient:</span> {w.paystack_recipient_code}</div>
                          )}
                          {w.automation_error && (
                            <div className="text-destructive"><span className="font-semibold">Error:</span> {w.automation_error}</div>
                          )}
                        </div>

                        {/* Paystack payout info */}
                        {(w.paystack_transfer_reference || w.paystack_transfer_status || w.payout_failure_reason) && (
                          <div className="rounded-md bg-muted/40 border border-border/40 p-2 space-y-1 text-[11px]">
                            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[9px]">Paystack Transfer</p>
                            {w.paystack_transfer_reference && (
                              <div className="flex items-center gap-1 font-mono">
                                <span className="text-muted-foreground">Ref:</span>
                                <span>{w.paystack_transfer_reference}</span>
                                <button onClick={() => copyToClipboard(w.paystack_transfer_reference, 'Reference')} className="p-0.5 rounded hover:bg-muted"><Copy className="w-3 h-3 text-primary" /></button>
                              </div>
                            )}
                            {w.paystack_transfer_status && (
                              <div><span className="text-muted-foreground">Status:</span> <span className="font-semibold">{w.paystack_transfer_status}</span></div>
                            )}
                            {w.payout_initiated_at && (
                              <div><span className="text-muted-foreground">Initiated:</span> {format(new Date(w.payout_initiated_at), 'dd MMM HH:mm:ss')}</div>
                            )}
                            {w.payout_completed_at && (
                              <div><span className="text-muted-foreground">Completed:</span> {format(new Date(w.payout_completed_at), 'dd MMM HH:mm:ss')}</div>
                            )}
                            {w.payout_failure_reason && (
                              <div className="text-destructive"><span className="font-semibold">Failure:</span> {w.payout_failure_reason}</div>
                            )}
                          </div>
                        )}

                        {/* Admin-only actions */}
                        {isAdmin && (
                          <div className="space-y-2">
                            {/* Flag toggle */}
                            <div className="flex gap-2">
                              <Button
                                size="sm" variant="outline"
                                className={`h-7 text-xs gap-1 ${w.review_flag === 'NAME_MISMATCH' ? 'border-destructive text-destructive' : ''}`}
                                onClick={() => handleToggleFlag(w)}
                              >
                                <Flag className="w-3 h-3" />
                                {w.review_flag === 'NAME_MISMATCH' ? 'Clear Flag' : 'Flag: Name Mismatch'}
                              </Button>
                            </div>

                            {/* Internal note */}
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> Internal Note
                              </p>
                              <Textarea
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                                placeholder="Add internal note..."
                                rows={2}
                                className="text-xs"
                              />
                              <Button size="sm" className="h-7 text-xs mt-1" onClick={() => handleSaveNote(w)} disabled={savingNote}>
                                {savingNote ? 'Saving...' : 'Save Note'}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Audit trail */}
                        {auditLogs[w.id] && auditLogs[w.id].length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Audit Trail
                            </p>
                            <div className="space-y-1">
                              {auditLogs[w.id].map((log: any) => (
                                <div key={log.id} className="text-[10px] text-muted-foreground flex items-center gap-2">
                                  <span>{format(new Date(log.created_at), 'dd MMM HH:mm')}</span>
                                  <span className="font-semibold text-foreground">{log.action}</span>
                                  {log.details?.note && <span className="truncate max-w-[200px]">"{log.details.note}"</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminAgentWithdrawals;
