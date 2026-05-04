import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AdminLayout from './AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Clock, Search, RefreshCw, XCircle, Loader2, ScanSearch, ChevronDown, Activity, Zap } from 'lucide-react';
import { format } from 'date-fns';

interface ReconCase {
  id: string;
  paystack_reference: string;
  payment_id: string | null;
  user_id: string | null;
  agent_id: string | null;
  amount: number;
  currency: string;
  status: string;
  severity: string;
  reason: string;
  metadata: Record<string, unknown> | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface ScanDiagnostics {
  scanned: number;
  successful_payments: number;
  new_cases: number;
  fulfillment_cases_created: number;
  cases_updated: number;
  cases_total_open: number;
  scan_timestamp: string;
  hours_back: number;
  recent_refs: string[];
  matching_breakdown?: {
    matched_by_reference: number;
    matched_by_linked_id: number;
    no_match: number;
    weak_match_only: number;
  };
  purpose_breakdown?: Record<string, { total: number; matched: number; unmatched: number }>;
  stuck_orders_found?: number;
  failed_supplier_orders_found?: number;
  diagnostics?: {
    total_payments_in_window: number;
    successful_payments_in_window: number;
    orders_in_window: number;
    agent_orders_in_window: number;
    deposits_in_window: number;
    subscriptions_in_window: number;
    cases_open: number;
    cases_in_review: number;
    cases_resolved: number;
    cases_cancelled: number;
    message: string;
  };
}

const severityColor: Record<string, string> = {
  high: 'bg-destructive text-destructive-foreground',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low: 'bg-muted text-muted-foreground',
};

const reasonLabels: Record<string, string> = {
  missing_order: 'Payment → No Order',
  missing_deposit: 'Payment → No Deposit',
  missing_subscription: 'Payment → No Subscription',
  unknown_missing_link: 'Payment → Unknown Link',
  payment_success_order_missing: 'Payment OK, Order Missing',
  fulfillment_not_started: 'Fulfillment Not Started',
  fulfillment_supplier_failed: 'Supplier Call Failed',
};

const caseTypeLabels: Record<string, { label: string; color: string }> = {
  payment_missing_record: { label: 'Payment Missing Record', color: 'bg-destructive/20 text-destructive border-destructive/30' },
  fulfillment_issue: { label: 'Fulfillment Issue', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
};

const stateIcon: Record<string, typeof AlertTriangle> = {
  open: AlertTriangle,
  in_review: Clock,
  resolved: CheckCircle2,
  cancelled: XCircle,
};

const AdminReconciliation = () => {
  const { isAdmin } = useAuth();
  const [cases, setCases] = useState<ReconCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [detailCase, setDetailCase] = useState<ReconCase | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [scanDiag, setScanDiag] = useState<ScanDiagnostics | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [highCount, setHighCount] = useState(0);
  const [resolvedToday, setResolvedToday] = useState(0);
  const [diagOpen, setDiagOpen] = useState(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('payment_reconciliation_cases' as any)
      .select('*')
      .eq('status', tab)
      .order('created_at', { ascending: false })
      .limit(100);

    if (search.trim()) {
      query = supabase
        .from('payment_reconciliation_cases' as any)
        .select('*')
        .eq('status', tab)
        .ilike('paystack_reference', `%${search.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(100);
    }

    const { data, error } = await query;
    if (error) console.error('Fetch error:', error);
    setCases((data || []) as unknown as ReconCase[]);
    setLoading(false);
  }, [tab, search]);

  const fetchHealth = useCallback(async () => {
    const [openRes, highRes, resolvedRes] = await Promise.all([
      supabase.from('payment_reconciliation_cases' as any).select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('payment_reconciliation_cases' as any).select('id', { count: 'exact', head: true }).eq('status', 'open').eq('severity', 'high'),
      supabase.from('payment_reconciliation_cases' as any).select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', new Date().toISOString().split('T')[0]),
    ]);
    setOpenCount(openRes.count || 0);
    setHighCount(highRes.count || 0);
    setResolvedToday(resolvedRes.count || 0);
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);
  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const handleScan = async (hours = 48) => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-payment-mismatches', {
        body: { hours },
      });
      if (error) throw error;
      const result = data as ScanDiagnostics & { ok?: boolean; error?: string; detail?: string };
      setScanDiag(result);
      setDiagOpen(true);
      if (result.ok === false) {
        toast.error(result.error || 'Scan encountered an error — check diagnostics');
      } else {
        const totalNew = (result.new_cases || 0) + (result.fulfillment_cases_created || 0);
        toast.success(`Scanned ${result.scanned} payments → ${totalNew} new cases found`);
      }
      fetchCases();
      fetchHealth();
    } catch (err: any) {
      console.error('Scan error:', err);
      toast.error(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const updateCaseStatus = async (caseId: string, newStatus: string, note?: string) => {
    setActionLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        status: newStatus,
        ...(newStatus === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
        ...(note ? { admin_note: note } : {}),
      };

      const { error } = await supabase
        .from('payment_reconciliation_cases' as any)
        .update(updateData)
        .eq('id', caseId);

      if (error) throw error;
      toast.success(`Case marked as ${newStatus}`);
      setDetailCase(null);
      setAdminNote('');
      fetchCases();
      fetchHealth();
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryFulfillment = async (c: ReconCase) => {
    const meta = c.metadata || {};
    const orderId = meta.order_id as string;
    const orderType = meta.order_type as string;
    if (!orderId) {
      toast.error('No order ID found for retry');
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('submit-supplier-order', {
        body: {
          order_id: orderId,
          table: orderType === 'agent_order' ? 'agent_orders' : 'orders',
        },
      });
      if (error) throw error;
      toast.success('Fulfillment retry submitted');
      // Mark as in_review after retry
      await updateCaseStatus(c.id, 'in_review', `Fulfillment retry triggered at ${new Date().toISOString()}`);
    } catch (err: any) {
      toast.error(err.message || 'Retry failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isAdmin) {
    return <AdminLayout><div className="p-8 text-center text-muted-foreground">Access denied. Admin role required.</div></AdminLayout>;
  }

  const getCaseType = (c: ReconCase) => {
    const metaCaseType = (c.metadata?.case_type as string) || '';
    if (metaCaseType === 'fulfillment_issue' || c.reason.startsWith('fulfillment_')) return 'fulfillment_issue';
    return 'payment_missing_record';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Payment Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Detect unmatched payments and fulfillment failures</p>
        </div>

        {/* Health cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <div><p className="text-2xl font-bold">{openCount}</p><p className="text-xs text-muted-foreground">Open Cases</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <div><p className="text-2xl font-bold">{highCount}</p><p className="text-xs text-muted-foreground">High Severity</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <div><p className="text-2xl font-bold">{resolvedToday}</p><p className="text-xs text-muted-foreground">Resolved Today</p></div>
          </CardContent></Card>
        </div>

        {/* Diagnostics Panel */}
        <Collapsible open={diagOpen} onOpenChange={setDiagOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
              <Activity className="w-3 h-3" />
              <ChevronDown className={`w-3 h-3 transition-transform ${diagOpen ? 'rotate-180' : ''}`} />
              Scan Diagnostics {scanDiag ? `(last: ${format(new Date(scanDiag.scan_timestamp), 'HH:mm:ss')})` : ''}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-1">
              <CardContent className="pt-3 text-xs space-y-3 text-muted-foreground">
                {scanDiag ? (
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-foreground font-bold text-lg">{scanDiag.scanned}</p>
                        <p>Payments scanned</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-foreground font-bold text-lg">{scanDiag.new_cases}</p>
                        <p>Payment cases</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-foreground font-bold text-lg">{scanDiag.fulfillment_cases_created || 0}</p>
                        <p>Fulfillment cases</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-foreground font-bold text-lg">{scanDiag.cases_updated || 0}</p>
                        <p>Already existed</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-foreground font-bold text-lg">{scanDiag.cases_total_open}</p>
                        <p>Total open</p>
                      </div>
                    </div>

                    {/* Matching Breakdown */}
                    {scanDiag.matching_breakdown && (
                      <div className="p-2 rounded bg-muted/50 space-y-1">
                        <p className="font-medium text-foreground">Matching Method Breakdown:</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <div><span className="text-green-500 font-bold">{scanDiag.matching_breakdown.matched_by_reference}</span> matched by reference</div>
                          <div><span className="text-green-500 font-bold">{scanDiag.matching_breakdown.matched_by_linked_id}</span> matched by linked ID</div>
                          <div><span className="text-destructive font-bold">{scanDiag.matching_breakdown.no_match}</span> no match</div>
                          <div><span className="text-yellow-500 font-bold">{scanDiag.matching_breakdown.weak_match_only}</span> weak match only</div>
                        </div>
                      </div>
                    )}

                    {/* Fulfillment checks */}
                    {(scanDiag.stuck_orders_found !== undefined || scanDiag.failed_supplier_orders_found !== undefined) && (
                      <div className="p-2 rounded bg-orange-500/10 border border-orange-500/20 space-y-1">
                        <p className="font-medium text-foreground">Fulfillment Checks:</p>
                        <p>Stuck orders (no supplier call): <span className="font-bold text-foreground">{scanDiag.stuck_orders_found || 0}</span></p>
                        <p>Failed supplier orders: <span className="font-bold text-foreground">{scanDiag.failed_supplier_orders_found || 0}</span></p>
                      </div>
                    )}

                    {/* Purpose Breakdown */}
                    {scanDiag.purpose_breakdown && Object.keys(scanDiag.purpose_breakdown).length > 0 && (
                      <div>
                        <p className="font-medium text-foreground mb-1">Purpose Breakdown:</p>
                        <div className="space-y-1">
                          {Object.entries(scanDiag.purpose_breakdown).map(([purpose, stats]) => (
                            <div key={purpose} className="flex items-center gap-2 text-[11px]">
                              <Badge variant="outline" className="text-[10px] font-mono">{purpose}</Badge>
                              <span>Total: {stats.total}</span>
                              <span className="text-green-500">Matched: {stats.matched}</span>
                              {stats.unmatched > 0 && <span className="text-destructive font-bold">Unmatched: {stats.unmatched}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Backend diagnostics */}
                    {scanDiag.diagnostics && (
                      <div className="p-2 rounded bg-muted/50 space-y-1">
                        <p className="font-medium text-foreground">Data Pipeline Check:</p>
                        <p>Total payments in {scanDiag.hours_back}h window: <span className="font-mono font-bold text-foreground">{scanDiag.diagnostics.total_payments_in_window}</span></p>
                        <p>Successful payments: <span className="font-mono font-bold text-foreground">{scanDiag.diagnostics.successful_payments_in_window}</span></p>
                        <p>Orders created: <span className="font-mono font-bold text-foreground">{scanDiag.diagnostics.orders_in_window}</span></p>
                        <p>Agent orders: <span className="font-mono font-bold text-foreground">{scanDiag.diagnostics.agent_orders_in_window}</span></p>
                        <p>Deposits: <span className="font-mono font-bold text-foreground">{scanDiag.diagnostics.deposits_in_window}</span></p>
                        <p>Subscriptions: <span className="font-mono font-bold text-foreground">{scanDiag.diagnostics.subscriptions_in_window}</span></p>
                        <p className="pt-1 text-foreground">{scanDiag.diagnostics.message}</p>
                      </div>
                    )}

                    {/* Recent refs */}
                    {scanDiag.recent_refs.length > 0 && (
                      <div>
                        <p>Recent refs (masked):</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {scanDiag.recent_refs.map((r, i) => (
                            <Badge key={i} variant="outline" className="font-mono text-[10px]">{r}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-[10px]">Scanned at: {format(new Date(scanDiag.scan_timestamp), 'dd MMM yyyy HH:mm:ss')}</p>
                  </>
                ) : (
                  <p>No scan has been run yet. Click "Scan 48h" to check for mismatches.</p>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="in_review">In Review</TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search reference..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-48" />
              </div>
              <Button variant="outline" size="sm" onClick={() => { fetchCases(); fetchHealth(); }}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleScan(48)} disabled={scanning}>
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
                <span className="ml-1">Scan 48h</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleScan(168)} disabled={scanning} className="text-xs">
                7 days
              </Button>
            </div>
          </div>

          <TabsContent value={tab} className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : cases.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-muted-foreground">No cases in "{tab}" tab</p>
                {tab === 'open' && (
                  <p className="text-xs text-muted-foreground">
                    Click "Scan 48h" to check for unmatched payments and stuck orders.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {cases.map(c => {
                  const Icon = stateIcon[c.status] || AlertTriangle;
                  const meta = c.metadata || {};
                  const purpose = (meta.purpose as string) || c.reason || 'unknown';
                  const email = (meta.customer_email as string) || '';
                  const caseType = getCaseType(c);
                  const ctInfo = caseTypeLabels[caseType] || caseTypeLabels.payment_missing_record;

                  return (
                    <Card key={c.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => { setDetailCase(c); setAdminNote(c.admin_note || ''); }}>
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <Badge className={`text-[10px] ${severityColor[c.severity] || ''}`}>{c.severity}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${ctInfo.color}`}>{ctInfo.label}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate font-mono">{c.paystack_reference}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            GHS {c.amount} · {reasonLabels[c.reason] || c.reason} {email ? `· ${email}` : ''}
                            {meta.network ? ` · ${meta.network}` : ''}
                            {meta.order_id ? ` · ${meta.order_id}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), 'dd MMM HH:mm')}</p>
                          {c.agent_id && <Badge variant="outline" className="text-[10px]">Agent</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Detail drawer */}
        <Dialog open={!!detailCase} onOpenChange={() => setDetailCase(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            {detailCase && (() => {
              const caseType = getCaseType(detailCase);
              const ctInfo = caseTypeLabels[caseType] || caseTypeLabels.payment_missing_record;
              const isFulfillment = caseType === 'fulfillment_issue';
              const meta = detailCase.metadata || {};

              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 flex-wrap">
                      Case Detail
                      <Badge className={`text-[10px] ${severityColor[detailCase.severity] || ''}`}>{detailCase.severity}</Badge>
                      <Badge variant="outline" className={`text-[10px] ${ctInfo.color}`}>{ctInfo.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">{detailCase.status}</Badge>
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Reference</span><p className="font-mono text-xs break-all">{detailCase.paystack_reference}</p></div>
                      <div><span className="text-muted-foreground">Amount</span><p className="font-bold">GHS {detailCase.amount}</p></div>
                      <div><span className="text-muted-foreground">Purpose</span><p>{(meta.purpose as string) || '—'}</p></div>
                      <div><span className="text-muted-foreground">Reason</span><p>{reasonLabels[detailCase.reason] || detailCase.reason}</p></div>
                      <div><span className="text-muted-foreground">Email</span><p className="truncate">{(meta.customer_email as string) || '—'}</p></div>
                      <div><span className="text-muted-foreground">Created</span><p>{format(new Date(detailCase.created_at), 'dd MMM yyyy HH:mm')}</p></div>
                      {meta.paid_at && (
                        <div><span className="text-muted-foreground">Paid At</span><p>{format(new Date(meta.paid_at as string), 'dd MMM yyyy HH:mm')}</p></div>
                      )}
                      {meta.network && (
                        <div><span className="text-muted-foreground">Network</span><p>{meta.network as string}</p></div>
                      )}
                      {meta.order_id && (
                        <div><span className="text-muted-foreground">Order ID</span><p className="font-mono text-xs">{meta.order_id as string}</p></div>
                      )}
                      {meta.recipient && (
                        <div><span className="text-muted-foreground">Recipient</span><p>{meta.recipient as string}</p></div>
                      )}
                      {meta.order_status && (
                        <div><span className="text-muted-foreground">Order Status</span><p>{meta.order_status as string}</p></div>
                      )}
                      {meta.supplier_status && (
                        <div><span className="text-muted-foreground">Supplier Status</span><p>{meta.supplier_status as string}</p></div>
                      )}
                      {detailCase.agent_id && (
                        <div><span className="text-muted-foreground">Agent</span><p className="text-xs font-mono truncate">{detailCase.agent_id}</p></div>
                      )}
                      {detailCase.user_id && (
                        <div><span className="text-muted-foreground">User</span><p className="text-xs font-mono truncate">{detailCase.user_id}</p></div>
                      )}
                    </div>

                    {meta.scan_reason && (
                      <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                        <span className="text-xs text-yellow-500">Detection Reason</span>
                        <p className="text-xs">{meta.scan_reason as string}</p>
                      </div>
                    )}

                    {meta.supplier_message && (
                      <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
                        <span className="text-xs text-destructive">Supplier Error</span>
                        <p className="text-xs">{meta.supplier_message as string}</p>
                      </div>
                    )}

                    {meta.checkout_meta && (
                      <div className="p-2 rounded bg-muted/50">
                        <span className="text-xs text-muted-foreground">Checkout Metadata</span>
                        <pre className="text-xs font-mono break-all whitespace-pre-wrap mt-1 max-h-32 overflow-y-auto">
                          {JSON.stringify(meta.checkout_meta, null, 2)}
                        </pre>
                      </div>
                    )}

                    {meta.error_message && (
                      <div className="p-2 rounded bg-muted/50">
                        <span className="text-xs text-muted-foreground">Error Detail</span>
                        <p className="text-xs break-all">{meta.error_message as string}</p>
                      </div>
                    )}

                    {detailCase.admin_note && (
                      <div className="p-2 rounded bg-primary/10 border border-primary/20">
                        <span className="text-xs text-primary">Admin Note</span>
                        <p className="text-xs">{detailCase.admin_note}</p>
                      </div>
                    )}
                  </div>

                  {(detailCase.status === 'open' || detailCase.status === 'in_review') && (
                    <div className="space-y-3 pt-4">
                      <Textarea
                        placeholder="Admin note (optional)..."
                        value={adminNote}
                        onChange={e => setAdminNote(e.target.value)}
                        className="text-sm"
                        rows={2}
                      />
                      <DialogFooter className="flex-col sm:flex-row gap-2">
                        {isFulfillment && meta.order_id && (
                          <Button variant="outline" onClick={() => handleRetryFulfillment(detailCase)} disabled={actionLoading} className="text-orange-400 border-orange-500/30">
                            <Zap className="w-4 h-4 mr-1" /> Retry Fulfillment
                          </Button>
                        )}
                        {detailCase.status === 'open' && (
                          <Button variant="outline" onClick={() => updateCaseStatus(detailCase.id, 'in_review', adminNote)} disabled={actionLoading}>
                            <Clock className="w-4 h-4 mr-1" /> Mark In Review
                          </Button>
                        )}
                        <Button onClick={() => updateCaseStatus(detailCase.id, 'resolved', adminNote)} disabled={actionLoading}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Resolved
                        </Button>
                        <Button variant="ghost" onClick={() => updateCaseStatus(detailCase.id, 'cancelled', adminNote)} disabled={actionLoading}>
                          <XCircle className="w-4 h-4 mr-1" /> Cancel
                        </Button>
                      </DialogFooter>
                    </div>
                  )}
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminReconciliation;
