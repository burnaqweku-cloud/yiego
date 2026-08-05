import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Loader2, Search, ShieldCheck } from "lucide-react";
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
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = /^0\d{9}$/.test(phoneDigits);

  const [needsPhone, setNeedsPhone] = useState(false);
  const [paying, setPaying] = useState(false);

  const lookup = async (nextReference = reference, phoneOverride?: string) => {
    const ref = nextReference.trim().toUpperCase();
    if (!ref) return;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ reference: ref });
    const digits = (phoneOverride ?? phone).replace(/\D/g, "");
    if (digits) query.set("phone", digits);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const headers: Record<string, string> = { apikey: anonKey };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-order?${query.toString()}`,
        { method: "GET", headers },
      );
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.data) {
        setOrder(payload.data as PublicOrderStatus);
        setNeedsPhone(false);
        setError(null);
      } else if (response.status === 400) {
        // Reference accepted, but we still need the recipient number to release details.
        setOrder(null);
        setNeedsPhone(true);
        setError("Enter the recipient phone number used at checkout to view this order.");
      } else if (response.status === 404) {
        setOrder(null);
        setNeedsPhone(false);
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
      <Card className="w-full">
        <CardContent className="p-6 sm:p-7">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-glow">Order lookup</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-white">Track your data order</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{isAuthenticated ? "Enter your YieGo order reference to see its payment and delivery status. Your own orders can be opened without re-entering the recipient number." : "Enter your YieGo order reference and the recipient phone number used at checkout."}</p></div>
            <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_0.8fr_auto]">
              <input className="onyx-field" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="YG-ORDERREF" />
              <input className="onyx-field" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={isAuthenticated ? "Phone for guest orders" : "Recipient phone"} inputMode="numeric" />
              <Button onClick={() => lookup()} disabled={loading || !reference.trim() || (needsPhone && !phoneValid)}>{loading ? <Loader2 className="animate-spin" /> : <Search />}Track</Button>
            </div>
            {phone.length > 0 && !phoneValid && <p className="mt-2 text-xs text-danger">Enter the 10-digit recipient number beginning with 0.</p>}
            {error && <div className="mt-5 rounded-2xl border border-danger/25 bg-danger/[0.08] p-4 text-sm text-ink-rose">{error}</div>}
            {order && <div className="mt-6 rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[12px] text-faint-foreground">Order reference</p><p className="font-display text-xl font-semibold text-white">{order.reference}</p></div><Badge variant={order.orderStatus === "completed" ? "success" : "amber"}><ShieldCheck size={12} />{statusLabel(order.orderStatus)}</Badge></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">{[["Network", order.network ?? "—"],["Bundle", order.product ?? "—"],["Recipient", order.recipient],["Payment", statusLabel(order.paymentStatus)],["Amount", formatGHS(Number(order.amount))],["Delivery", statusLabel(order.deliveryStatus)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">{label}</p><p className="mt-1 text-sm font-semibold capitalize text-foreground">{value}</p></div>)}</div>
              {order.statusMessage && <div className="mt-4 rounded-2xl border border-primary-glow/15 bg-primary/[0.06] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-glow">Latest update</p><p className="mt-1 text-sm leading-6 text-foreground">{order.statusMessage}</p></div>}
              {order.paymentStatus !== "succeeded" && !["cancelled", "refunded"].includes(order.orderStatus) && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={continuePayment} disabled={paying}>{paying ? <Loader2 className="animate-spin" /> : <CreditCard />}Continue payment</Button>
                  {!isAuthenticated && <p className="text-xs text-muted-foreground">Sign in with the account used at checkout to complete this payment.</p>}
                </div>
              )}
            </div>}

          </CardContent>
        </Card>
    </div>
  );
}
