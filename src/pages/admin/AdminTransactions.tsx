import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  Search, RefreshCw, Download, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Eye, Loader2, LifeBuoy, Copy, Zap, Activity,
  Phone, PackagePlus, ShieldAlert
} from 'lucide-react';
import { format } from 'date-fns';

interface PaystackTx {
  id: string;
  reference: string;
  paystack_id: number | null;
  status: string;
  channel: string | null;
  currency: string;
  amount: number;
  fees: number | null;
  paid_at: string | null;
  created_at: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  authorization_brand: string | null;
  authorization_last4: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
  purpose: string | null;
  linked_user_id: string | null;
  linked_order_id: string | null;
  linked_deposit_id: string | null;
  linked_agent_subscription_id: string | null;
  reconciliation_status: string;
  reconciliation_reason: string | null;
  last_checked_at: string | null;
}

interface SyncRun {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  range: string | null;
  fetched_count: number;
  upserted_count: number;
  already_existed_count: number;
  errors: unknown[];
  debug: Record<string, unknown>;
}

interface PaymentIntent {
  id: string;
  paystack_reference: string;
  payment_status: string;
  order_type: string;
  user_id: string | null;
  agent_id: string | null;
  store_id: string | null;
  recipient_number: string;
  network: string;
  bundle_id: string | null;
  bundle_size_gb: number;
  expected_amount: number;
  guest_email: string | null;
  order_created: boolean;
  order_id: string | null;
  created_at: string;
}

interface ResolvedOrderLink {
  orderId: string;
  rowId: string;
  table: 'orders' | 'agent_orders';
  context: 'normal_order' | 'agent_store_order';
  status: string | null;
  paystackReference: string | null;
}

const PAGE_SIZE = 50;

const statusColors: Record<string, string> = {
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
  abandoned: 'bg-muted text-muted-foreground border-border',
  reversed: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
};

const reconColors: Record<string, string> = {
  unreviewed: 'bg-muted text-muted-foreground',
  flagged: 'bg-destructive/10 text-destructive',
  resolved: 'bg-emerald-500/10 text-emerald-600',
};

