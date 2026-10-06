import { useEffect, useState } from "react";
import { storeBase } from "@/lib/storeHost";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";
import { LogOut, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/components/store/StoreShell";
import StorePage from "@/components/store/StorePage";
import { useAuth } from "@/store/auth-context";
import { formatGHS } from "@/lib/format";

/* The customer's account on this store: wallet balance, their orders here, sign out. */
interface Row { order_reference: string; network: string; product: string; recipient_phone: string; amount: number; status: string; payment_status: string; admin_resolution_status: string | null; paid_at: string | null; created_at: string }
const label = (r: Row) => r.payment_status === "refunded" ? "Refunded" : r.payment_status !== "succeeded" ? "Not paid" : r.admin_resolution_status === "awaiting_verification" ? "MTN verifying" : r.admin_resolution_status === "wrong_network" ? "Wrong network" : r.status === "delivered" ? "Delivered" : r.status === "failed" ? "Needs support" : "In progress";

export default function StoreAccount() {
  const store = useStore(); const { slug: paramSlug } = useParams(); const slug = paramSlug ?? store.slug; const navigate = useNavigate();
  const { isAuthenticated, user, signOut, loading } = useAuth();
  const [orders, setOrders] = useState<Row[] | null>(null); const [balance, setBalance] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false); const [sp, setSp] = useSearchParams(); const [reloadKey, setReloadKey] = useState(0);
  // Back from Paystack after a top-up: confirm it and refresh the balance.
  useEffect(() => {
    const ref = sp.get("deposit"); if (!ref || !isAuthenticated) return;
    void supabase.functions.invoke<{ status?: string; amount?: number; error?: string }>("verify-wallet-deposit", { body: { reference: ref } }).then(({ data }) => {
      if (data?.status === "success") toast.success(`${formatGHS(Number(data.amount ?? 0))} added to your wallet.`); else toast.error(data?.error ?? "We couldn't confirm that top-up yet. It will show once it clears.");
      sp.delete("deposit"); setSp(sp, { replace: true }); setReloadKey((k) => k + 1);
    });
  }, [sp, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading && !isAuthenticated) navigate(`${storeBase(slug)}/sign-in`, { replace: true }); }, [loading, isAuthenticated, slug, navigate]);
  useEffect(() => {
    if (!isAuthenticated) return;
    const p1 = (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }>; from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { balance: number } | null }> } } } } }).schema("phase1");
    void p1.rpc("my_store_orders", { p_slug: slug }).then(({ data }) => setOrders((data as Row[]) ?? []));
    void p1.from("wallets").select("balance").eq("user_id", user!.id).maybeSingle().then(({ data }) => setBalance(Number(data?.balance ?? 0)));
  }, [isAuthenticated, slug, user, reloadKey]);
  if (!isAuthenticated) return null;
  return (
    <StorePage title="Your account" lead={user?.email}>
    <div className="space-y-4">
      <section className="onyx-panel rounded-[22px] p-5">
        <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3"><span className="flex items-center gap-2 text-[13px] text-muted-foreground"><Wallet size={15} />Wallet</span><span className="flex items-center gap-2"><span className="font-display text-[18px] font-semibold text-foreground">{balance == null ? "…" : formatGHS(balance)}</span><button type="button" onClick={() => setAddOpen(true)} className="onyx-btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px]"><Plus size={13} />Add money</button></span></div>
        <p className="mt-2 text-[11.5px] text-faint-foreground">Top up with MoMo or card, then pay from your wallet at checkout with no payment fee.</p>
      </section>
      <section className="onyx-panel rounded-[22px] p-5">
        <h2 className="text-[15px] font-semibold text-foreground">Your orders at {store.store_name}</h2>
        {orders === null ? <p className="mt-3 text-[13px] text-muted-foreground">Loading…</p> : orders.length === 0 ? <p className="mt-3 text-[13px] text-muted-foreground">No orders yet. <Link to={`${storeBase(slug)}`} className="font-semibold text-primary-glow">Buy a bundle</Link></p> : (
          <ul className="mt-3 divide-y divide-white/[0.06]">{orders.map((r) => <li key={r.order_reference}><Link to={`${storeBase(slug)}/track?reference=${r.order_reference}`} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block text-[13.5px] font-semibold text-foreground">{r.network} · {r.product.replace(/^.*?—\s*/, "")} · {r.recipient_phone}</span><span className="block text-[11.5px] text-faint-foreground">{r.order_reference} · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></span><span className="shrink-0 text-right"><span className="block text-[13px] font-semibold text-foreground">{formatGHS(Number(r.amount))}</span><span className="block text-[11px] text-muted-foreground">{label(r)}</span></span></Link></li>)}</ul>
        )}
      </section>
      <button type="button" onClick={() => void signOut().then(() => navigate(`${storeBase(slug)}`)).catch(() => toast.error("Could not sign out."))} className="flex items-center gap-2 px-2 text-[13px] text-danger"><LogOut size={14} />Sign out</button>
    </div>
    <AddMoneyFlow open={addOpen} onClose={() => { setAddOpen(false); setReloadKey((k) => k + 1); }} />
    </StorePage>
  );
}
