import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, PackageCheck, Search } from "lucide-react";
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
  order: (column: string, options?: { ascending?: boolean }) => QueryChain<T>;
}
interface Phase1Client { from: <T>(table: string) => QueryChain<T> }

function phase1() {
  return (supabase as unknown as { schema: (schema: string) => Phase1Client }).schema("phase1");
}

function readableStatus(status: string) {
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function Orders() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    let mounted = true;
    phase1()
      .from<OrderRow[]>("orders")
      .select("id, order_reference, recipient_phone, amount, currency, status, admin_resolution_status, payment_status, supplier_status, created_at, data_products(name), networks(name)")
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!mounted) return;
        setOrders(data ?? []);
        setError(queryError?.message ?? null);
        setLoading(false);
      });

    return () => { mounted = false; };
  }, [authLoading, isAuthenticated]);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="Data orders"
        title="Your orders"
        subtitle="View your purchases and follow every delivery."
        action={<Button variant="soft" onClick={() => navigate("/track-order")}><Search size={16} /> Track reference</Button>}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={17} /> Loading orders…</div>
      ) : error ? (
        <div className="rounded-2xl border border-danger/25 bg-danger/[0.08] p-4 text-sm text-ink-rose">We couldn't load your orders. Please refresh and try again.</div>
      ) : orders.length === 0 ? (
        <section className="onyx-panel rounded-[24px] p-7 text-center">
          <PackageCheck className="mx-auto text-primary-glow" size={28} />
          <h2 className="mt-4 font-display text-xl font-semibold text-white">No orders yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your first data purchase wil appear here.</p>
          <Button className="mt-5" onClick={() => navigate("/")}>Buy data</Button>
        </section>
      ) : (
        <section className="grid gap-3 xl:grid-cols-2">
          {orders.map((order) => (
            <Link key={order.id} to={`/track-order?reference=${encodeURIComponent(order.order_reference)}`} className="onyx-panel block rounded-[22px] p-5 transition hover:border-primary-glow/25">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[16px] font-semibold text-white">{order.data_products?.name ?? "Data bundle"}</p>
                  <p className="mt-1 text-xs text-faint-foreground">{order.order_reference} · {order.recipient_phone}</p>
                </div>
                <Badge variant={(order.admin_resolution_status ?? order.status) === "delivered" ? "success" : "amber"}>{readableStatus(order.admin_resolution_status ?? order.status)}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{order.networks?.name ?? "Network"} · {new Date(order.created_at).toLocaleString("en-GH")}</span>
              <span className="font-display font-semibold text-white">{formatGHS(Number(order.amount))}</span>
            </div>
          </Link>
        ))}
      </section>
    )}
  </div>
  );
}