const AdminTransactions = () => {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || searchParams.get('phone') || '';
  const [txns, setTxns] = useState<PaystackTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('all');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [reconFilter, setReconFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedTx, setSelectedTx] = useState<PaystackTx | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncHours, setSyncHours] = useState('24');
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketNote, setTicketNote] = useState('');
  const [ticketIssueType, setTicketIssueType] = useState('order_not_created');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [lastSyncRun, setLastSyncRun] = useState<SyncRun | null>(null);
  const [testPulling, setTestPulling] = useState(false);
  const [debugRefs, setDebugRefs] = useState<string[]>([]);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [orderFormData, setOrderFormData] = useState({ recipient_phone: '', network: 'MTN', bundle_size_gb: '1', product_id: '' });
  // Intent-based recovery
  const [selectedIntent, setSelectedIntent] = useState<PaymentIntent | null>(null);
  const [intentConfirmOpen, setIntentConfirmOpen] = useState(false);
  const [recoveringIntent, setRecoveringIntent] = useState(false);
  const [resolvedOrderLink, setResolvedOrderLink] = useState<ResolvedOrderLink | null>(null);
  const [resolvingOrderLink, setResolvingOrderLink] = useState(false);
  // Recipient search results from payment_intents
  const [intentSearchResults, setIntentSearchResults] = useState<string[]>([]);

  const resolveOrderLinkage = useCallback(async (tx: Pick<PaystackTx, 'reference' | 'linked_order_id'>) => {
    const normalFilters = [`paystack_reference.eq.${tx.reference}`];
    const agentFilters = [`paystack_reference.eq.${tx.reference}`];

    if (tx.linked_order_id) {
      normalFilters.push(`order_id.eq.${tx.linked_order_id}`);
      agentFilters.push(`order_id.eq.${tx.linked_order_id}`);
    }

    const [normalRes, agentRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_id, status, paystack_reference')
        .or(normalFilters.join(','))
        .limit(1)
        .maybeSingle(),
      supabase
        .from('agent_orders')
        .select('id, order_id, status, paystack_reference')
        .or(agentFilters.join(','))
        .limit(1)
        .maybeSingle(),
    ]);

    if (agentRes.data) {
      return {
        orderId: agentRes.data.order_id,
        rowId: agentRes.data.id,
        table: 'agent_orders',
        context: 'agent_store_order',
        status: agentRes.data.status,
        paystackReference: agentRes.data.paystack_reference,
      } satisfies ResolvedOrderLink;
    }

    if (normalRes.data) {
      return {
        orderId: normalRes.data.order_id,
        rowId: normalRes.data.id,
        table: 'orders',
        context: 'normal_order',
        status: normalRes.data.status,
        paystackReference: normalRes.data.paystack_reference,
      } satisfies ResolvedOrderLink;
    }

    return null;
  }, []);

  const syncTransactionLink = useCallback(async (tx: PaystackTx, resolved: ResolvedOrderLink) => {
    const needsUpdate = tx.linked_order_id !== resolved.orderId || tx.reconciliation_status !== 'resolved' || tx.reconciliation_reason;
    if (!needsUpdate) return;

    await supabase
      .from('paystack_transactions' as any)
      .update({
        linked_order_id: resolved.orderId,
        reconciliation_status: 'resolved',
        reconciliation_reason: null,
        last_checked_at: new Date().toISOString(),
      })
      .eq('id', tx.id);
  }, []);

  const orderContextLabel = useCallback((context: ResolvedOrderLink['context'] | PaymentIntent['order_type'] | null | undefined) => {
    if (context === 'agent_store_order' || context === 'agent') return 'Agent store order';
    if (context === 'normal_order' || context === 'user') return 'Normal order';
    if (context === 'deposit') return 'Deposit';
    if (context === 'subscription' || context === 'agent_subscription') return 'Subscription';
    return context || '—';
  }, []);

  const fetchLastSyncRun = useCallback(async () => {
    const { data } = await supabase
      .from('paystack_sync_runs' as any)
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) setLastSyncRun(data[0] as unknown as SyncRun);
  }, []);

  const fetchTxns = useCallback(async () => {
    setLoading(true);

    const buildQuery = () => {
      // Select only needed columns — exclude heavy 'raw' JSONB unless viewing detail
      let query = supabase
        .from('paystack_transactions' as any)
        .select('id, reference, paystack_id, status, channel, currency, amount, fees, paid_at, created_at, customer_email, customer_phone, customer_name, authorization_brand, authorization_last4, ip_address, metadata, purpose, linked_user_id, linked_order_id, linked_deposit_id, linked_agent_subscription_id, reconciliation_status, reconciliation_reason, last_checked_at', { count: 'exact' });

      if (search.trim()) {
        const q = search.trim();
        query = query.or(`reference.ilike.%${q}%,customer_email.ilike.%${q}%,customer_phone.ilike.%${q}%,reconciliation_reason.ilike.%${q}%`);
      }

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (purposeFilter !== 'all') query = query.eq('purpose', purposeFilter);
      if (reconFilter !== 'all') query = query.eq('reconciliation_status', reconFilter);

      query = query
        .order('paid_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return query;
    };

    const { data, count, error } = await buildQuery();
    if (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to load transactions');
    }

    let txnResults = (data || []) as unknown as PaystackTx[];

    // If search is active and few/no results from transactions, also search payment_intents by recipient_number
    if (search.trim() && txnResults.length < 5) {
      const q = search.trim();
      const { data: intents } = await supabase
        .from('payment_intents' as any)
        .select('paystack_reference')
        .ilike('recipient_number', `%${q}%`)
        .limit(20);
      
      if (intents && intents.length > 0) {
        const refs = (intents as any[]).map(i => i.paystack_reference);
        setIntentSearchResults(refs);
        // Find any txns matching these refs not already in results
        const existingRefs = new Set(txnResults.map(t => t.reference));
        const missingRefs = refs.filter((r: string) => !existingRefs.has(r));
        if (missingRefs.length > 0) {
          const { data: extraTxns } = await supabase
            .from('paystack_transactions' as any)
            .select('*')
            .in('reference', missingRefs)
            .limit(20);
          if (extraTxns) {
            txnResults = [...txnResults, ...(extraTxns as unknown as PaystackTx[])];
          }
        }
      } else {
        setIntentSearchResults([]);
      }
    } else {
      setIntentSearchResults([]);
    }

    setTxns(txnResults);
    setTotal(count || txnResults.length);

    // Debug refs — skip on normal loads, only fetch when needed
    // (removed automatic debug fetch to reduce queries)

    setLoading(false);
  }, [page, statusFilter, purposeFilter, reconFilter, search, isAdmin]);

  useEffect(() => { fetchTxns(); fetchLastSyncRun(); }, [fetchTxns, fetchLastSyncRun]);

  // Fetch intent for selected transaction
  const fetchIntentForTx = useCallback(async (reference: string) => {
    const { data } = await supabase
      .from('payment_intents' as any)
      .select('*')
      .eq('paystack_reference', reference)
      .maybeSingle();
    setSelectedIntent(data as unknown as PaymentIntent | null);
  }, []);

  useEffect(() => {
    if (selectedTx) {
      fetchIntentForTx(selectedTx.reference);
    } else {
      setSelectedIntent(null);
    }
  }, [selectedTx, fetchIntentForTx]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!selectedTx) {
        setResolvedOrderLink(null);
        return;
      }

      setResolvingOrderLink(true);
      const resolved = await resolveOrderLinkage(selectedTx);
      if (!active) return;
      setResolvedOrderLink(resolved);
      setResolvingOrderLink(false);

      if (resolved) {
        await syncTransactionLink(selectedTx, resolved);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [selectedTx, resolveOrderLinkage, syncTransactionLink]);

  // CRITICAL: "order created" must be based on REAL row existence only, not metadata/intent fields
  const effectiveOrderLink = useMemo(() => resolvedOrderLink?.orderId || null, [resolvedOrderLink]);
  const hasExistingOrder = Boolean(resolvedOrderLink);

  const handleSync = async () => {
    setSyncing(true);
    setSyncDialogOpen(false);
    try {
      const hoursVal = Number(syncHours) || 24;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = (await supabase.auth.getSession()).data.session;
      const fnUrl = `https://${projectId}.supabase.co/functions/v1/paystack-sync-transactions`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      
      const response = await fetch(fnUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ hours: hoursVal }),
      });
      clearTimeout(timeout);
      
      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Sync failed (HTTP ${response.status}): ${errBody.slice(0, 200) || response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Sync failed');
      toast.success(`Synced: ${result.fetched} fetched, ${result.upserted} new, ${result.existed} existing. ${result.intents_linked || 0} intents linked. ${result.reconciliation?.casesCreated || 0} new cases.`);
      fetchTxns();
      fetchLastSyncRun();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.error('Sync timed out — check Last Sync status for results.');
      } else {
        toast.error(err.message || 'Sync failed');
      }
      fetchLastSyncRun();
    } finally {
      setSyncing(false);
    }
  };

  const handleTestPull = async () => {
    setTestPulling(true);
    try {
      const { data, error } = await supabase.functions.invoke('paystack-sync-transactions', {
        body: { hours: 168, test_only: true },
      });
      if (error) throw error;
      const result = data as any;
      if (result.ok) {
        toast.success(`Test Pull OK: HTTP ${result.http_status}, ${result.records_returned} records. Refs: ${(result.sample_refs || []).join(', ') || 'none'}`);
      } else {
        toast.error(`Test Pull failed: ${result.error}`);
      }
      fetchLastSyncRun();
    } catch (err: any) {
      toast.error(err.message || 'Test pull failed');
    } finally {
      setTestPulling(false);
    }
  };

  const formatAmount = (pesewas: number) => `GHS ${(pesewas / 100).toFixed(2)}`;

  const handleCreateTicket = async () => {
    if (!selectedTx) return;
    setCreatingTicket(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('admin_support_tickets' as any).insert({
        created_by: user.id,
        issue_type: ticketIssueType,
        status: 'new',
        notes: ticketNote || `Transaction investigation: ${selectedTx.reference}`,
        customer_email: selectedTx.customer_email,
        customer_phone: selectedTx.customer_phone,
        linked_transaction_reference: selectedTx.reference,
        reference_type: 'payment_investigation',
        reference_value: selectedTx.reference,
        ticket_metadata: {
          transaction_reference: selectedTx.reference,
          amount_pesewas: selectedTx.amount,
          amount_ghs: selectedTx.amount / 100,
          purpose: selectedTx.purpose,
          status: selectedTx.status,
          reconciliation_status: selectedTx.reconciliation_status,
          reconciliation_reason: selectedTx.reconciliation_reason,
        },
      });

      if (error) throw error;
      toast.success('Support ticket created');
      setTicketDialogOpen(false);
      setTicketNote('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create ticket');
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleResolveAsNotIssue = async (tx: PaystackTx) => {
    const { error } = await supabase
      .from('paystack_transactions' as any)
      .update({ reconciliation_status: 'resolved', reconciliation_reason: null, last_checked_at: new Date().toISOString() })
      .eq('id', tx.id);
    if (error) {
      toast.error('Failed to update');
    } else {
      toast.success('Marked as resolved');
      fetchTxns();
      if (selectedTx?.id === tx.id) setSelectedTx({ ...tx, reconciliation_status: 'resolved', reconciliation_reason: null });
    }
  };

  // Intent-based order recovery
  const handleRecoverFromIntent = async () => {
    if (!selectedIntent || !selectedTx) return;
    setRecoveringIntent(true);
    try {
      const existingOrder = await resolveOrderLinkage(selectedTx);
      if (existingOrder) {
        await syncTransactionLink(selectedTx, existingOrder);
        setResolvedOrderLink(existingOrder);
        toast.info(`Order ${existingOrder.orderId} already exists — recovery blocked.`);
        setIntentConfirmOpen(false);
        fetchTxns();
        return;
      }

      const { data, error } = await supabase.functions.invoke('recover-intent-order', {
        body: { intent_id: selectedIntent.id },
      });
      if (error) {
        // Try to extract meaningful message from the error context
        let msg = 'Failed to recover order';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            msg = body?.error || body?.message || body?.detail || msg;
          } else if (typeof error.message === 'string' && error.message) {
            msg = error.message;
          }
        } catch { /* use default */ }
        throw new Error(msg);
      }
      if (data?.error === 'already_exists') {
        toast.info(data.message || 'Order already exists for this payment.');
        setIntentConfirmOpen(false);
        fetchTxns();
        if (selectedTx) fetchIntentForTx(selectedTx.reference);
        return;
      }
      if (!data?.success) throw new Error(data?.message || data?.error || data?.detail || 'Recovery failed');
      
      const supplierNote = data.supplier_success ? '' : ' (supplier dispatch may need retry)';
      toast.success(`Order ${data.order_id} created successfully${supplierNote}`);
      setIntentConfirmOpen(false);
      // Refresh the resolved order link to show the newly created order
      const newResolved = await resolveOrderLinkage(selectedTx);
      if (newResolved) {
        setResolvedOrderLink(newResolved);
        await syncTransactionLink(selectedTx, newResolved);
      }
      fetchIntentForTx(selectedTx.reference);
      fetchTxns();
    } catch (err: any) {
      toast.error(err.message || 'Failed to recover order');
    } finally {
      setRecoveringIntent(false);
    }
  };

  // Legacy: manual create missing order (for txns without intent)
  const handleCreateMissingOrder = async (tx: PaystackTx) => {
    const meta = tx.metadata || {};
    const recipientPhone = (meta.recipient_phone as string) || (meta.customer_phone as string) || (meta.phone as string) || tx.customer_phone || '';
    const network = (meta.network as string) || '';
    const bundleSizeGb = (meta.bundle_size_gb as string) || (meta.data_amount as string) || '';
    const productId = (meta.product_id as string) || '';

    if (recipientPhone && network && bundleSizeGb) {
      await executeCreateOrder(tx, { recipient_phone: recipientPhone, network, bundle_size_gb: bundleSizeGb, product_id: productId });
    } else {
      setOrderFormData({
        recipient_phone: recipientPhone,
        network: network || 'MTN',
        bundle_size_gb: bundleSizeGb || '1',
        product_id: productId,
      });
      setOrderFormOpen(true);
    }
  };

  const executeCreateOrder = async (tx: PaystackTx, params: { recipient_phone: string; network: string; bundle_size_gb: string; product_id: string }) => {
    setCreatingOrder(true);
    try {
      const existingOrder = await resolveOrderLinkage(tx);
      if (existingOrder) {
        await syncTransactionLink(tx, existingOrder);
        setResolvedOrderLink(existingOrder);
        toast.success(`Order ${existingOrder.orderId} already exists — linked and resolved.`);
        fetchTxns();
        setSelectedTx(null);
        return;
      }

      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let orderId = "DS-";
      for (let i = 0; i < 8; i++) orderId += chars.charAt(Math.floor(Math.random() * chars.length));

      const meta = tx.metadata || {};
      const amountGhs = tx.amount / 100;
      const userId = (meta.user_id as string) || tx.linked_user_id || null;
      const storeId = (meta.store_id as string) || null;
      const isAgentStore = !!storeId;

      if (isAgentStore) {
        const agentId = (meta.agent_id as string) || null;
        if (!agentId) throw new Error('Agent ID missing for agent store order');
        const { error } = await supabase.from('agent_orders').insert({
          agent_id: agentId, order_id: orderId, customer_phone: params.recipient_phone,
          customer_name: (meta.customer_name as string) || tx.customer_name || null,
          network: params.network, bundle_size_gb: Number(params.bundle_size_gb),
          product_id: params.product_id || null, agent_selling_price: amountGhs,
          agent_cost_price: amountGhs, profit_ghs: 0, payment_method: 'paystack',
          paystack_reference: tx.reference, payment_status: 'paid', status: 'Processing', order_source: 'agent_store',
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('orders').insert({
          order_id: orderId, user_id: userId, recipient_number: params.recipient_phone,
          customer_name: (meta.customer_name as string) || tx.customer_name || null,
          network: params.network, product_id: params.product_id || null,
          bundle_size_gb: Number(params.bundle_size_gb), amount_ghs: amountGhs,
          status: 'Processing', payment_method: 'paystack', payment_status: 'paid',
          paystack_reference: tx.reference, order_source: 'reconciliation',
        });
        if (error) throw error;
      }

      const { data: supResult, error: supErr } = await supabase.functions.invoke('submit-supplier-order', {
        body: { order_id: orderId, network: params.network, phone_number: params.recipient_phone, data_amount: params.bundle_size_gb, product_id: params.product_id || null, table: isAgentStore ? 'agent_orders' : 'orders' },
      });

      await supabase.from('paystack_transactions' as any)
        .update({ linked_order_id: orderId, reconciliation_status: 'resolved', reconciliation_reason: null, last_checked_at: new Date().toISOString() })
        .eq('id', tx.id);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        actor_id: user?.id || '', actor_email: user?.email || '',
        action: 'reconciliation_create_order', entity_type: 'paystack_transactions', entity_id: tx.reference,
        metadata: { order_id: orderId, supplier_success: !supErr, channel: isAgentStore ? 'agent_store' : 'normal_user' },
      });

      const supplierNote = supErr ? ' (supplier dispatch may need retry)' : '';
      toast.success(`Order ${orderId} created successfully${supplierNote}`);
      setSelectedTx(null);
      setOrderFormOpen(false);
      fetchTxns();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create order');
    } finally {
      setCreatingOrder(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Paystack Transactions</h2>
            <p className="text-muted-foreground text-sm">
              All transactions from Paystack ({total} total)
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={handleTestPull} disabled={testPulling}>
                  {testPulling ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                  Test Pull
                </Button>
                <Button variant="default" size="sm" onClick={() => setSyncDialogOpen(true)} disabled={syncing}>
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                  {syncing ? 'Syncing...' : 'Sync'}
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={fetchTxns}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Last Sync Run Status */}
        {lastSyncRun && (
          <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 text-xs space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium">Last sync:</span>
              <Badge variant="outline" className={lastSyncRun.status === 'success' ? 'bg-emerald-500/10 text-emerald-600' : lastSyncRun.status === 'running' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-destructive/10 text-destructive'}>
                {lastSyncRun.status}
              </Badge>
              <span className="text-muted-foreground">
                {format(new Date(lastSyncRun.started_at), 'dd MMM HH:mm')}
              </span>
            </div>
            <p className="text-muted-foreground">
              Fetched: {lastSyncRun.fetched_count} · Upserted: {lastSyncRun.upserted_count} · Existed: {lastSyncRun.already_existed_count}
              {lastSyncRun.errors && (lastSyncRun.errors as unknown[]).length > 0 && (
                <span className="text-destructive ml-2">· {(lastSyncRun.errors as unknown[]).length} errors</span>
              )}
            </p>
            {lastSyncRun.debug && (lastSyncRun.debug as any).sample_refs && (
              <p className="text-muted-foreground font-mono text-[10px]">
                Sample refs: {((lastSyncRun.debug as any).sample_refs || []).join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Debug: last 5 refs in DB (admin only) */}
        {isAdmin && debugRefs.length > 0 && (
          <div className="bg-muted/20 border border-border rounded-lg px-4 py-2 text-[10px] font-mono text-muted-foreground">
            <span className="font-medium">Debug — Last 5 refs in DB:</span> {debugRefs.join(' | ')}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search reference, email, phone, recipient..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="abandoned">Abandoned</SelectItem>
              <SelectItem value="reversed">Reversed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={purposeFilter} onValueChange={(v) => { setPurposeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Purpose" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Purpose</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="deposit">Deposit</SelectItem>
              <SelectItem value="agent_subscription">Subscription</SelectItem>
              <SelectItem value="agent_activation">Activation</SelectItem>
              <SelectItem value="agent_order">Agent Order</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reconFilter} onValueChange={(v) => { setReconFilter(v); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Reconciliation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Recon</SelectItem>
              <SelectItem value="unreviewed">Unreviewed</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Recipient search indicator */}
        {intentSearchResults.length > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-1.5 border border-border">
            <Phone className="w-3 h-3 inline mr-1" />
            Found {intentSearchResults.length} transaction(s) matching recipient number from payment intents
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Payer Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Purpose</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Recon</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">View</th>
                </tr>
              </thead>
              <tbody>
                {txns.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No transactions found</td></tr>
                ) : txns.map(tx => (
                  <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => setSelectedTx(tx)}>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {format(new Date(tx.paid_at || tx.created_at), 'dd MMM HH:mm')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] ${statusColors[tx.status] || ''}`}>
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-xs">
                      {formatAmount(tx.amount)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs font-mono">
                      {tx.customer_phone || '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs">
                      {tx.customer_email || '—'}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant="secondary" className="text-[10px]">{tx.purpose || 'unknown'}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {tx.reconciliation_status === 'flagged' && (
                        <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {tx.reconciliation_reason || 'Flagged'}
                        </Badge>
                      )}
                      {tx.reconciliation_status === 'resolved' && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" />OK
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sync Dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Paystack Transactions</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pull transactions from Paystack and run reconciliation checks.
          </p>
          <div className="flex gap-2 flex-wrap">
            {[{ label: 'Last 24h', value: '24' }, { label: 'Last 7 days', value: '168' }, { label: 'Last 30 days', value: '720' }].map(opt => (
              <Button
                key={opt.value}
                variant={syncHours === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSyncHours(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Download className="w-4 h-4 mr-1.5" />}
              Start Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Detail Sheet */}
      <Sheet open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedTx && (
            <div className="space-y-6 pt-4">
              <SheetHeader>
                <SheetTitle className="text-lg">Transaction Detail</SheetTitle>
              </SheetHeader>

              <div className="flex items-center justify-between">
                <Badge variant="outline" className={`${statusColors[selectedTx.status] || ''}`}>
                  {selectedTx.status.toUpperCase()}
                </Badge>
                <span className="text-2xl font-display font-bold">{formatAmount(selectedTx.amount)}</span>
              </div>

              <div className="space-y-3 text-sm">
                <DetailRow label="Reference" value={selectedTx.reference} mono copyable />
                {selectedTx.paystack_id && <DetailRow label="Paystack ID" value={String(selectedTx.paystack_id)} mono />}
                <DetailRow label="Channel" value={selectedTx.channel || '—'} />
                <DetailRow label="Fees" value={selectedTx.fees != null ? formatAmount(selectedTx.fees) : '—'} />
                <DetailRow label="Date" value={format(new Date(selectedTx.paid_at || selectedTx.created_at), 'dd MMM yyyy HH:mm:ss')} />
                <DetailRow label="Purpose" value={selectedTx.purpose || 'unknown'} />
                <DetailRow label="IP" value={selectedTx.ip_address || '—'} />
              </div>

              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</h4>
                <DetailRow label="Email" value={selectedTx.customer_email || '—'} />
                <DetailRow label="Payer Phone" value={selectedTx.customer_phone || '—'} />
                <DetailRow label="Name" value={selectedTx.customer_name || '—'} />
                {selectedTx.authorization_brand && (
                  <DetailRow label="Card" value={`${selectedTx.authorization_brand} •••• ${selectedTx.authorization_last4}`} />
                )}
                {/* Show linked internal numbers separately */}
                {(() => {
                  const meta = selectedTx.metadata || {};
                  const rawMeta = (selectedTx.raw?.metadata || {}) as Record<string, unknown>;
                  const recipientPhone = (rawMeta.recipient_phone as string) || (rawMeta.recipient_number as string) || (meta.recipient_phone as string) || (meta.recipient_number as string) || null;
                  const checkoutPhone = (rawMeta.customer_phone as string) || (rawMeta.phone as string) || (meta.customer_phone as string) || (meta.phone as string) || null;
                  const payer = selectedTx.customer_phone;
                  const extras: { label: string; value: string }[] = [];
                  if (recipientPhone && recipientPhone !== payer) extras.push({ label: 'Recipient Number', value: recipientPhone });
                  if (checkoutPhone && checkoutPhone !== payer && checkoutPhone !== recipientPhone) extras.push({ label: 'Checkout Contact', value: checkoutPhone });
                  if (extras.length === 0) return null;
                  return (
                    <>
                      <div className="border-t border-border/50 pt-1 mt-1" />
                      <p className="text-[10px] text-muted-foreground italic">Other numbers from metadata (not payer phone):</p>
                      {extras.map(e => <DetailRow key={e.label} label={e.label} value={e.value} />)}
                    </>
                  );
                })()}
              </div>

              {/* Payment Intent / Purchase Details */}
              {selectedIntent && (
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" /> Purchase Intent
                  </h4>
                  <DetailRow label="Recipient" value={selectedIntent.recipient_number} mono />
                  <DetailRow label="Network" value={selectedIntent.network} />
                  <DetailRow label="Bundle" value={`${selectedIntent.bundle_size_gb} GB`} />
                  <DetailRow label="Expected Amount" value={`GHS ${Number(selectedIntent.expected_amount).toFixed(2)}`} />
                  <DetailRow label="Order Type" value={resolvedOrderLink ? orderContextLabel(resolvedOrderLink.context) : orderContextLabel(selectedIntent.order_type)} />
                  {selectedIntent.agent_id && <DetailRow label="Agent ID" value={selectedIntent.agent_id} mono />}
                  {selectedIntent.guest_email && <DetailRow label="Guest Email" value={selectedIntent.guest_email} />}
                  <DetailRow label="Payment Status" value={selectedIntent.payment_status} />
                  {/* Intended Order ID from metadata — informational only, NOT proof of creation */}
                  {selectedIntent.order_id && (
                    <DetailRow label="Intended Order ID" value={selectedIntent.order_id} mono />
                  )}
                  {/* Actual Order Record — based ONLY on real DB row existence */}
                  {resolvingOrderLink ? (
                    <DetailRow label="Actual Order Record" value="Checking…" />
                  ) : hasExistingOrder ? (
                    <DetailRow label="Actual Order Record" value={`✓ Found — ${effectiveOrderLink} (${orderContextLabel(resolvedOrderLink!.context)})`} />
                  ) : (
                    <div className="flex items-start gap-2 py-0.5">
                      <span className="text-xs text-muted-foreground shrink-0 w-[140px]">Actual Order Record</span>
                      <span className="text-xs font-semibold text-destructive">✗ No order row found in database</span>
                    </div>
                  )}
                  {/* Warn when metadata says created but no real row exists */}
                  {!hasExistingOrder && !resolvingOrderLink && selectedIntent.order_created && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded px-2 py-1.5 text-[11px] text-destructive">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      Intent metadata says order_created=true with ID "{selectedIntent.order_id}", but no matching row exists in the database. The order was likely never persisted.
                    </div>
                  )}
                </div>
              )}

              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Records</h4>
                {resolvedOrderLink && <DetailRow label="Order Context" value={orderContextLabel(resolvedOrderLink.context)} />}
                {effectiveOrderLink && <DetailRow label="Order" value={effectiveOrderLink} />}
                {selectedTx.linked_deposit_id && <DetailRow label="Deposit" value={selectedTx.linked_deposit_id} />}
                {selectedTx.linked_user_id && <DetailRow label="User ID" value={selectedTx.linked_user_id} mono />}
                {selectedTx.linked_agent_subscription_id && <DetailRow label="Subscription" value={selectedTx.linked_agent_subscription_id} />}
                {resolvingOrderLink && <p className="text-xs text-muted-foreground">Checking linked order…</p>}
                {!effectiveOrderLink && !selectedTx.linked_deposit_id && !selectedTx.linked_agent_subscription_id && !resolvingOrderLink && (
                  <p className="text-xs text-muted-foreground">No linked records found</p>
                )}
              </div>

              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reconciliation</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={reconColors[selectedTx.reconciliation_status] || ''}>
                    {selectedTx.reconciliation_status}
                  </Badge>
                  {selectedTx.reconciliation_reason && (
                    <span className="text-xs text-destructive font-mono">{selectedTx.reconciliation_reason}</span>
                  )}
                </div>
              </div>

              {isAdmin && (
                <div className="space-y-2 border-t border-border pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {hasExistingOrder && (
                      <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1.5 text-xs text-emerald-600">
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                        Order <span className="font-mono font-semibold">{effectiveOrderLink}</span> already exists ({orderContextLabel(resolvedOrderLink!.context)}) — duplicate recovery is blocked.
                      </div>
                    )}
                    {/* Create Missing Order: visible for any successful order/agent_order payment with no real order row */}
                    {!hasExistingOrder && !resolvingOrderLink && selectedTx.status === 'success' && (selectedTx.purpose === 'order' || selectedTx.purpose === 'agent_order') && selectedIntent && (
                      <Button size="sm" variant="default" onClick={() => setIntentConfirmOpen(true)} disabled={recoveringIntent}>
                        {recoveringIntent ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PackagePlus className="w-3.5 h-3.5 mr-1.5" />}
                        Create Missing Order
                      </Button>
                    )}
                    {/* Legacy fallback when no payment_intent exists for this transaction */}
                    {!hasExistingOrder && !resolvingOrderLink && selectedTx.status === 'success' && (selectedTx.purpose === 'order' || selectedTx.purpose === 'agent_order') && !selectedIntent && (
                      <Button size="sm" variant="default" onClick={() => handleCreateMissingOrder(selectedTx)} disabled={creatingOrder}>
                        {creatingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PackagePlus className="w-3.5 h-3.5 mr-1.5" />}
                        Create Missing Order (Manual)
                      </Button>
                    )}
                    {/* Disabled state while resolving */}
                    {resolvingOrderLink && selectedTx.status === 'success' && (selectedTx.purpose === 'order' || selectedTx.purpose === 'agent_order') && (
                      <Button size="sm" variant="outline" disabled>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Checking order existence…
                      </Button>
                    )}
                    {effectiveOrderLink && (
                      <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(effectiveOrderLink); toast.success('Order ID copied'); }}>
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> View Linked Order: {effectiveOrderLink}
                      </Button>
                    )}
                    {selectedTx.reconciliation_status === 'flagged' && (
                      <Button size="sm" variant="outline" onClick={() => handleResolveAsNotIssue(selectedTx)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Resolve as Not Issue
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setTicketDialogOpen(true)}>
                      <LifeBuoy className="w-3.5 h-3.5 mr-1.5" /> Create Ticket
                    </Button>
                  </div>
                </div>
              )}

              {/* Phone Source Debug (admin only) */}
              {isAdmin && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">📱 Payer Phone Source Debug</summary>
                  <div className="mt-2 p-3 bg-muted rounded-lg space-y-1 text-[11px] font-mono">
                    <p><span className="text-muted-foreground">Stored payer phone:</span> {selectedTx.customer_phone || 'null'}</p>
                    <p><span className="text-muted-foreground">Source:</span> {(() => {
                      const raw = selectedTx.raw || {};
                      const customer = raw.customer as Record<string, unknown> | undefined;
                      const auth = raw.authorization as Record<string, unknown> | undefined;
                      if (customer?.phone) return 'raw.customer.phone ✓';
                      if (auth?.mobile_number) return 'raw.authorization.mobile_number ✓';
                      return 'not available from Paystack';
                    })()}</p>
                    <p><span className="text-muted-foreground">raw.customer.phone:</span> {(selectedTx.raw?.customer as any)?.phone || 'null'}</p>
                    <p><span className="text-muted-foreground">raw.authorization.mobile_number:</span> {(selectedTx.raw?.authorization as any)?.mobile_number || 'null'}</p>
                  </div>
                </details>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw JSON Payload</summary>
                <pre className="mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-64 text-[10px] font-mono">
                  {JSON.stringify(selectedTx.raw, null, 2)}
                </pre>
              </details>

              {Object.keys(selectedTx.metadata).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Metadata</summary>
                  <pre className="mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-48 text-[10px] font-mono">
                    {JSON.stringify(selectedTx.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Intent-Based Order Recovery Confirmation Modal */}
      <Dialog open={intentConfirmOpen} onOpenChange={setIntentConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Missing Order</DialogTitle>
            <DialogDescription>
              You are about to create the missing order using the original purchase details stored in the payment intent.
            </DialogDescription>
          </DialogHeader>
          {selectedTx && selectedIntent && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Summary</h4>
                <DetailRow label="Amount" value={formatAmount(selectedTx.amount)} />
                <DetailRow label="Transaction Date" value={format(new Date(selectedTx.paid_at || selectedTx.created_at), 'dd MMM yyyy HH:mm')} />
                <DetailRow label="Paystack Reference" value={selectedTx.reference} mono />
              </div>

              <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Details</h4>
                <DetailRow label="Recipient Number" value={selectedIntent.recipient_number} mono />
                <DetailRow label="Network" value={selectedIntent.network} />
                <DetailRow label="Bundle Size" value={`${selectedIntent.bundle_size_gb} GB`} />
                <DetailRow label="Expected Amount" value={`GHS ${Number(selectedIntent.expected_amount).toFixed(2)}`} />
              </div>

              <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Context</h4>
                <DetailRow label="Order Type" value={
                  selectedIntent.order_type === 'agent' ? '🏪 Agent Store Order' :
                  selectedIntent.user_id ? '👤 Logged-in User Order' :
                  '🌐 Guest Order'
                } />
                {selectedIntent.user_id && <DetailRow label="User ID" value={selectedIntent.user_id} mono />}
                {selectedIntent.agent_id && <DetailRow label="Agent ID" value={selectedIntent.agent_id} mono />}
                {selectedIntent.store_id && <DetailRow label="Store ID" value={selectedIntent.store_id} mono />}
                {selectedIntent.guest_email && <DetailRow label="Guest Email" value={selectedIntent.guest_email} />}
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-700 dark:text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
                <strong>Warning:</strong> This will create the missing order and dispatch it to the supplier immediately.
                A final duplicate check will run before creation — if an order already exists at that point, recovery will be blocked.
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIntentConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleRecoverFromIntent} disabled={recoveringIntent}>
              {recoveringIntent ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <PackagePlus className="w-4 h-4 mr-1.5" />}
              Confirm Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Ticket Dialog */}
      <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Issue Type</label>
              <Select value={ticketIssueType} onValueChange={setTicketIssueType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="order_not_created">Order Not Created</SelectItem>
                  <SelectItem value="deposit_not_reflected">Deposit Not Reflected</SelectItem>
                  <SelectItem value="order_not_delivered">Order Not Delivered</SelectItem>
                  <SelectItem value="wallet_issue">Wallet Issue</SelectItem>
                  <SelectItem value="account_issue">Account Issue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Internal Note</label>
              <Textarea
                value={ticketNote}
                onChange={(e) => setTicketNote(e.target.value)}
                placeholder="Describe the issue..."
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Transaction {selectedTx?.reference} will be automatically linked.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateTicket} disabled={creatingTicket}>
              {creatingTicket ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <LifeBuoy className="w-4 h-4 mr-1.5" />}
              Create Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Missing Order Form Dialog (legacy, for txns without intent) */}
      <Dialog open={orderFormOpen} onOpenChange={setOrderFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Missing Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Fill in the order details for transaction <span className="font-mono">{selectedTx?.reference}</span>.
              Amount: {selectedTx ? formatAmount(selectedTx.amount) : '—'}
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Recipient Phone *</label>
              <Input
                value={orderFormData.recipient_phone}
                onChange={(e) => setOrderFormData(d => ({ ...d, recipient_phone: e.target.value }))}
                placeholder="0551234567"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Network *</label>
              <Select value={orderFormData.network} onValueChange={(v) => setOrderFormData(d => ({ ...d, network: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MTN">MTN</SelectItem>
                  <SelectItem value="Telecel">Telecel</SelectItem>
                  <SelectItem value="AirtelTigo">AirtelTigo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bundle Size (GB) *</label>
              <Input
                value={orderFormData.bundle_size_gb}
                onChange={(e) => setOrderFormData(d => ({ ...d, bundle_size_gb: e.target.value }))}
                placeholder="1"
                type="number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => selectedTx && executeCreateOrder(selectedTx, orderFormData)}
              disabled={creatingOrder || !orderFormData.recipient_phone || !orderFormData.network || !orderFormData.bundle_size_gb}
            >
              {creatingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <PackagePlus className="w-4 h-4 mr-1.5" />}
              Create Order & Send to Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

const DetailRow = ({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) => (
  <div className="flex items-start justify-between gap-2">
    <span className="text-muted-foreground text-xs shrink-0">{label}</span>
    <div className="flex items-center gap-1 min-w-0">
      <span className={`text-right truncate ${mono ? 'font-mono text-[11px]' : 'text-xs'}`}>{value}</span>
      {copyable && (
        <button
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(value); toast.success('Copied'); }}
          className="p-0.5 hover:bg-muted rounded"
        >
          <Copy className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  </div>
);

export default AdminTransactions;
