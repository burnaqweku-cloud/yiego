import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Loader2, Search, ShieldCheck } from "lucide-react";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { orderPaymentAction } from "@/lib/phase1-api";
import { useAuth } from "@/store/auth-context";

interface PublicOrderStatus {
  reference: string;
  recipient: string;
  network?: string;
  product?: string;
  amount: number;
  currency: string;
  orderStatus: string;
  statusMessage?: string;
  paymentStatus: string;
  deliveryStatus: string;
  createdAt: string;
  updatedAt: string;
}

// Order references the guest has looked up on THIS device. Lets someone who
// closed the tab find their order again without an account or the email.
const RECENT_KEY = "yiego_recent_orders_v1";
function getRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((r) => typeof r === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}
function rememberRecent(ref: string) {
  try {
    const next = [ref, ...getRecent().filter((r) => r !== ref)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode / storage disabled — tracking still works, just not remembered */
  }
}

function statusLabel(status?: string) {
  switch (status) {
    case "completed":
    case "delivered": return "Completed";
    case "succeeded": return "Successful";
    case "paid":
    case "processing":
    case "pending_supplier":
    case "in_progress": return "In progress";
    case "waiting_for_payment":
    case "awaiting_payment":
    case "pending": return "Waiting for payment";
    case "needs_support":
    case "failed":
    case "failed_needs_review": return "Needs support";
    case "refunded": return "Refunded";
    case "cancelled": return "Cancelled";
    default: return status ? status.replaceAll("_", " ") : "Unknown";
  }
}

export default function TrackOrder() {
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const [reference, setReference] = useState(searchParams.get("reference") ?? "");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => setRecent(getRecent()), []);

  const fetchStatus = async (ref: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const headers: Record<string, string> = { apikey: anonKey };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-order?reference=${encodeURIComponent(ref)}`,
      { method: "GET", headers },
    );
    const payload = await response.json().catch(() => null);
    return { response, payload };
  };

  const lookup = async (nextReference = reference) => {
    const ref = nextReference.trim().toUpperCase();
    if (!ref) return;
    setLoading(true);
    setError(null);

    try {
      let { response, payload } = await fetchStatus(ref);

      // Self-heal: if the order exists but payment hasn't been confirmed on our
      // side, a Paystack webhook may have been missed. Reconcile directly with
      // Paystack, then re-read. Safe and idempotent — only completes an order
      // Paystack confirms as paid.
      if (response.ok && payload?.data && payload.data.paymentStatus !== "succeeded") {
        try {
          await supabase.functions.invoke("reconcile-guest-order", { body: { orderReference: ref } });
          ({ response, payload } = await fetchStatus(ref));
        } catch {
          /* reconcile is best-effort; fall through to whatever status we have */
        }
      }

      if (response.ok && payload?.data) {
        setOrder(payload.data as PublicOrderStatus);
        setError(null);
        rememberRecent(ref);
        setRecent(getRecent());
      } else if (response.status === 404) {
        setOrder(null);
        setError("No order found with that reference. Double-check the YG- reference.");
      } else {
        setOrder(null);
        setError(payload?.error ?? "We couldn't load this order right now. Please try again.");
      }
    } catch {
      setOrder(null);
      setError("Network error while looking up this order. Please try again.");
    }
    setLoading(false);
  };

  const continuePayment = async () => {
    if (!order) return;
    setPaying(true);
    const { data, error: actionError } = await orderPaymentAction<{ authorizationUrl?: string }>(
      "pay_paystack",
      order.reference,
    );
    setPaying(false);
    const url = data?.data?.authorizationUrl;
    if (url) window.location.href = url;
    else setError(actionError ?? data?.error ?? "Sign in with the account used at checkout to continue this payment.");
  };

  useEffect(() => {
    const initialReference = searchParams.get("reference");
    if (initialReference) lookup(initialReference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The site header and footer wrap this page now — it carries only its own
  // content, centred in the standard column.
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <Seo {...metaFor("/track-order")} />
      <Card className="w-full">
        <CardContent className="p-6 sm:p-7">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-glow">Order lookup</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-white">Track your data order</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your DataYego order reference — the <span className="font-mono text-foreground">YG-</span> code from your receipt or the link we sent you back to after payment. That's all you need.</p></div>
            <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input className="onyx-field font-mono uppercase" value={reference} onChange={(event) => setReference(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") lookup(); }} placeholder="YG-XXXXXXXXXX" aria-label="Order reference" />
              <Button onClick={() => lookup()} disabled={loading || !reference.trim()}>{loading ? <Loader2 className="animate-spin" /> : <Search />}Track</Button>
            </div>

            {recent.length > 0 && !order && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">Recent orders on this device</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recent.map((ref) => (
                    <button key={ref} type="button" onClick={() => { setReference(ref); lookup(ref); }} className="onyx-pill font-mono text-xs">{ref}</button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="mt-5 rounded-2xl border border-danger/25 bg-danger/[0.08] p-4 text-sm text-ink-rose">{error}</div>}
            {order && <div className="mt-6 rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[12px] text-faint-foreground">Order reference</p><p className="font-display text-xl font-semibold text-white">{order.reference}</p></div><Badge variant={order.orderStatus === "completed" ? "success" : "amber"}><ShieldCheck size={12} />{statusLabel(order.orderStatus)}</Badge></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">{[["Network", order.network ?? "—"],["Bundle", order.product ?? "—"],["Recipient", order.recipient],["Payment", statusLabel(order.paymentStatus)],["Amount", formatGHS(Number(order.amount))],["Delivery", statusLabel(order.deliveryStatus)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">{label}</p><p className="mt-1 text-sm font-semibold capitalize text-foreground">{value}</p></div>)}</div>
              {order.statusMessage && <div className="mt-4 rounded-2xl border border-primary-glow/15 bg-primary/[0.06] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-glow">Latest update</p><p className="mt-1 text-sm leading-6 text-foreground">{order.statusMessage}</p></div>}
              {order.paymentStatus !== "succeeded" && !["cancelled", "refunded"].includes(order.orderStatus) && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={continuePayment} disabled={paying}>{paying ? <Loader2 className="animate-spin" /> : <CreditCard />}Continue payment</Button>
                  {!isAuthenticated && <p className="text-xs text-muted-foreground">Sign in with the account used at checkout to continue this payment.</p>}
                </div>
              )}
            </div>}

          </CardContent>
        </Card>
    </div>
  );
}
