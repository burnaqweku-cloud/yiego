import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatPrice } from '@/data/bundles';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  ArrowLeft, CheckCircle, Ban, Power, ExternalLink, Wallet,
  ShoppingCart, TrendingUp, AlertTriangle, Clock, CreditCard, MessageSquare, Copy,
  Timer, XCircle, Hourglass, Store, Package, Tag
} from 'lucide-react';
import AgentProfitDebugPanel from '@/components/admin/AgentProfitDebugPanel';
import { normalizeGhanaWhatsApp, openAgentWhatsApp, copyAgentApprovalMessage } from '@/lib/agent-whatsapp-message';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getExactCount, sumColumn, formatCount } from '@/lib/db-counts';

// statusBadge removed — header now uses canonical effective state

const AdminAgentProfile = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const { user, isAdmin } = useAuth();
  const { log: auditLog } = useAuditLog();
  const [agent, setAgent] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [application, setApplication] = useState<any>(null);
  const [effectiveState, setEffectiveState] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  // True totals across ALL agent orders (not capped at the recent-50 list)
  const [agentTotals, setAgentTotals] = useState({
    totalOrders: 0,
    deliveredOrders: 0,
    failedOrders: 0,
    totalRevenue: 0,
    totalProfit: 0,
  });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Wallet adjustment
  const [adjustDialog, setAdjustDialog] = useState<'credit' | 'debit' | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  // Suspend
  const [suspendDialog, setSuspendDialog] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const fetchData = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);

    const deliveredFilter = (q: any) => q.eq('agent_id', agentId).in('status', ['delivered', 'Delivered']);
    const failedFilter = (q: any) => q.eq('agent_id', agentId).in('status', ['failed', 'Failed']);

    const [
      agentRes, walletRes, ordersRes, withdrawalsRes, activityRes,
      totalOrdersC, deliveredOrdersC, failedOrdersC, totalRevenueS, totalProfitS,
    ] = await Promise.all([
      supabase.from('agents').select('*').eq('id', agentId).maybeSingle(),
      supabase.from('agent_wallets').select('*').eq('agent_id', agentId).maybeSingle(),
      // Recent-50 list — pagination intentional; stats below use real totals
      supabase.from('agent_orders').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(50),
      supabase.from('agent_withdrawals').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }),
      (supabase.from('agent_activity_logs' as any) as any).select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(30),
      // True totals — never capped at 50
      getExactCount('agent_orders', (q) => q.eq('agent_id', agentId)),
      getExactCount('agent_orders', deliveredFilter),
      getExactCount('agent_orders', failedFilter),
      sumColumn('agent_orders', 'agent_selling_price', deliveredFilter),
      sumColumn('agent_orders', 'profit_ghs', deliveredFilter),
    ]);

    if (agentRes.data) {
      setAgent(agentRes.data);
      // Fetch application
      if (agentRes.data.application_id) {
        const { data: appData } = await supabase.from('agent_applications').select('*').eq('id', agentRes.data.application_id).maybeSingle();
        setApplication(appData);
      }
      // Fetch effective state via canonical RPC
      try {
        const { data: esData } = await supabase.rpc('get_agent_effective_state', { p_agent_id: agentId! });
        const esRow = Array.isArray(esData) && esData.length > 0 ? esData[0] : null;
        setEffectiveState(esRow);
      } catch { setEffectiveState(null); }
      // Fetch latest subscription record
      const { data: subData } = await supabase.from('agent_subscriptions').select('*').eq('agent_id', agentId!).order('expiry_date', { ascending: false }).limit(1).maybeSingle();
      setSubscription(subData);
    }
    if (walletRes.data) setWallet(walletRes.data);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (withdrawalsRes.data) setWithdrawals(withdrawalsRes.data as any[]);
    if (activityRes.data) setActivity(activityRes.data as any[]);
    setAgentTotals({
      totalOrders: totalOrdersC,
      deliveredOrders: deliveredOrdersC,
      failedOrders: failedOrdersC,
      totalRevenue: totalRevenueS,
      totalProfit: totalProfitS,
    });

    setLoading(false);
  }, [agentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const logActivity = async (eventType: string, meta: any) => {
    if (!agentId) return;
    try {
      await (supabase.from('agent_activity_logs' as any) as any).insert({
        agent_id: agentId, event_type: eventType, meta, actor_id: user?.id,
      });
    } catch {}
  };

  const handleActivate = async () => {
    setProcessing(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const promoExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await supabase.from('agents').update({
        status: 'active', activation_paid: true, activation_paid_at: now.toISOString(),
        activation_reference: 'ADMIN_MANUAL',
        agent_approved_at: now.toISOString(),
        activation_discount_expires_at: promoExpiry.toISOString(),
      } as any).eq('id', agentId!);

      await supabase.from('agent_subscriptions' as any).insert({
        agent_id: agentId!,
        status: 'active',
        paid_at: now.toISOString(),
        expiry_date: expiresAt.toISOString(),
        next_billing_date: expiresAt.toISOString(),
        paystack_reference: 'ADMIN_MANUAL',
        plan_price_current: 0,
        plan_price_standard: 50,
      });

      await logActivity('agent_activated', { admin: user?.id, method: 'admin_manual' });
      toast.success('Store activated successfully — Status: ACTIVE, Subscription: ACTIVE');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  // ── Admin plan-grant / extend / custom-expiry tools ──
  // These do NOT create fake Paystack payments — they are admin-granted
  // activations/extensions and are clearly tagged with 'ADMIN_GRANT'.

  const [customExpiryOpen, setCustomExpiryOpen] = useState(false);
  const [customExpiryDate, setCustomExpiryDate] = useState('');

  const planPrices: Record<'monthly' | 'yearly', { standard: number; days: number }> = {
    monthly: { standard: 50, days: 30 },
    yearly: { standard: 250, days: 365 },
  };

  const writeAuditPlanChange = async (
    action: string,
    oldExpiry: string | null,
    newExpiry: string | null,
    extra: Record<string, any> = {},
  ) => {
    try {
      await auditLog({
        action,
        entity_type: 'agent',
        entity_id: agentId!,
        changes: {
          status: { before: agent?.status ?? null, after: extra.newStatus ?? agent?.status ?? null },
          expiry_date: { before: oldExpiry, after: newExpiry },
        },
        metadata: { agent_user_id: agent?.user_id, ...extra },
      });
    } catch {}
  };

  const grantPlan = async (plan: 'monthly' | 'yearly') => {
    if (!agent) return;
    setProcessing(true);
    try {
      const { standard, days } = planPrices[plan];
      const now = new Date();
      const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const oldExpiry = subscription?.expiry_date ?? null;

      // Ensure agent record reflects active store
      await supabase.from('agents').update({
        status: 'active',
        activation_paid: true,
        activation_paid_at: agent.activation_paid_at || now.toISOString(),
        activation_reference: agent.activation_reference || 'ADMIN_GRANT',
        agent_approved_at: agent.agent_approved_at || now.toISOString(),
        subscription_plan: plan,
      } as any).eq('id', agentId!);

      // Insert a fresh active subscription window
      await supabase.from('agent_subscriptions' as any).insert({
        agent_id: agentId!,
        status: 'active',
        paid_at: now.toISOString(),
        expiry_date: expiresAt.toISOString(),
        next_billing_date: expiresAt.toISOString(),
        paystack_reference: `ADMIN_GRANT_${plan.toUpperCase()}_${Date.now()}`,
        plan_price_current: 0,
        plan_price_standard: standard,
      });

      await logActivity(plan === 'yearly' ? 'plan_granted_yearly' : 'plan_granted_monthly', {
        admin: user?.id, days, expires_at: expiresAt.toISOString(),
      });
      await writeAuditPlanChange(
        plan === 'yearly' ? 'agent.plan_granted_yearly' : 'agent.plan_granted_monthly',
        oldExpiry,
        expiresAt.toISOString(),
        { plan, days, newStatus: 'active' },
      );
      toast.success(`${plan === 'yearly' ? 'Yearly' : 'Monthly'} plan granted — store active until ${expiresAt.toLocaleDateString()}`);
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  const extendSubscription = async (days: number, label: string) => {
    if (!agent) return;
    setProcessing(true);
    try {
      const now = new Date();
      const oldExpiry = subscription?.expiry_date ?? null;

      if (!subscription) {
        // No existing sub — fall back to grant a fresh window of `days`
        const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        await supabase.from('agents').update({
          status: 'active',
          activation_paid: true,
          activation_paid_at: agent.activation_paid_at || now.toISOString(),
          activation_reference: agent.activation_reference || 'ADMIN_GRANT',
          agent_approved_at: agent.agent_approved_at || now.toISOString(),
        } as any).eq('id', agentId!);
        await supabase.from('agent_subscriptions' as any).insert({
          agent_id: agentId!,
          status: 'active',
          paid_at: now.toISOString(),
          expiry_date: expiresAt.toISOString(),
          next_billing_date: expiresAt.toISOString(),
          paystack_reference: `ADMIN_EXTEND_${days}D_${Date.now()}`,
          plan_price_current: 0,
          plan_price_standard: days >= 365 ? 250 : 50,
        });
        await logActivity('subscription_extended', { admin: user?.id, days, new_expiry: expiresAt.toISOString(), source: 'fresh_grant' });
        await writeAuditPlanChange('agent.subscription_extended', oldExpiry, expiresAt.toISOString(), { days, label, newStatus: 'active' });
        toast.success(`Extended +${days} days — expires ${expiresAt.toLocaleDateString()}`);
      } else {
        const baseDate = new Date(Math.max(now.getTime(), new Date(subscription.expiry_date).getTime()));
        const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
        await supabase.from('agent_subscriptions' as any).update({
          status: 'active',
          expiry_date: newExpiry.toISOString(),
          next_billing_date: newExpiry.toISOString(),
        }).eq('id', subscription.id);
        // If agent.status was 'active' but sub had expired, no agent.status change needed.
        // If agent was suspended, leave it — admin must explicitly Reactivate.
        await logActivity('subscription_extended', { admin: user?.id, days, new_expiry: newExpiry.toISOString() });
        await writeAuditPlanChange('agent.subscription_extended', oldExpiry, newExpiry.toISOString(), { days, label });
        toast.success(`${label} — new expiry ${newExpiry.toLocaleDateString()}`);
      }
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  const setCustomExpiry = async () => {
    if (!agent || !customExpiryDate) {
      toast.error('Pick a date');
      return;
    }
    const newExpiry = new Date(customExpiryDate);
    if (Number.isNaN(newExpiry.getTime())) { toast.error('Invalid date'); return; }
    setProcessing(true);
    try {
      const now = new Date();
      const oldExpiry = subscription?.expiry_date ?? null;
      if (subscription) {
        const isFuture = newExpiry > now;
        await supabase.from('agent_subscriptions' as any).update({
          status: isFuture ? 'active' : 'expired',
          expiry_date: newExpiry.toISOString(),
          next_billing_date: newExpiry.toISOString(),
        }).eq('id', subscription.id);
      } else {
        await supabase.from('agents').update({
          status: 'active',
          activation_paid: true,
          activation_paid_at: agent.activation_paid_at || now.toISOString(),
          activation_reference: agent.activation_reference || 'ADMIN_GRANT',
          agent_approved_at: agent.agent_approved_at || now.toISOString(),
        } as any).eq('id', agentId!);
        await supabase.from('agent_subscriptions' as any).insert({
          agent_id: agentId!,
          status: newExpiry > now ? 'active' : 'expired',
          paid_at: now.toISOString(),
          expiry_date: newExpiry.toISOString(),
          next_billing_date: newExpiry.toISOString(),
          paystack_reference: `ADMIN_CUSTOM_${Date.now()}`,
          plan_price_current: 0,
          plan_price_standard: 50,
        });
      }
      await logActivity('subscription_custom_expiry', { admin: user?.id, new_expiry: newExpiry.toISOString() });
      await writeAuditPlanChange('agent.subscription_custom_expiry', oldExpiry, newExpiry.toISOString());
      toast.success(`Custom expiry set: ${newExpiry.toLocaleString()}`);
      setCustomExpiryOpen(false);
      setCustomExpiryDate('');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  // ── Admin Promo Extension Tools ──
  const handleExtendPromo24h = async () => {
    if (!agent) return;
    if (agent.discount_extension_used) {
      toast.error('24h extension already used for this agent');
      return;
    }
    setProcessing(true);
    try {
      const currentExpiry = agent.discount_extended_until || agent.activation_discount_expires_at;
      const baseDate = currentExpiry ? new Date(currentExpiry) : new Date();
      const newExpiry = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);

      await supabase.from('agents').update({
        discount_extended_until: newExpiry.toISOString(),
        discount_extension_used: true,
      } as any).eq('id', agentId!);

      await logActivity('promo_extended_24h', { admin: user?.id, new_expiry: newExpiry.toISOString() });
      toast.success(`Promo extended to ${newExpiry.toLocaleString()}`);
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  const [customExtendHours, setCustomExtendHours] = useState('');
  const handleCustomExtendPromo = async () => {
    const hours = parseInt(customExtendHours);
    if (!hours || hours < 1) { toast.error('Enter valid hours'); return; }
    setProcessing(true);
    try {
      const newExpiry = new Date(Date.now() + hours * 60 * 60 * 1000);
      await supabase.from('agents').update({
        discount_extended_until: newExpiry.toISOString(),
      } as any).eq('id', agentId!);

      await logActivity('promo_custom_extended', { admin: user?.id, hours, new_expiry: newExpiry.toISOString() });
      toast.success(`Promo extended to ${newExpiry.toLocaleString()}`);
      setCustomExtendHours('');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim()) { toast.error('Reason required'); return; }
    setProcessing(true);
    try {
      const prevStatus = agent?.status ?? null;
      await supabase.from('agents').update({ status: 'suspended' }).eq('id', agentId!);
      await logActivity('agent_suspended', { reason: suspendReason, admin: user?.id });
      await auditLog({
        action: 'agent.suspended',
        entity_type: 'agent',
        entity_id: agentId!,
        changes: { status: { before: prevStatus, after: 'suspended' } },
        metadata: { reason: suspendReason, agent_user_id: agent?.user_id },
      });
      toast.success('Agent suspended');
      setSuspendDialog(false);
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  const handleReactivate = async () => {
    setProcessing(true);
    try {
      const prevStatus = agent?.status ?? null;
      await supabase.from('agents').update({ status: 'active' }).eq('id', agentId!);
      await logActivity('agent_reactivated', { admin: user?.id });
      await auditLog({
        action: 'agent.reactivated',
        entity_type: 'agent',
        entity_id: agentId!,
        changes: { status: { before: prevStatus, after: 'active' } },
        metadata: { agent_user_id: agent?.user_id },
      });
      toast.success('Agent reactivated');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  const handleWalletAdjust = async () => {
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0 || !adjustReason.trim()) {
      toast.error('Valid amount and reason required');
      return;
    }
    setProcessing(true);
    try {
      const current = Number(wallet?.available_balance || 0);
      const newBalance = adjustDialog === 'credit' ? current + amount : Math.max(0, current - amount);

      await supabase.from('agent_wallets').update({
        available_balance: newBalance,
        ...(adjustDialog === 'credit' ? { total_earned: Number(wallet?.total_earned || 0) + amount } : {}),
      }).eq('agent_id', agentId!);

      await (supabase.from('agent_wallet_transactions' as any) as any).insert({
        agent_id: agentId,
        type: adjustDialog === 'credit' ? 'admin_credit' : 'admin_debit',
        amount_ghs: amount,
        description: `Admin ${adjustDialog}: ${adjustReason}`,
        reference: `admin-${Date.now()}`,
      });

      await logActivity('wallet_adjustment', { type: adjustDialog, amount, reason: adjustReason, admin: user?.id });
      toast.success(`Wallet ${adjustDialog}ed: GHS ${amount.toFixed(2)}`);
      setAdjustDialog(null);
      setAdjustAmount('');
      setAdjustReason('');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  const handleWithdrawalAction = async (wId: string, action: 'approved' | 'paid' | 'rejected', amount: number) => {
    setProcessing(true);
    try {
      await (supabase.from('agent_withdrawals') as any).update({
        status: action,
        processed_by: user?.id,
        processed_at: new Date().toISOString(),
      }).eq('id', wId);

      if (action === 'paid' && wallet) {
        await supabase.from('agent_wallets').update({
          available_balance: Math.max(0, Number(wallet.available_balance) - amount),
          total_withdrawn: Number(wallet.total_withdrawn) + amount,
        }).eq('id', wallet.id);

        await (supabase.from('agent_wallet_transactions' as any) as any).insert({
          agent_id: agentId,
          type: 'withdrawal',
          amount_ghs: amount,
          description: 'Withdrawal paid',
          reference: wId,
        });
      }

      await logActivity(`withdrawal_${action}`, { withdrawal_id: wId, amount, admin: user?.id });
      toast.success(`Withdrawal ${action}`);
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(false); }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      </AdminLayout>
    );
  }

  if (!agent) {
    return (
      <AdminLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Agent not found</p>
          <Button variant="outline" className="mt-4" asChild><Link to="/admin/agents/list">Back to Directory</Link></Button>
        </div>
      </AdminLayout>
    );
  }

  // Derived stats use TRUE totals (from count/aggregate queries), not the
  // recent-50 list. `orders` (recent list) is still used for the table render.
  const deliveredOrdersCount = agentTotals.deliveredOrders;
  const failedOrdersCount = agentTotals.failedOrders;
  const totalOrdersCount = agentTotals.totalOrders;
  const totalRevenue = agentTotals.totalRevenue;
  const totalProfit = agentTotals.totalProfit;
  const failRate = totalOrdersCount > 0 ? ((failedOrdersCount / totalOrdersCount) * 100).toFixed(1) : '0';

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/agents/list"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{agent.store_name}</h1>
                {(() => {
                  const esHeaderLabels: Record<string, { label: string; color: string }> = {
                    active: { label: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
                    expiring_soon: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
                    grace_period: { label: 'Grace Period', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
                    expired_promo: { label: 'Expired Promo', color: 'bg-destructive/10 text-destructive' },
                    expired_standard: { label: 'Expired', color: 'bg-destructive/10 text-destructive' },
                    approved_awaiting_activation: { label: 'Awaiting Activation', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
                    pending_review: { label: 'Pending Review', color: 'bg-muted text-muted-foreground' },
                    suspended: { label: 'Suspended', color: 'bg-destructive/10 text-destructive' },
                  };
                  const esKey = agent.status === 'suspended' ? 'suspended' : effectiveState?.effective_state || 'unknown';
                  const cfg = esHeaderLabels[esKey] || { label: 'Unknown', color: 'bg-muted text-muted-foreground' };
                  return (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>
              <p className="text-sm text-muted-foreground">{agent.store_slug} · {agent.region}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" className="text-green-600"
                    disabled={!normalizeGhanaWhatsApp(agent.whatsapp_number)}
                    onClick={() => openAgentWhatsApp(agent.whatsapp_number, agent.store_name, agent.store_name)}>
                    <MessageSquare className="w-4 h-4 mr-1" /> WhatsApp
                  </Button>
                </TooltipTrigger>
                {!normalizeGhanaWhatsApp(agent.whatsapp_number) && <TooltipContent>No WhatsApp number provided</TooltipContent>}
              </Tooltip>
            </TooltipProvider>
            <Button size="sm" variant="outline" onClick={async () => {
              const ok = await copyAgentApprovalMessage(agent.store_name, agent.store_name);
              if (ok) toast.success('Message copied!');
            }}>
              <Copy className="w-4 h-4 mr-1" /> Copy Message
            </Button>
            {agent.status === 'active' && (
              <>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/store/${agent.store_slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" /> View Store
                  </a>
                </Button>
                <Button size="sm" variant="destructive" onClick={() => { setSuspendDialog(true); setSuspendReason(''); }} disabled={processing}>
                  <Ban className="w-4 h-4 mr-1" /> Suspend
                </Button>
              </>
            )}
            {agent.status === 'approved' && (
              <Button size="sm" onClick={handleActivate} disabled={processing}>
                <Power className="w-4 h-4 mr-1" /> Activate
              </Button>
            )}
            {agent.status === 'suspended' && (
              <Button size="sm" onClick={handleReactivate} disabled={processing}>
                <CheckCircle className="w-4 h-4 mr-1" /> Reactivate
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="card-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider">Wallet</span></div>
              <p className="text-lg font-display font-bold">{formatPrice(Number(wallet?.available_balance || 0))}</p>
            </CardContent>
          </Card>
          <Card className="card-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><ShoppingCart className="w-4 h-4 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider">Orders</span></div>
              <p className="text-lg font-display font-bold">{formatCount(totalOrdersCount)}</p>
            </CardContent>
          </Card>
          <Card className="card-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue</span></div>
              <p className="text-lg font-display font-bold">{formatPrice(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card className="card-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-success" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit</span></div>
              <p className="text-lg font-display font-bold text-success">{formatPrice(totalProfit)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="subscription">
          <TabsList className="flex-wrap">
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
            <TabsTrigger value="store">Store Info</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="profit-debug">Profit Debug</TabsTrigger>
          </TabsList>

          {/* Subscription Status Tab */}
          <TabsContent value="subscription" className="mt-4 space-y-4">
            <Card className="card-shadow">
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" /> Subscription Status
                </h3>
                {effectiveState ? (() => {
                  const es = effectiveState;
                  const stateLabels: Record<string, { label: string; color: string; icon: any; note: string }> = {
                    active: { label: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle, note: 'Store active, all features available' },
                    expiring_soon: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Timer, note: 'Store active, renewal recommended' },
                    grace_period: { label: 'Grace Period', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock, note: 'Store still active temporarily' },
                    expired_promo: { label: 'Expired (Promo Window)', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle, note: 'Store inactive, promo renewal window active' },
                    expired_standard: { label: 'Expired', color: 'bg-destructive/10 text-destructive', icon: XCircle, note: 'Store inactive, standard renewal pricing only' },
                    approved_awaiting_activation: { label: 'Awaiting Activation', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Hourglass, note: 'Approved but not yet activated' },
                    pending_review: { label: 'Pending Review', color: 'bg-muted text-muted-foreground', icon: Clock, note: 'Application under review' },
                  };
                  const cfg = stateLabels[es.effective_state] || { label: es.effective_state, color: 'bg-muted text-muted-foreground', icon: XCircle, note: 'Unknown state — needs review' };
                  const StateIcon = cfg.icon;

                  return (
                    <div className="space-y-4">
                      {/* State badge + note */}
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cfg.color}`}>
                          <StateIcon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground italic">{cfg.note}</span>
                      </div>

                      {/* Detail grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Current Plan</p>
                          <p className="font-semibold">{subscription?.plan_price_standard === 250 ? 'Yearly' : subscription?.plan_price_standard === 50 ? 'Monthly' : subscription ? 'Custom' : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Current Price Paid</p>
                          <p className="font-semibold">{subscription ? `GHS ${Number(subscription.plan_price_current).toFixed(2)}` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Standard Price</p>
                          <p className="font-semibold">{subscription ? `GHS ${Number(subscription.plan_price_standard).toFixed(2)}` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Expiry Date</p>
                          <p className="font-semibold">{es.expiry_date ? format(new Date(es.expiry_date), 'dd MMM yyyy, HH:mm') : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Time Remaining</p>
                          <p className="font-semibold">
                            {es.expiry_date && ['active', 'expiring_soon'].includes(es.effective_state)
                              ? `${es.days_remaining}d ${es.hours_remaining % 24}h`
                              : es.effective_state === 'grace_period'
                              ? `Grace: ${es.hours_remaining}h left`
                              : es.effective_state === 'expired_promo'
                              ? `Promo: ${es.hours_remaining}h left`
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Grace Period Ends</p>
                          <p className="font-semibold">{es.grace_end ? format(new Date(es.grace_end), 'dd MMM yyyy, HH:mm') : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Promo Window Ends</p>
                          <p className="font-semibold">{es.promo_end ? format(new Date(es.promo_end), 'dd MMM yyyy, HH:mm') : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Subscription Status</p>
                          <p className="font-semibold">{subscription?.status || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Paid At</p>
                          <p className="font-semibold">{subscription?.paid_at ? format(new Date(subscription.paid_at), 'dd MMM yyyy, HH:mm') : '—'}</p>
                        </div>
                      </div>

                      {/* Capabilities */}
                      <div className="pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2 font-medium">Current Capabilities</p>
                        <div className="flex gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs">Store Checkout:</span>
                            <span className={`text-xs font-semibold ${es.can_store_accept_orders ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                              {es.can_store_accept_orders ? 'Allowed' : 'Blocked'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs">Bulk Orders:</span>
                            <span className={`text-xs font-semibold ${es.can_use_bulk_orders ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                              {es.can_use_bulk_orders ? 'Allowed' : 'Blocked'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs">Agent Pricing:</span>
                            <span className={`text-xs font-semibold ${es.has_agent_pricing ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                              {es.has_agent_pricing ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-sm text-muted-foreground">Unable to determine subscription state.</p>
                )}
              </CardContent>
            </Card>

            {isAdmin && (
              <Card className="card-shadow border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Power className="w-4 h-4 text-primary" /> Admin Plan Actions
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Grant or extend a plan without Paystack. Admin grants are tagged
                      <span className="font-mono"> ADMIN_GRANT </span>and audit-logged. Use this to reactivate
                      expired agents — they will not need first-time activation again.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <Button size="sm" onClick={() => grantPlan('monthly')} disabled={processing}>
                      Activate Monthly (30d)
                    </Button>
                    <Button size="sm" onClick={() => grantPlan('yearly')} disabled={processing}>
                      Activate Yearly (365d)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => extendSubscription(30, 'Extended +30 days')} disabled={processing}>
                      Extend +30 days
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => extendSubscription(365, 'Extended +365 days')} disabled={processing}>
                      Extend +365 days
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setCustomExpiryOpen(true); setCustomExpiryDate(''); }} disabled={processing}>
                      Set Custom Expiry…
                    </Button>
                    {agent.status === 'active' ? (
                      <Button size="sm" variant="destructive" onClick={() => { setSuspendDialog(true); setSuspendReason(''); }} disabled={processing}>
                        Deactivate Store
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={handleReactivate} disabled={processing || agent.status === 'pending_review' || agent.status === 'rejected'}>
                        Reactivate Store
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="mt-4">
            <Card className="card-shadow">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                   <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Order ID</th>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Network</th>
                      <th className="px-4 py-3 font-medium text-right">Customer Paid</th>
                      <th className="px-4 py-3 font-medium text-right hidden md:table-cell">DS Base</th>
                      <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Agent Profit</th>
                      <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">DS Profit</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Date</th>
                    </tr></thead>
                    <tbody>
                      {orders.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No orders yet</td></tr>
                      ) : orders.map(o => {
                        // agent_cost_price = DataSika Agent Base Price (snapshot at purchase)
                        const dsBasePrice = Number(o.agent_cost_price || 0);
                        const agentProfit = Number(o.profit_ghs || 0);
                        // DataSika profit is not stored on agent_orders yet — show N/A
                        // Future: supplier_cost_at_purchase field would enable this
                        return (
                        <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 font-mono text-xs">{o.order_id}</td>
                          <td className="px-4 py-3 text-xs">{o.customer_phone}</td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs">{o.network} {o.bundle_size_gb}GB</td>
                          <td className="px-4 py-3 text-right font-medium text-xs">{formatPrice(Number(o.agent_selling_price))}</td>
                          <td className="px-4 py-3 text-right hidden md:table-cell text-xs text-muted-foreground">{dsBasePrice > 0 ? formatPrice(dsBasePrice) : '—'}</td>
                          <td className="px-4 py-3 text-right hidden md:table-cell text-xs font-semibold text-success">{formatPrice(agentProfit)}</td>
                          <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-muted-foreground">
                            {dsBasePrice > 0 ? (
                              <span title="DataSika profit = DS Base − Supplier Cost. Supplier cost not stored per order.">
                                <span className="text-amber-500">N/A*</span>
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              o.status === 'delivered' || o.status === 'Delivered' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              o.status === 'failed' || o.status === 'Failed' ? 'bg-destructive/10 text-destructive' :
                              'bg-primary/15 text-primary'
                            }`}>{o.status}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                            {format(new Date(o.created_at), 'dd MMM, HH:mm')}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t bg-muted/20">
                  <p className="text-[10px] text-muted-foreground">
                    * <strong>DS Base</strong> = DataSika Agent Base Price (snapshot). <strong>Agent Profit</strong> = Customer Paid − DS Base. <strong>DS Profit</strong> = DS Base − Supplier Cost (will show once per-order supplier cost is stored).
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Financial Tab */}
          <TabsContent value="financial" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Available Balance</p>
                <p className="text-lg font-bold">{formatPrice(Number(wallet?.available_balance || 0))}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Earned</p>
                <p className="text-lg font-bold">{formatPrice(Number(wallet?.total_earned || 0))}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Withdrawn</p>
                <p className="text-lg font-bold">{formatPrice(Number(wallet?.total_withdrawn || 0))}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Pending Balance</p>
                <p className="text-lg font-bold">{formatPrice(Number(wallet?.pending_balance || 0))}</p>
              </CardContent></Card>
            </div>

            {isAdmin && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setAdjustDialog('credit'); setAdjustAmount(''); setAdjustReason(''); }}>
                  <CreditCard className="w-4 h-4 mr-1" /> Credit Wallet
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAdjustDialog('debit'); setAdjustAmount(''); setAdjustReason(''); }}>
                  <CreditCard className="w-4 h-4 mr-1" /> Debit Wallet
                </Button>
              </div>
            )}
            {!isAdmin && (
              <p className="text-xs text-muted-foreground italic">Wallet adjustments are admin-only.</p>
            )}
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals" className="mt-4">
            <Card className="card-shadow">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">MoMo</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Date</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr></thead>
                    <tbody>
                      {withdrawals.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No withdrawals</td></tr>
                      ) : withdrawals.map(w => (
                        <tr key={w.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{formatPrice(Number(w.amount_ghs))}</td>
                          <td className="px-4 py-3 text-xs">{w.momo_network} {w.momo_number}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              w.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              w.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                              w.status === 'approved' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                              'bg-primary/15 text-primary'
                            }`}>{w.status}</span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                            {format(new Date(w.created_at), 'dd MMM, HH:mm')}
                          </td>
                          <td className="px-4 py-3">
                            {w.status === 'pending' && isAdmin && (
                              <div className="flex gap-1">
                                <Button size="sm" onClick={() => handleWithdrawalAction(w.id, 'approved', Number(w.amount_ghs))} disabled={processing}>Approve</Button>
                                <Button size="sm" variant="destructive" onClick={() => handleWithdrawalAction(w.id, 'rejected', Number(w.amount_ghs))} disabled={processing}>Reject</Button>
                              </div>
                            )}
                            {w.status === 'pending' && !isAdmin && (
                              <span className="text-[10px] text-muted-foreground italic">Admin only</span>
                            )}
                            {w.status === 'approved' && isAdmin && (
                              <Button size="sm" onClick={() => handleWithdrawalAction(w.id, 'paid', Number(w.amount_ghs))} disabled={processing}>Mark Paid</Button>
                            )}
                            {w.status === 'approved' && !isAdmin && (
                              <span className="text-[10px] text-muted-foreground italic">Admin only</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Store Info Tab */}
          <TabsContent value="store" className="mt-4 space-y-4">
            <Card className="card-shadow">
              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Store Name</p><p className="font-semibold">{agent.store_name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Store Slug</p><p className="font-mono text-xs">{agent.store_slug}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p>{agent.store_email}</p></div>
                  <div><p className="text-xs text-muted-foreground">WhatsApp</p><p>{agent.whatsapp_number}</p></div>
                  <div><p className="text-xs text-muted-foreground">Region</p><p>{agent.region}</p></div>
                  <div><p className="text-xs text-muted-foreground">Activation Paid</p><p>{agent.activation_paid ? `✅ ${agent.activation_paid_at ? format(new Date(agent.activation_paid_at), 'dd MMM yyyy') : ''}` : '❌ Not paid'}</p></div>
                </div>
                <div><p className="text-xs text-muted-foreground">Description</p><p className="text-sm">{agent.store_description}</p></div>
                {agent.status === 'active' && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Store Link</p>
                    <a href={`/store/${agent.store_slug}`} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline flex items-center gap-1">
                      /store/{agent.store_slug} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Promo Extension Tools (Admin Only) */}
            {isAdmin && (agent.status === 'approved' || agent.activation_discount_expires_at) && (
              <Card className="card-shadow border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Promo Discount Window
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Approved At</p>
                      <p className="font-medium">{agent.agent_approved_at ? format(new Date(agent.agent_approved_at), 'dd MMM yyyy HH:mm') : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Promo Expires</p>
                      <p className="font-medium">
                        {(agent.discount_extended_until || agent.activation_discount_expires_at)
                          ? format(new Date(agent.discount_extended_until || agent.activation_discount_expires_at), 'dd MMM yyyy HH:mm')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">24h Extension Used</p>
                      <p>{agent.discount_extension_used ? '✅ Yes' : '❌ No'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Promo Active</p>
                      <p>{(() => {
                        const eff = agent.discount_extended_until || agent.activation_discount_expires_at;
                        return eff && new Date(eff) > new Date() && agent.status === 'approved' ? '🟢 Yes' : '🔴 No';
                      })()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                    <Button size="sm" variant="outline" onClick={handleExtendPromo24h} disabled={processing || agent.discount_extension_used}>
                      +24h Extension {agent.discount_extension_used ? '(Used)' : ''}
                    </Button>
                    <div className="flex gap-1 items-center">
                      <Input
                        type="number"
                        placeholder="Hours"
                        value={customExtendHours}
                        onChange={(e) => setCustomExtendHours(e.target.value)}
                        className="w-20 h-8 text-xs"
                      />
                      <Button size="sm" variant="outline" onClick={handleCustomExtendPromo} disabled={processing}>
                        Custom Extend
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {application && (
              <Card className="card-shadow">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-sm">Application Details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Full Name</p><p>{application.full_name}</p></div>
                    <div><p className="text-xs text-muted-foreground">Phone</p><p>{application.personal_phone}</p></div>
                    <div><p className="text-xs text-muted-foreground">Selling Method</p><p>{application.selling_method}</p></div>
                    <div><p className="text-xs text-muted-foreground">Expected Customers</p><p>{application.expected_customers}</p></div>
                    <div><p className="text-xs text-muted-foreground">Sold Before</p><p>{application.sold_before ? 'Yes' : 'No'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Referral</p><p>{application.referral_source || '—'}</p></div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="card-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className={`w-4 h-4 ${Number(failRate) > 20 ? 'text-destructive' : 'text-muted-foreground'}`} />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Failure Rate</span>
                  </div>
                  <p className={`text-2xl font-bold ${Number(failRate) > 20 ? 'text-destructive' : ''}`}>{failRate}%</p>
                  <p className="text-xs text-muted-foreground">{formatCount(failedOrdersCount)} failed of {formatCount(totalOrdersCount)} total</p>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Member Since</span>
                  </div>
                  <p className="text-sm font-semibold">{format(new Date(agent.created_at), 'dd MMM yyyy')}</p>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Agreements</span>
                  </div>
                  {application ? (
                    <div className="space-y-0.5 text-xs">
                      <p>{application.agreed_no_scam ? '✅' : '❌'} No scam</p>
                      <p>{application.agreed_min_price ? '✅' : '❌'} Min price</p>
                      <p>{application.agreed_suspension ? '✅' : '❌'} Suspension</p>
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No application data</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="mt-4">
            <Card className="card-shadow">
              <CardContent className="p-4">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity logged yet</p>
                ) : (
                  <div className="space-y-3">
                    {activity.map((log: any) => (
                      <div key={log.id} className="flex items-start gap-3 text-sm border-b border-border pb-3 last:border-0">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs">{log.event_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                          {log.meta && Object.keys(log.meta).length > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{JSON.stringify(log.meta)}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profit Debug Tab */}
          <TabsContent value="profit-debug" className="mt-4 space-y-4">
            <AgentProfitDebugPanel agentId={agentId!} wallet={wallet} orders={orders} />
          </TabsContent>
        </Tabs>

        {/* Suspend Dialog */}
        <Dialog open={suspendDialog} onOpenChange={setSuspendDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Suspend Agent</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">This will take <strong>{agent.store_name}</strong>'s store offline immediately.</p>
              <Textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason for suspension (required)..." rows={4} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSuspendDialog(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleSuspend} disabled={!suspendReason.trim() || processing}>Confirm Suspend</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Wallet Adjustment Dialog */}
        <Dialog open={!!adjustDialog} onOpenChange={() => setAdjustDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{adjustDialog === 'credit' ? 'Credit' : 'Debit'} Agent Wallet</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Current balance: {formatPrice(Number(wallet?.available_balance || 0))}</p>
              <Input type="number" placeholder="Amount (GHS)" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} min="0.01" step="0.01" />
              <Textarea value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="Reason for adjustment (required, logged in audit)..." rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdjustDialog(null)}>Cancel</Button>
              <Button onClick={handleWalletAdjust} disabled={!adjustAmount || !adjustReason.trim() || processing}>
                Confirm {adjustDialog === 'credit' ? 'Credit' : 'Debit'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Custom Expiry Dialog */}
        <Dialog open={customExpiryOpen} onOpenChange={setCustomExpiryOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Set Custom Subscription Expiry</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Set an exact expiry date/time for <strong>{agent.store_name}</strong>'s subscription.
                Picking a future date keeps the store active; a past date marks it expired.
                This action is audit-logged.
              </p>
              <Input
                type="datetime-local"
                value={customExpiryDate}
                onChange={e => setCustomExpiryDate(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCustomExpiryOpen(false)}>Cancel</Button>
              <Button onClick={setCustomExpiry} disabled={!customExpiryDate || processing}>Save Expiry</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminAgentProfile;
