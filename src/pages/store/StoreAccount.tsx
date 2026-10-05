import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LogOut, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/components/store/StoreShell";
import { useAuth } from "@/store/auth-context";
import { formatGHS } from "@/lib/format";

/* The customer's account on this store: wallet balance, their orders here, sign out. */
interface Row { order_reference: string; network: string; product: string; recipient_phone: string; amount: number; status: string; payment_status: string; admin_resolution_status: string | null; paid_at: string | null; created_at: string }
const label = (r: Row) => r.payment_status === "refunded" ? "Refunded" : r.payment_status !== "succeeded" ? "Not paid" : r.admin_resolution_status === "awaiting_verification" ? "MTN verifying" : r.admin_resolution_status === "wrong_network" ? "Wrong network" : r.status === "delivered" ? "Delivered" : r.status === "failed" ? "Needs support" : "In progress";

export default function StoreAccount() {
  const store = useStore(); const { slug = "" } = useParams(); const navigate = useNavigate();
  const { isAuthenticated, user, signOut, loading } = useAuth();
  const [orders, setOrders] = useState<Row[] | null>(null); const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => { if (!loading && !isAuthenticated) navigate(`/s/${slug}/sign-in`, { replace: true }); }, [loading, isAuthenticated, slug, navigate]);
  useEffect(() => {
    if (!isAuthenticated) return;
    const p1 = (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }>; from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { balance: number } | null }> } } } } }).schema("phase1");
    void p1.rpc("my_store_orders", { p_slug: slug }).then(({ data }) => setOrders((data as Row[]) ?? []));
    void p1.from("wallets").select("balance").eq("user_id", user!.id).maybeSingle().then(({ data }) => setBalance(Number(data?.balance ?? 0)));
  }, [isAuthenticated, slug, user]);
  if (!isAuthenticated) return null;
  return (
    <div className="space-y-4">
      <section className="onyx-panel rounded-[22px] p-5">
        <h1 className="font-display text-[22px] font-semibold text-foreground">Your account</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{user?.email}</p>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3"><span className="flex items-center gap-2 text-[13px] text-muted-foreground"><Wallet size={15} />Wallet</span><span className="font-display text-[18px] font-semibold text-foreground">{balance == null ? "…" : formatGHS(balance)}</span></div>
        <p className="mt-2 text-[11.5px] text-faint-foreground">Pay from your wallet at checkout, or add money when you buy.</p>
      </section>
      <section className="onyx-panel rounded-[22px] p-5">
        <h2 className="text-[15px] font-semibold text-foreground">Your orders at {store.store_name}</h2>
        {orders === null ? <p className="mt-3 text-[13px] text-muted-foreground">Loading…</p> : orders.length === 0 ? <p className="mt-3 text-[13px] text-muted-foreground">No orders yet. <Link to={`/s/${slug}`} className="font-semibold text-primary-glow">Buy a bundle</Link></p> : (
          <ul className="mt-3 divide-y divide-white/[0.06]">{orders.map((r) => <li key={r.order_reference}><Link to={`/s/${slug}/track?reference=${r.order_reference}`} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block text-[13.5px] font-semibold text-foreground">{r.network} · {r.product.replace(/^.*?—\s*/, "")} · {r.recipient_phone}</span><span className="block text-[11.5px] text-faint-foreground">{r.order_reference} · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></span><span className="shrink-0 text-right"><span className="block text-[13px] font-semibold text-foreground">{formatGHS(Number(r.amount))}</span><span className="block text-[11px] text-muted-foreground">{label(r)}</span></span></Link></li>)}</ul>
        )}
      </section>
      <button type="button" onClick={() => void signOut().then(() => navigate(`/s/${slug}`)).catch(() => toast.error("Could not sign out."))} className="flex items-center gap-2 px-2 text-[13px] text-danger"><LogOut size={14} />Sign out</button>
    </div>
  );
}
