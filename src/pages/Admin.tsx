import { useEffect, useState } from "react";
import { ArrowRight, Store } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminDatabase, type AdminLedgerRow, type AdminOrderRow, type SupplierLogRow, formatAdminDate, readableStatus } from "@/lib/admin-data";

export default function Admin() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [ledger, setLedger] = useState<AdminLedgerRow[]>([]);
  const [logs, setLogs] = useState<SupplierLogRow[]>([]);
  const [supplierBalance, setSupplierBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      adminDatabase().from<AdminOrderRow>("orders").select("order_reference, recipient_phone, amount, status, payment_status, supplier_status, created_at").order("created_at", { ascending: false }),
      adminDatabase().from<AdminLedgerRow>("wallet_ledger_entries").select("reference, amount, direction, type, created_at").order("created_at", { ascending: false }).limit(5),
      adminDatabase().from<SupplierLogRow>("supplier_api_logs").select("action, endpoint, http_status, call_status, created_at").order("created_at", { ascending: false }).limit(5),
      adminDatabase().from<{ balance: number | string }>("suppliers").select("balance").limit(1),
    ]).then(([orderResult, ledgerResult, logResult, supplierResult]) => {
      if (!mounted) return;
      setOrders(orderResult.data ?? []);
      setLedger(ledgerResult.data ?? []);
      setLogs(logResult.data ?? []);
      const balance = supplierResult.data?.[0]?.balance;
      setSupplierBalance(balance === undefined || balance === null ? null : Number(balance));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const pending = orders.filter((order) => ["awaiting_payment", "processing", "pending_supplier"].includes(order.status)).length;
  const failed = orders.filter((order) => ["failed", "failed_needs_review"].includes(order.status)).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Command centre" title="Overview" description="A quick operational snapshot. Open a section when you need to investigate or take action." />
      <AdminStatStrip loading={loading} items={[
        { label: "Orders", value: orders.length, onClick: () => navigate("/admin/orders") },
        { label: "In progress", value: pending, onClick: () => navigate("/admin/orders?status=pending") },
        { label: "Attention", value: failed, tone: failed ? "warning" : "default", onClick: () => navigate("/admin/orders?status=failed") },
        { label: "Wallet entries", value: ledger.length, onClick: () => navigate("/admin/wallet") },
      ]} />

      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
        <Card><CardHeader><div><CardTitle>Latest orders</CardTitle><p className="mt-1 text-xs text-faint-foreground">Most recent customer activity</p></div><Link to="/admin/orders" className="text-xs font-semibold text-primary-glow">View all</Link></CardHeader><CardContent className="space-y-2">{!loading && orders.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No orders have been placed yet.</p> : orders.slice(0, 5).map((order) => <div key={order.order_reference} className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-white">{order.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone} · {formatAdminDate(order.created_at)}</p></div><div className="flex items-center gap-3 sm:text-right"><Badge variant="neutral">{readableStatus(order.status)}</Badge><p className="min-w-20 font-display text-sm font-semibold text-white">GH₵{Number(order.amount).toFixed(2)}</p></div></div>)}</CardContent></Card>
        <div className="space-y-5"><Card><CardHeader><CardTitle>Supplier status</CardTitle><Store className="text-primary-glow" size={19} /></CardHeader><CardContent><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" /><p className="text-sm font-semibold text-foreground">Integration connected</p></div><p className="mt-5 text-xs uppercase tracking-[0.14em] text-faint-foreground">Recorded balance</p><p className="mt-1 font-display text-2xl font-semibold text-white">{supplierBalance === null ? "Unavailable" : `GH₵${supplierBalance.toFixed(2)}`}</p><p className="mt-4 text-xs text-muted-foreground">{logs.length} recent supplier API events</p><Link to="/admin/suppliers" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary-glow">Open suppliers <ArrowRight size={15} /></Link></CardContent></Card><Card><CardContent><p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint-foreground">Wallet snapshot</p><p className="mt-3 text-sm text-muted-foreground">Review deposits and customer wallet movements in their own finance workspace.</p><Link to="/admin/wallet" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-glow">Open wallet activity <ArrowRight size={15} /></Link></CardContent></Card></div>
      </section>
    </div>
  );
}
