import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import Monogram from "@/components/brand/Monogram";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

interface PublicOrderStatus {
  reference: string;
  recipient: string;
  network?: string;
  product?: string;
  amount: number;
  currency: string;
  orderStatus: string;
  systemOrderStatus?: string;
  statusMessage?: string;
  statusUpdatedAt?: string;
  paymentStatus: string;
  supplierStatus?: string;
  createdAt: string;
  updatedAt: string;
}

function statusLabel(status?: string) {
  switch (status) {
    case "delivered":
      return "Delivered";
    case "paid":
    case "processing":
    case "pending_supplier":
      return "Processing";
    case "failed":
    case "failed_needs_review":
      return "Needs support";
    case "refunded":
      return "Refunded";
    case "awaiting_payment":
      return "Awaiting payment";
    default:
      return status ?? "Unknown";
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

  const lookup = async (nextReference = reference) => {
    if (!nextReference.trim()) return;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ reference: nextReference.trim() });
    if (phone.trim()) query.set("phone", phoneDigits);

    const { data, error: functionError } = await supabase.functions.invoke<{
      status: string;
      data: PublicOrderStatus;
      error?: string;
    }>(`track-order?${query.toString()}`, {
      method: "GET",
    });

    if (functionError || data?.error) {
      const message = data?.error ?? functionError?.message ?? "";
      setError(message.toLowerCase().includes("phone") ? "Enter the recipient phone number to track this order." : "We couldn't find an order matching those details.");
      setOrder(null);
    } else {
      setOrder(data?.data ?? null);
    }

    setLoading(false);
  };

  useEffect(() => {
    const initialReference = searchParams.get("reference");
    if (initialReference) {
      lookup(initialReference);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="onyx-canvas min-h-dvh px-5 py-8">
      <div className="onyx-aurora" aria-hidden="true">
        <span className="onyx-aurora-a" />
        <span className="onyx-aurora-b" />
        <span className="onyx-grain" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[760px] items-center">
        <Card className="w-full">
          <CardContent className="p-6 sm:p-7">
            <Link to="/" className="mb-8 inline-flex items-center gap-3">
              <Monogram size={42} />
              <div>
                <p className="font-display text-lg font-semibold text-white">YieGo</p>
                <p className="text-xs text-faint-foreground">Order tracking</p>
              </div>
            </Link>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-glow">
                Order lookup
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-white">
                Track your data order
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {isAuthenticated
                  ? "Enter your YieGo order reference to see its payment and delivery status. Your own orders can be opened without re-entering the recipient number."
                  : "Enter your YieGo order reference and the recipient phone number used at checkout."}
              </p>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_0.8fr_auto]">
              <input
                className="onyx-field"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="YG-ORDERREF"
              />
              <input
                className="onyx-field"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={isAuthenticated ? "Phone for guest orders" : "Recipient phone"}
                inputMode="numeric"
              />
              <Button onClick={() => lookup()} disabled={loading || !reference.trim() || (!isAuthenticated && !phoneValid)}>
                {loading ? <Loader2 className="animate-spin" /> : <Search />}
                Track
              </Button>
            </div>

            {!isAuthenticated && phone.length > 0 && !phoneValid && <p className="mt-2 text-xs text-danger">Enter the 10-digit recipient number beginning with 0.</p>}

            {error && (
              <div className="mt-5 rounded-2xl border border-danger/25 bg-danger/[0.08] p-4 text-sm text-ink-rose">
                {error}
              </div>
            )}

            {order && (
              <div className="mt-6 rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] text-faint-foreground">Order reference</p>
                    <p className="font-display text-xl font-semibold text-white">{order.reference}</p>
                  </div>
                  <Badge variant={order.orderStatus === "delivered" ? "success" : "amber"}>
                    <ShieldCheck size={12} />
                    {statusLabel(order.orderStatus)}
                  </Badge>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Network", order.network ?? "—"],
                    ["Bundle", order.product ?? "—"],
                    ["Recipient", order.recipient],
                    ["Payment", statusLabel(order.paymentStatus)],
                    ["Amount", formatGHS(Number(order.amount))],
                    ["Delivery", statusLabel(order.supplierStatus ?? "processing")],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
                        {label}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>

                {order.statusMessage && (
                  <div className="mt-4 rounded-2xl border border-primary-glow/15 bg-primary/[0.06] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-glow">Latest update</p>
                    <p className="mt-1 text-sm leading-6 text-foreground">{order.statusMessage}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
