import { useEffect, useMemo, useState } from "react";
import Seo from "@/components/seo/Seo";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, PackageCheck, RefreshCcw, Search } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth-context";
import { formatGHS } from "@/lib/format";

interface OrderRow {
  id: string;
  order_reference: string;
  recipient_phone: string;
  amount: number | string;
  currency: string;
  status: string;
  admin_resolution_status: string | null;
  payment_status: string;
  supplier_status: string | null;
  created_at: string;
  data_products: { name: string } | null;
  networks: { name: string } | null;
}

interface DbError { message: string }
interface QueryChain<T> extends PromiseLike<{ data: T; error: DbError | null }> {
  select: (columns: string) => QueryChain<T>;
  eq: (column: string, value: unknown) => QueryChain<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryChain<T>;
}
interface Phase1Client { from: <T>(table: string) => QueryChain<T> }

const PAGE_SIZE = 10;
const FILTERS = ["all", "awaiting_payment", "processing", "delivered", "failed", "refunded", "cancelled"] as const;

function phase1() {
  return (supabase as unknown as { schema: (schema: string) => Phase1Client }).schema("phase1");
}

function customerStatus(order: OrderRow) {
  const status = order.admin_resolution_status ?? order.status;
  if (status === "delivered") return "delivered";
  if (status === "refunded") return "refunded";
  if (status === "cancelled") return "cancelled";
  if (status === "failed") return "failed";
  if (order.payment_status !== "succeeded") return "awaiting_payment";
  return "processing";
}

function label(status: string) {
  const labels: Record<string, string> = {
    awaiting_payment: "Awaiting payment",
    processing: "In progress",
    delivered: "Delivered",
    failed: "Needs support",
    refunded: "Refunded",
    cancelled: "Cancelled",
    all: "All",
  };
  return labels[status] ?? status;
}

function maskPhone(phone: string) {
  return phone.length === 10 ? `${phone.slice(0, 3)}•••${phone.slice(-3)}` : phone;
}

export default function Orders() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [page, setPage] = useState(1);

  const load = async () => {
    if (!isAuthenticated || !user) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await phase1()
      .from<OrderRow[]>("orders")
      .select("id, order_reference, recipient_phone, amount, currency, status, admin_resolution_status, payment_status, supplier_status, created_at, data_products(name), networks(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setOrders(data ?? []);
    setError(queryError?.message ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { setLoading(false); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated]);

  useEffect(() => { setPage(1); }, [query, filter]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      const status = customerStatus(order);
      const matchesFilter = filter === "all" || status === filter;
      const matchesQuery = !needle || order.order_reference.toLowerCase().includes(needle) || order.recipient_phone.includes(needle) || order.data_products?.name.toLowerCase().includes(needle) || order.networks?.name.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [orders, query, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  return (
    <div className="space-y-6 lg:space-y-8">
      <Seo title="Your Orders — DataYego" description="Your DataYego order history." path="/orders" noindex />
      <PageHeader eyebrow="Data orders" title="Your orders" subtitle="Search your purchase history and follow every delivery." action={<Button variant="soft" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "animate-spin" : ""} size={16} /> Refresh</Button>} />

      <section className="onyx-panel rounded-[24px] p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-faint-foreground" size={17} /><input className="onyx-field w-full pl-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order ID, recipient, network or bundle" /></label>
          <Button variant="soft" onClick={() => navigate("/track-order")}><Search size={16} /> Track reference</Button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${filter === item ? "border-primary-glow/30 bg-primary/[0.12] text-primary-glow" : "border-white/[0.08] bg-white/[0.025] text-muted-foreground"}`}>{label(item)}</button>)}
        </div>
      </section>

      {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={17} /> Loading orders…</div> : error ? <div className="rounded-2xl border border-danger/25 bg-danger/[0.08] p-4 text-sm text-ink-rose">We couldn't load your orders. Please refresh and try again.</div> : orders.length === 0 ? <section className="onyx-panel rounded-[24px] p-7 text-center"><PackageCheck className="mx-auto text-primary-glow" size={28} /><h2 className="mt-4 font-display text-xl font-semibold text-white">No orders yet</h2><p className="mt-2 text-sm text-muted-foreground">Your first data purchase will appear here.</p><Button className="mt-5" onClick={() => navigate("/shop")}>Buy data</Button></section> : visible.length === 0 ? <section className="onyx-panel rounded-[24px] p-7 text-center"><Search className="mx-auto text-primary-glow" size={26} /><h2 className="mt-4 font-display text-lg font-semibold text-white">No matching orders</h2><p className="mt-2 text-sm text-muted-foreground">Try another search or status filter.</p></section> : <>
        <section className="grid gap-3 xl:grid-cols-2">
          {visible.map((order) => {
            const status = customerStatus(order);
            return <Link key={order.id} to={`/track-order?reference=${encodeURIComponent(order.order_reference)}`} className="onyx-panel block rounded-[22px] p-5 transition hover:border-primary-glow/25">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-display text-[16px] font-semibold text-white">{order.data_products?.name ?? "Data bundle"}</p><p className="mt-1 font-mono text-xs text-faint-foreground">{order.order_reference}</p></div><Badge variant={status === "delivered" ? "success" : "amber"}>{label(status)}</Badge></div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-[11px] uppercase tracking-[0.12em] text-faint-foreground">Network</p><p className="mt-1 font-semibold text-foreground">{order.networks?.name ?? "—"}</p></div><div><p className="text-[11px] uppercase tracking-[0.12em] text-faint-foreground">Recipient</p><p className="mt-1 font-semibold text-foreground">{maskPhone(order.recipient_phone)}</p></div></div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4"><span className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("en-GH")}</span><span className="font-display font-semibold text-white">{formatGHS(Number(order.amount))}</span></div>
            </Link>;
          })}
        </section>
        <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Showing {from}–{to} of {filtered.length} orders</p><div className="flex items-center gap-2"><Button size="sm" variant="ghost" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> Previous</Button><span className="min-w-16 text-center text-xs font-semibold text-foreground">{safePage} / {totalPages}</span><Button size="sm" variant="ghost" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next <ChevronRight size={16} /></Button></div></div>
      </>}
    </div>
  );
}
