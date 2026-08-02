import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, ClipboardList, Search, XCircle } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { adminDatabase, formatAdminDate, readableStatus, type AdminOrderRow } from "@/lib/admin-data";

type OrderFilter = "all" | "pending" | "completed" | "failed";
const PENDING_STATUSES = ["awaiting_payment", "processing", "pending_supplier"];
const FAILED_STATUSES = ["failed", "failed_needs_review"];

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    adminDatabase().from<AdminOrderRow[]>("orders").select("order_reference, recipient_phone, amount, status, payment_status, supplier_status, created_at").order("created_at", { ascending: false }).then(({ data }) => {
      if (!mounted) return;
      setOrders(data ?? []);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const completed = orders.filter((order) => order.status === "completed").length;
  const pending = orders.filter((order) => PENDING_STATUSES.includes(order.status)).length;
  const failed = orders.filter((order) => FAILED_STATUSES.includes(order.status)).length;
  const visible = useMemo(() => orders.filter((order) => {
    const matchesFilter = filter === "all"
      || (filter === "pending" && PENDING_STATUSES.includes(order.status))
      || (filter === "completed" && order.status === "completed")
      || (filter === "failed" && FAILED_STATUSES.includes(order.status));
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || order.order_reference.toLowerCase().includes(needle) || order.recipient_phone.includes(needle);
    return matchesFilter && matchesSearch;
  }), [filter, orders, search]);

  const summaries = [
    { label: "All orders", value: orders.length, icon: ClipboardList, filter: "all" as const },
    { label: "In progress", value: pending, icon: Activity, filter: "pending" as const },
    { label: "Completed", value: completed, icon: CheckCircle2, filter: "completed" as const },
    { label: "Failed", value: failed, icon: XCircle, filter: "failed" as const },
  ];

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Operations" title="Orders" description="Monitor every Phase 1 data order, payment state and supplier delivery status from one focused workspace." />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map((item) => <button key={item.label} type="button" onClick={() => setFilter(item.filter)} className="text-left"><Card className={filter === item.filter ? "border-primary-glow/30 bg-primary/[0.055]" : "transition-colors hover:border-white/20"}><CardContent className="flex items-center gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04]"><item.icon size={19} className="text-primary-glow" /></span><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="font-display text-2xl font-semibold text-white">{loading ? "—" : item.value}</p></div></CardContent></Card></button>)}
      </section>
      <Card>
        <CardContent>
          <label className="flex max-w-md items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or phone" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead><tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[0.15em] text-faint-foreground"><th className="pb-3 font-semibold">Order</th><th className="pb-3 font-semibold">Amount</th><th className="pb-3 font-semibold">Order status</th><th className="pb-3 font-semibold">Payment</th><th className="pb-3 font-semibold">Supplier</th><th className="pb-3 text-right font-semibold">Created</th></tr></thead>
              <tbody>{visible.map((order) => <tr key={order.order_reference} className="border-b border-white/[0.055] last:border-0"><td className="py-4"><p className="font-semibold text-white">{order.order_reference}</p><p className="mt-1 text-xs text-muted-foreground">{order.recipient_phone}</p></td><td className="py-4 font-display font-semibold text-white">GH₵{Number(order.amount).toFixed(2)}</td><td className="py-4"><Badge variant="neutral">{readableStatus(order.status)}</Badge></td><td className="py-4"><Badge variant={order.payment_status === "succeeded" ? "success" : "amber"}>{readableStatus(order.payment_status)}</Badge></td><td className="py-4 text-muted-foreground">{readableStatus(order.supplier_status ?? "waiting")}</td><td className="py-4 text-right text-xs text-muted-foreground">{formatAdminDate(order.created_at)}</td></tr>)}</tbody>
            </table>
            {!loading && visible.length === 0 && <div className="grid min-h-48 place-items-center text-center"><div><ClipboardList className="mx-auto text-faint-foreground" /><p className="mt-3 font-semibold text-foreground">No matching orders</p><p className="mt-1 text-sm text-muted-foreground">Change the filter or search term.</p></div></div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
