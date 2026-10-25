import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import AdminListPagination from "@/components/admin/AdminListPagination";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { creditMatches, loadSupplierCredits, type SupplierCredit } from "@/lib/supplierCredit";
import { Card, CardContent } from "@/components/ui/card";
import { adminDatabase, formatAdminDate, readableStatus, type AdminOrderRow } from "@/lib/admin-data";

export default function AdminReviews() {
  const [credits, setCredits] = useState<Record<string, SupplierCredit>>({});
  useEffect(() => { void loadSupplierCredits().then(setCredits).catch(() => setCredits({})); }, []);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let mounted = true;
    adminDatabase().from<AdminOrderRow>("orders").select("id, order_reference, recipient_phone, amount, status, payment_status, supplier_status, supplier_order_reference, supplier_purchase_id, suppliers(code), created_at").order("created_at", { ascending: false }).then(({ data }) => {
      if (!mounted) return;
      setOrders((data ?? []).filter((order) => ["failed", "failed_needs_review"].includes(order.status)));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => { setPage(1); }, [pageSize]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(orders.length / pageSize)));
  const visible = orders.slice((safePage - 1) * pageSize, safePage * pageSize);

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Operations" title="Review queue" description="Exceptions that need a human check are separated from healthy orders so the team can focus on what requires attention." />
    <Card><CardContent>
      {loading ? <div className="min-h-40 animate-pulse rounded-2xl bg-white/[0.025]" /> : orders.length === 0 ? <div className="grid min-h-72 place-items-center text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-success/20 bg-success/[0.08]"><CheckCircle2 className="text-success" size={25} /></span><h2 className="mt-4 font-display text-xl font-semibold text-white">Queue is clear</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">There are no failed orders waiting for review right now.</p></div></div> : <div className="space-y-3">{visible.map((order) => <article key={order.order_reference} className="rounded-2xl border border-amber/20 bg-amber/[0.035] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber/[0.1]"><AlertTriangle className="text-amber" size={19} /></span><div><h2 className="font-semibold text-white">{order.order_reference}</h2><p className="mt-1 text-sm text-muted-foreground">{order.recipient_phone} · GH₵{Number(order.amount).toFixed(2)}</p><p className="mt-2 text-xs text-faint-foreground">Created {formatAdminDate(order.created_at)}</p></div></div><div className="flex flex-wrap gap-2"><Badge variant="amber">{readableStatus(order.status)}</Badge><Badge variant="neutral">Delivery: {readableStatus(order.supplier_status ?? "waiting")}</Badge></div></div></article>)}</div>}
      <AdminListPagination page={safePage} pageSize={pageSize} totalItems={orders.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="orders" />
      {visible.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3"><p className="text-sm text-foreground">{order.order_reference} <Badge variant={creditMatches(order, credits[order.id]) ? "success" : "amber"}>{creditMatches(order, credits[order.id]) ? "Supplier credit confirmed" : "Credit not confirmed"}</Badge></p><Button asChild variant="ghost" size="sm"><Link to={`/admin/orders?q=${encodeURIComponent(order.order_reference)}`}>Check order</Link></Button></div>)}
    </CardContent></Card>
  </div>;
}
