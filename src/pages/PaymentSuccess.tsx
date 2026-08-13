import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Copy, Loader2, Search, ShoppingBag, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { toast } from "sonner";

// Shared with TrackOrder so a paid order is remembered on this device.
const RECENT_KEY = "yiego_recent_orders_v1";
function rememberRecent(ref: string) {
  try {
    const cur = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    const list = Array.isArray(cur) ? cur.filter((r) => typeof r === "string" && r !== ref) : [];
    localStorage.setItem(RECENT_KEY, JSON.stringify([ref, ...list].slice(0, 5)));
  } catch {
    /* storage disabled — no-op */
  }
}

type Phase = "loading" | "success" | "pending" | "error";
interface OrderInfo { reference: string; recipient?: string; product?: string; network?: string; amount?: number; }
interface DepositInfo { amount: number; balance: number }

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const reference = (params.get("reference") ?? params.get("trxref") ?? "").trim();
  const kind = params.get("type") === "deposit" ? "deposit" : "order";
  const [phase, setPhase] = useState<Phase>("loading");
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!reference) { setPhase("error"); setMessage("We couldn't find a payment reference for this page."); return; }
    let cancelled = false;

    void (async () => {
      if (kind === "deposit") {
        const { data, error } = await supabase.functions.invoke<{ status?: string; amount?: number; balance?: number; message?: string; error?: string }>(
          "verify-wallet-deposit",
          { body: { reference } },
        );
        if (cancelled) return;
        if (data?.status === "success") {
          setDeposit({ amount: Number(data.amount ?? 0), balance: Number(data.balance ?? 0) });
          setPhase("success");
        } else {
          setPhase("pending");
          setMessage(data?.message ?? data?.error ?? error?.message ?? "Paystack is still confirming this top-up. Your balance will update shortly.");
        }
        return;
      }

      // Data order: self-heal a slow webhook, then read the confirmed status.
      try { await supabase.functions.invoke("reconcile-guest-order", { body: { orderReference: reference } }); } catch { /* best-effort */ }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const headers: Record<string, string> = { apikey: anonKey };
      if (token) headers.Authorization = `Bearer ${token}`;

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-order?reference=${encodeURIComponent(reference)}`,
          { headers },
        );
        const payload = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && payload?.data) {
          const d = payload.data;
          setOrder({ reference: d.reference, recipient: d.recipient, product: d.product, network: d.network, amount: Number(d.amount) });
          rememberRecent(reference);
          if (d.paymentStatus === "succeeded") {
            setPhase("success");
          } else {
            setPhase("pending");
            setMessage("We're still confirming your payment with Paystack — this usually takes a few seconds.");
          }
        } else {
          setOrder({ reference });
          setPhase("pending");
          setMessage("We're confirming your payment. You can track this order with your Order ID in a moment.");
        }
      } catch {
        if (cancelled) return;
        setOrder({ reference });
        setPhase("pending");
        setMessage("We couldn't reach the server to confirm — your Order ID is safe below, track it shortly.");
      }
    })();

    return () => { cancelled = true; };
  }, [reference, kind]);

  const copyRef = (ref: string) => { void navigator.clipboard.writeText(ref); toast.success("Order ID copied"); };

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <Card className="w-full">
        <CardContent className="p-6 sm:p-8">

          {phase === "loading" && (
            <div className="grid min-h-[320px] place-items-center text-center">
              <div>
                <Loader2 className="mx-auto animate-spin text-primary-glow" size={30} />
                <p className="mt-4 text-sm text-muted-foreground">Confirming your payment…</p>
              </div>
            </div>
          )}

          {/* ── Data order, confirmed ─────────────────────────────── */}
          {phase === "success" && kind === "order" && (
            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/[0.12] text-success"><CheckCircle2 size={34} /></div>
              <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-white">Payment successful</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Your data order is confirmed and on its way{order?.recipient ? <> to <span className="font-semibold text-foreground">{order.recipient}</span></> : null}.</p>

              <button type="button" onClick={() => order && copyRef(order.reference)} className="mx-auto mt-6 flex w-full max-w-sm items-center justify-between rounded-2xl border border-primary-glow/20 bg-primary/[0.07] px-4 py-4">
                <span className="text-left"><span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-glow">Your Order ID</span><span className="font-mono text-lg font-semibold text-white">{order?.reference}</span></span>
                <Copy size={18} className="text-primary-glow" />
              </button>

              <div className="mx-auto mt-4 max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 text-left">
                {[["Bundle", order?.network && order?.product ? `${order.network} · ${order.product}` : order?.product ?? "Data bundle"], ["Recipient", order?.recipient ?? "—"], ["Amount", order?.amount != null ? formatGHS(order.amount) : "—"]].map(([label, value], i) => (
                  <div key={label} className={`flex items-center justify-between gap-4 px-3.5 py-3 ${i ? "border-t border-white/[0.05]" : ""}`}><span className="text-[12.5px] text-faint-foreground">{label}</span><span className="text-right text-[13.5px] font-semibold text-foreground">{value}</span></div>
                ))}
              </div>

              <p className="mx-auto mt-4 max-w-sm text-xs leading-5 text-faint-foreground">Keep your Order ID — it's how you track this order any time. We've also emailed it to you.</p>

              <div className="mx-auto mt-6 grid max-w-sm gap-2 sm:grid-cols-2">
                <Button asChild><Link to={`/track-order?reference=${encodeURIComponent(order?.reference ?? "")}`}><Search size={16} />Track this order</Link></Button>
                <Button asChild variant="soft"><Link to="/shop"><ShoppingBag size={16} />Buy more data</Link></Button>
              </div>
            </div>
          )}

          {/* ── Wallet top-up, confirmed ──────────────────────────── */}
          {phase === "success" && kind === "deposit" && (
            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/[0.12] text-success"><CheckCircle2 size={34} /></div>
              <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-white">Wallet topped up</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">{formatGHS(deposit?.amount ?? 0)}</span> was added to your YieGo Wallet.</p>

              <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-primary-glow/20 bg-primary/[0.07] px-4 py-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-glow">New balance</p>
                <p className="mt-1 font-display text-3xl font-semibold text-white">{formatGHS(deposit?.balance ?? 0)}</p>
              </div>

              <div className="mx-auto mt-6 grid max-w-sm gap-2 sm:grid-cols-2">
                <Button asChild><Link to="/shop"><ShoppingBag size={16} />Buy data</Link></Button>
                <Button asChild variant="soft"><Link to="/wallet"><WalletCards size={16} />View wallet</Link></Button>
              </div>
            </div>
          )}

          {/* ── Still confirming ──────────────────────────────────── */}
          {phase === "pending" && (
            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber/[0.12] text-amber"><Clock size={32} /></div>
              <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-white">Confirming your payment</h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
              {kind === "order" && order?.reference && (
                <button type="button" onClick={() => copyRef(order.reference)} className="mx-auto mt-5 flex w-full max-w-sm items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5"><span className="font-mono font-semibold text-white">{order.reference}</span><Copy size={16} className="text-primary-glow" /></button>
              )}
              <div className="mx-auto mt-6 grid max-w-sm gap-2 sm:grid-cols-2">
                {kind === "order"
                  ? <Button asChild><Link to={`/track-order?reference=${encodeURIComponent(order?.reference ?? "")}`}><Search size={16} />Track order</Link></Button>
                  : <Button asChild><Link to="/wallet"><WalletCards size={16} />View wallet</Link></Button>}
                <Button asChild variant="soft"><Link to="/shop">Back to shop<ArrowRight size={16} /></Link></Button>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold text-white">Something's not right</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
              <div className="mx-auto mt-6 grid max-w-sm gap-2 sm:grid-cols-2">
                <Button asChild><Link to="/track-order"><Search size={16} />Track an order</Link></Button>
                <Button asChild variant="soft"><Link to="/shop">Go to shop</Link></Button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
