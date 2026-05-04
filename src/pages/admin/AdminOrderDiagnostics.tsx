import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { formatPrice } from '@/data/bundles';
import { Search, RefreshCw, AlertTriangle, CheckCircle, Wrench } from 'lucide-react';

interface DiagnosticResult {
  order_id: string;
  order_source: string;
  is_agent_order: boolean;
  status: string;
  payment_status: string | null;
  paystack_reference: string | null;
  snapshots_present: boolean;
  profit_credited: boolean;
  agent_profit_at_purchase: number | null;
  datasika_profit_at_purchase: number | null;
  supplier_cost_at_purchase: number | null;
  agent_base_price_at_purchase: number | null;
  agent_store_price_at_purchase: number | null;
  profit_ghs: number | null;
  amount_ghs: number;
  network: string;
  created_at: string;
}

interface BackfillLog {
  order_id: string;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  flagged?: boolean;
}

const AdminOrderDiagnostics = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { log } = useAuditLog();
  const navigate = useNavigate();

  const [searchOrderId, setSearchOrderId] = useState('');
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [backfillLogs, setBackfillLogs] = useState<BackfillLog[]>([]);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillSummary, setBackfillSummary] = useState<{ repaired: number; skipped: number; credited: number } | null>(null);

  if (authLoading) return null;
  if (!user || !isAdmin) { navigate('/auth'); return null; }

  const handleLookup = async () => {
    if (!searchOrderId.trim()) return;
    setLoadingDiag(true);
    setDiagnostic(null);
    try {
      const id = searchOrderId.trim().toUpperCase();

      // Try agent_orders first
      const { data: agentOrder } = await supabase
        .from('agent_orders')
        .select('*')
        .eq('order_id', id)
        .maybeSingle();

      if (agentOrder) {
        const ao = agentOrder as any;
        const snapshotsPresent = ao.agent_profit_at_purchase != null && ao.agent_base_price_at_purchase != null;
        setDiagnostic({
          order_id: ao.order_id,
          order_source: 'agent_store',
          is_agent_order: true,
          status: ao.status,
          payment_status: ao.payment_status,
          paystack_reference: ao.paystack_reference,
          snapshots_present: snapshotsPresent,
          profit_credited: Boolean(ao.profit_credited),
          agent_profit_at_purchase: ao.agent_profit_at_purchase != null ? Number(ao.agent_profit_at_purchase) : null,
          datasika_profit_at_purchase: ao.datasika_profit_at_purchase != null ? Number(ao.datasika_profit_at_purchase) : null,
          supplier_cost_at_purchase: ao.supplier_cost_at_purchase != null ? Number(ao.supplier_cost_at_purchase) : null,
          agent_base_price_at_purchase: ao.agent_base_price_at_purchase != null ? Number(ao.agent_base_price_at_purchase) : null,
          agent_store_price_at_purchase: ao.agent_store_price_at_purchase != null ? Number(ao.agent_store_price_at_purchase) : null,
          profit_ghs: ao.profit_ghs != null ? Number(ao.profit_ghs) : null,
          amount_ghs: Number(ao.agent_selling_price),
          network: ao.network,
          created_at: ao.created_at,
        });
        return;
      }

      // Try normal orders
      const { data: normalOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('order_id', id)
        .maybeSingle();

      if (normalOrder) {
        const no = normalOrder as any;
        setDiagnostic({
          order_id: no.order_id,
          order_source: no.order_source || (no.user_id ? 'normal_logged_in' : 'guest'),
          is_agent_order: false,
          status: no.status,
          payment_status: no.payment_status,
          paystack_reference: no.paystack_reference,
          snapshots_present: true, // normal orders use cost_price_ghs
          profit_credited: false, // N/A for normal orders
          agent_profit_at_purchase: null,
          datasika_profit_at_purchase: null,
          supplier_cost_at_purchase: null,
          agent_base_price_at_purchase: null,
          agent_store_price_at_purchase: null,
          profit_ghs: no.profit_ghs != null ? Number(no.profit_ghs) : null,
          amount_ghs: Number(no.amount_ghs),
          network: no.network,
          created_at: no.created_at,
        });
        return;
      }

      toast.error(`Order "${id}" not found in normal or agent orders.`);
    } catch (err: any) {
      toast.error('Lookup failed: ' + err.message);
    } finally {
      setLoadingDiag(false);
    }
  };

  const handleBackfill = async () => {
    if (!window.confirm('This will recalculate agent profits for orders with missing/incorrect snapshot data. Uses the correct DataSika Agent Base Price from pricing_overrides. This is safe and idempotent. Continue?')) return;
    setBackfilling(true);
    setBackfillLogs([]);
    setBackfillSummary(null);
    const logs: BackfillLog[] = [];
    let repaired = 0;
    let skipped = 0;
    let credited = 0;

    try {
      // Fetch all agent orders that are paid but missing snapshots or uncredited
      const { data: candidates, error } = await supabase
        .from('agent_orders')
        .select('*')
        .eq('payment_status', 'paid')
        .in('status', ['Paid', 'Processing', 'Delivered']);

      if (error) throw error;
      const orders = (candidates || []) as any[];

      // Preload all agent pricing overrides from pricing_overrides table
      // This is the authoritative DataSika Agent Base Price source
      const { data: allOverrides } = await supabase
        .from('pricing_overrides')
        .select('product_id, manual_price, pricing_mode')
        .eq('customer_type', 'agent');
      const overrideMap: Record<string, number> = {};
      (allOverrides || []).forEach((ov: any) => {
        if (ov.manual_price != null && Number(ov.manual_price) > 0) {
          overrideMap[ov.product_id] = Number(ov.manual_price);
        }
      });

      // Preload products for supplier cost lookup
      const productIds = [...new Set(orders.filter(o => o.product_id).map((o: any) => o.product_id))];
      const { data: allProducts } = productIds.length > 0
        ? await supabase.from('products').select('id, cost_price_ghs, price_ghs, agent_price_ghs').in('id', productIds)
        : { data: [] };
      const productMap: Record<string, any> = {};
      (allProducts || []).forEach((p: any) => { productMap[p.id] = p; });

      for (const o of orders) {
        const missingSnapshot = o.agent_profit_at_purchase == null || o.agent_base_price_at_purchase == null;
        const needsCreditCheck = !o.profit_credited && (o.profit_ghs != null || o.agent_profit_at_purchase != null);

        if (!missingSnapshot && !needsCreditCheck) {
          skipped++;
          continue;
        }

        // Resolve DataSika Agent Base Price:
        // 1. From pricing_overrides (admin-set, authoritative)
        // 2. From agent_cost_price stored on the order (may have been retail price — flagged)
        // 3. From products.agent_price_ghs
        const product = o.product_id ? productMap[o.product_id] : null;
        let resolvedBasePrice: number | null = null;
        let basePriceSource = 'unknown';
        let flagged = false;

        if (o.product_id && overrideMap[o.product_id] != null) {
          resolvedBasePrice = overrideMap[o.product_id];
          basePriceSource = 'pricing_overrides';
        } else if (product?.agent_price_ghs != null && Number(product.agent_price_ghs) > 0) {
          resolvedBasePrice = Number(product.agent_price_ghs);
          basePriceSource = 'product.agent_price_ghs';
        } else if (o.agent_cost_price != null && Number(o.agent_cost_price) > 0) {
          // Stored on order — may be retail fallback; flag it
          resolvedBasePrice = Number(o.agent_cost_price);
          basePriceSource = 'order.agent_cost_price (estimated)';
          flagged = true;
        }

        if (resolvedBasePrice == null || resolvedBasePrice === 0) {
          // Cannot resolve — mark needs_review, skip profit credit
          logs.push({
            order_id: o.order_id,
            action: 'needs_review_no_base_price',
            before: { agent_base_price_at_purchase: o.agent_base_price_at_purchase },
            after: {},
            flagged: true,
          });
          skipped++;
          continue;
        }

        const sellingPrice = Number(o.agent_selling_price) || Number(o.agent_store_price_at_purchase) || 0;
        const profitComputed = Math.max(0, Math.round((sellingPrice - resolvedBasePrice) * 100) / 100);

        // Supplier cost from product (admin-only, for DataSika profit)
        const supplierCostFromProduct = product?.cost_price_ghs != null && Number(product.cost_price_ghs) > 0
          ? Number(product.cost_price_ghs)
          : (Number(o.supplier_cost_at_purchase) || 0);
        const datasikaProfitComputed = resolvedBasePrice > 0 && supplierCostFromProduct > 0
          ? Math.max(0, Math.round((resolvedBasePrice - supplierCostFromProduct) * 100) / 100)
          : null;

        const before = {
          agent_profit_at_purchase: o.agent_profit_at_purchase,
          agent_base_price_at_purchase: o.agent_base_price_at_purchase,
          agent_store_price_at_purchase: o.agent_store_price_at_purchase,
          datasika_profit_at_purchase: o.datasika_profit_at_purchase,
          profit_credited: o.profit_credited,
        };

        const updates: Record<string, unknown> = {};
        if (missingSnapshot) {
          updates.agent_store_price_at_purchase = sellingPrice;
          updates.agent_base_price_at_purchase = resolvedBasePrice;
          updates.agent_profit_at_purchase = profitComputed;
          updates.agent_cost_price = resolvedBasePrice; // Fix the stored base price too
          updates.profit_ghs = profitComputed;          // Fix the legacy profit field
          if (supplierCostFromProduct > 0) updates.supplier_cost_at_purchase = supplierCostFromProduct;
          if (datasikaProfitComputed != null) updates.datasika_profit_at_purchase = datasikaProfitComputed;
          repaired++;
        }

        // Idempotent profit credit: check if already credited via wallet txn
        if (needsCreditCheck && !o.profit_credited) {
          const profitToCredit = missingSnapshot ? profitComputed : (Number(o.agent_profit_at_purchase) || profitComputed);
          if (profitToCredit > 0) {
            const { data: existingTxn } = await supabase
              .from('agent_wallet_transactions')
              .select('id')
              .eq('agent_id', o.agent_id)
              .eq('order_id', o.order_id)
              .eq('type', 'profit_credit')
              .maybeSingle();

            if (!existingTxn) {
              const { error: txnErr } = await supabase.from('agent_wallet_transactions').insert({
                agent_id: o.agent_id,
                type: 'profit_credit',
                amount_ghs: profitToCredit,
                description: `[Backfill] Profit from agent store order ${o.order_id} (base_src: ${basePriceSource})`,
                order_id: o.order_id,
                reference: `commission-${o.order_id}`,
                status: 'completed',
              });

              if (!txnErr) {
                const { data: wallet } = await supabase.from('agent_wallets').select('*').eq('agent_id', o.agent_id).maybeSingle();
                if (wallet) {
                  await supabase.from('agent_wallets').update({
                    available_balance: Number(wallet.available_balance) + profitToCredit,
                    total_earned: Number(wallet.total_earned) + profitToCredit,
                  }).eq('id', wallet.id);
                }
                updates.profit_credited = true;
                updates.profit_credited_at = new Date().toISOString();
                credited++;
              }
            } else {
              // Txn exists but flag not set — just fix the flag
              updates.profit_credited = true;
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from('agent_orders').update(updates).eq('id', o.id);
        }

        logs.push({
          order_id: o.order_id,
          action: missingSnapshot ? `snapshot_backfilled (${basePriceSource})` : 'profit_credit_repaired',
          before,
          after: { ...before, ...updates },
          flagged,
        });
      }

      setBackfillLogs(logs);
      setBackfillSummary({ repaired, skipped, credited });

      await log({
        action: 'admin_backfill_agent_profits',
        entity_type: 'system',
        entity_id: 'backfill',
        metadata: { repaired, skipped, credited, total: orders.length },
      });

      toast.success(`Backfill complete: ${repaired} repaired, ${credited} profits credited, ${skipped} skipped.`);
    } catch (err: any) {
      toast.error('Backfill failed: ' + err.message);
    } finally {
      setBackfilling(false);
    }
  };

  const statusColor = (ok: boolean) => ok ? 'text-success' : 'text-destructive';

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-display font-bold">Order Diagnostics & Repair</h2>
          <p className="text-muted-foreground text-sm">Inspect order profit snapshots and run safe backfill repairs for agent orders.</p>
        </div>

        {/* Order Lookup */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h3 className="font-display font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" /> Order Diagnostics
          </h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Order ID</Label>
              <Input
                placeholder="e.g. AGT-XXXXXXXX or ORD-..."
                value={searchOrderId}
                onChange={e => setSearchOrderId(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                className="mt-1 font-mono"
              />
            </div>
            <div className="self-end">
              <Button onClick={handleLookup} disabled={loadingDiag || !searchOrderId.trim()} className="gap-1.5">
                {loadingDiag ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Lookup
              </Button>
            </div>
          </div>

          {diagnostic && (
            <div className="bg-secondary rounded-xl p-4 space-y-3 text-sm mt-2">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                <Row label="Order ID" value={<span className="font-mono font-bold">{diagnostic.order_id}</span>} />
                <Row label="Source" value={<span className="capitalize">{diagnostic.order_source}</span>} />
                <Row label="Status" value={diagnostic.status} />
                <Row label="Network" value={diagnostic.network} />
                <Row label="Payment Status" value={diagnostic.payment_status || '—'} />
                <Row label="Paystack Ref" value={<span className="font-mono text-xs">{diagnostic.paystack_reference || '—'}</span>} />
                <Row label="Amount Paid (Bundle)" value={formatPrice(diagnostic.amount_ghs)} />
                <Row label="Created" value={new Date(diagnostic.created_at).toLocaleString()} />
              </div>

              {diagnostic.is_agent_order && (
                <>
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Profit Snapshot</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                      <Row
                        label="Snapshots Present"
                        value={
                          <span className={statusColor(diagnostic.snapshots_present)}>
              {diagnostic.snapshots_present ? '✓ Yes' : '✗ Missing'}
                          </span>
                        }
                      />
                      <Row
                        label="Profit Credited"
                        value={
                          <span className={diagnostic.profit_credited ? 'text-success' : 'text-destructive'}>
                            {diagnostic.profit_credited ? '✓ Yes' : '⏳ No'}
                          </span>
                        }
                      />
                      <Row label="Agent Base Price (snapshot)" value={diagnostic.agent_base_price_at_purchase != null ? formatPrice(diagnostic.agent_base_price_at_purchase) : '—'} />
                      <Row label="Agent Store Price (snapshot)" value={diagnostic.agent_store_price_at_purchase != null ? formatPrice(diagnostic.agent_store_price_at_purchase) : '—'} />
                      <Row label="Agent Profit (snapshot)" value={diagnostic.agent_profit_at_purchase != null ? <span className="text-success font-semibold">+{formatPrice(diagnostic.agent_profit_at_purchase)}</span> : '—'} />
                      <Row label="DataSika Profit (snapshot)" value={diagnostic.datasika_profit_at_purchase != null ? <span className="text-primary font-semibold">+{formatPrice(diagnostic.datasika_profit_at_purchase)}</span> : 'Unavailable'} />
                      <Row label="Supplier Cost (snapshot)" value={diagnostic.supplier_cost_at_purchase != null ? formatPrice(diagnostic.supplier_cost_at_purchase) : 'Not stored'} />
                      <Row label="Profit (legacy field)" value={diagnostic.profit_ghs != null ? formatPrice(diagnostic.profit_ghs) : '—'} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Backfill Repair Tool */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Wrench className="w-4 h-4 text-primary" /> Recalculate Agent Profits (Backfill)
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Safe & idempotent. Only repairs agent_store orders with missing snapshots or uncredited profits. Never touches normal orders. Never double-credits.
              </p>
            </div>
            <Button
              onClick={handleBackfill}
              disabled={backfilling}
              variant="outline"
              className="gap-1.5 shrink-0"
            >
              {backfilling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              {backfilling ? 'Running...' : 'Run Backfill'}
            </Button>
          </div>

          {backfillSummary && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary rounded-xl p-3 text-center">
                <p className="text-lg font-display font-bold text-primary">{backfillSummary.repaired}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Snapshots Repaired</p>
              </div>
              <div className="bg-secondary rounded-xl p-3 text-center">
                <p className="text-lg font-display font-bold text-success">{backfillSummary.credited}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Profits Credited</p>
              </div>
              <div className="bg-secondary rounded-xl p-3 text-center">
                <p className="text-lg font-display font-bold text-muted-foreground">{backfillSummary.skipped}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Already OK (Skipped)</p>
              </div>
            </div>
          )}

          {backfillLogs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Backfill Log ({backfillLogs.length} entries)</p>
              <div className="max-h-80 overflow-y-auto space-y-1.5 rounded-xl border border-border p-2">
                {backfillLogs.map((entry, i) => (
                  <div key={i} className="bg-secondary rounded-lg p-2.5 text-xs flex items-start gap-2">
                    {entry.flagged ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="font-mono font-bold">{entry.order_id}</span>
                      <span className="text-muted-foreground ml-2">{entry.action}</span>
                      {entry.flagged && <span className="ml-2 text-destructive text-[10px] font-semibold">[estimated base price — verify manually]</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{value}</span>
  </div>
);

export default AdminOrderDiagnostics;
