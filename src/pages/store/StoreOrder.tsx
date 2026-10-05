import { useEffect, useState } from "react";
import { storeBase } from "@/lib/storeHost";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, MessageCircle, Search, ShoppingBag, XCircle } from "lucide-react";
import Seo from "@/components/seo/Seo";
import StorePage from "@/components/store/StorePage";
import { useStore, waLink } from "@/components/store/StoreShell";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";

/* Phone-number lookup (status only; the buyer's checkout email unlocks the reference). */
interface PhoneResult { found: boolean; status?: string; network?: string; product?: string; store?: string | null; owner?: boolean; reference?: string | null; identity?: "account" | "email"; email_hint?: string | null }
const isPhone = (v: string) => /^0\d{9}$/.test(v.replace(/\D/g, "")) && !/[A-Z]/i.test(v.replace(/\d/g, "").trim() || "");
const phoneStatus = (st?: string) => st === "completed" ? "Delivered" : st === "awaiting_verification" ? "Being verified by MTN" : st === "refunded" ? "Refunded" : st === "wrong_network" ? "Wrong network" : st === "in_progress" ? "In progress" : "Needs support";

/* Payment result and order tracking, inside the agent's store.
   /s/:slug/success?reference=AG-…  (after Paystack)   /s/:slug/track?reference=AG-… */
interface Tracked { reference: string; recipient?: string; product?: string; network?: string; amount?: number; deliveryStatus?: string; statusMessage?: string }

export default function StoreOrder() {
  const store = useStore(); const { pathname } = useLocation(); const [params] = useSearchParams();
  const isSuccess = pathname.endsWith("/success");
  const [reference, setReference] = useState(params.get("reference") ?? "");
  const [input, setInput] = useState(params.get("reference") ?? "");
  const [order, setOrder] = useState<Tracked | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ok" | "missing">(params.get("reference") ? "loading" : "idle");
  const [phoneResult, setPhoneResult] = useState<PhoneResult | null>(null); const [phoneQueried, setPhoneQueried] = useState(""); const [ownerEmail, setOwnerEmail] = useState("");
  const lookupPhone = async (phone: string, email?: string) => {
    setPhase("loading"); setOrder(null); setPhoneResult(null);
    const { data } = await (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: PhoneResult | null }> } }).schema("phase1").rpc("track_by_phone", { p_phone: phone, p_email: email ?? null });
    if (!data?.found) { setPhase("missing"); return; }
    if (data.owner && data.reference) { setPhoneResult(null); setInput(data.reference); setReference(data.reference); return; }
    setPhoneResult(data); setPhoneQueried(phone); setPhase("idle");
  };
  const wa = waLink(store);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false; setPhase("loading");
    void (async () => {
      if (isSuccess) { try { await supabase.functions.invoke("reconcile-guest-order", { body: { orderReference: reference } }); } catch { /* best-effort */ } }
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-order?reference=${encodeURIComponent(reference)}`, { headers: { apikey: anonKey } });
      const payload = await res.json().catch(() => null);
      if (cancelled) return;
      if (res.ok && payload?.data) { setOrder(payload.data as Tracked); setPhase("ok"); } else setPhase("missing");
    })();
    return () => { cancelled = true; };
  }, [reference, isSuccess]);

  const st = order?.deliveryStatus ?? "";
  const tone = st === "completed" ? "good" : st === "refunded" || st === "cancelled" || st === "needs_support" || st === "wrong_network" ? "bad" : "wait";
  const Icon = tone === "good" ? CheckCircle2 : tone === "bad" ? XCircle : Clock;
  const title = isSuccess && phase === "ok" ? "Payment received" : st === "completed" ? "Delivered" : st === "awaiting_verification" ? "Being verified by MTN" : st === "refunded" ? "Refunded" : st === "needs_support" ? "Needs attention" : st === "wrong_network" ? "Wrong network" : st === "waiting_for_payment" ? "Waiting for payment" : "On its way";

  return (
    <StorePage title={isSuccess ? "Thank you" : "Track your order"} lead={isSuccess ? `Your payment to ${store.store_name} went through. Here's where your order is.` : "Enter the order ID from your receipt (starts with AG-) or the phone number the data was sent to."}>
    <div className="space-y-4">
      <Seo path={`${storeBase(store.slug)}/${isSuccess ? "success" : "track"}`} title={`${isSuccess ? "Payment received" : "Track your order"} · ${store.store_name}`} description={`Order status from ${store.store_name}.`} />
      {!isSuccess && (
        <form className="onyx-panel flex gap-2 rounded-2xl p-3" onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (!v) return; if (isPhone(v)) void lookupPhone(v.replace(/\D/g, "")); else setReference(v.toUpperCase()); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Order ID or phone number" className="onyx-field flex-1" /><button type="submit" className="onyx-btn-primary px-4 py-2 text-[13px]"><Search size={14} /></button>
        </form>
      )}
      {phoneResult && !order && (
        <div className="onyx-panel rounded-3xl p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">Latest order for {phoneQueried}</p>
          <p className="mt-1.5 font-display text-[20px] font-semibold text-foreground">{phoneStatus(phoneResult.status)}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{phoneResult.network} · {phoneResult.product?.replace(/^.*?—\s*/, "")}{phoneResult.store ? ` · via ${phoneResult.store}` : ""}</p>
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <p className="text-[12.5px] font-semibold text-foreground">Did you pay for this order?</p>
            {phoneResult.identity === "account" ? <p className="mt-1 text-[12.5px] text-muted-foreground">Sign in on datayego.com with the account you ordered with to see the full details.</p> : (<>
              <p className="mt-1 text-[12.5px] text-muted-foreground">Enter the email you used at checkout{phoneResult.email_hint ? ` (${phoneResult.email_hint})` : ""} to see the order ID and details.</p>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (ownerEmail.trim()) void lookupPhone(phoneQueried, ownerEmail.trim()); }}><input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} type="email" autoCapitalize="none" placeholder="Email you paid with" className="onyx-field flex-1" /><button type="submit" className="onyx-btn-primary px-4 py-2 text-[13px]">Show</button></form>
            </>)}
          </div>
        </div>
      )}
      {phase === "loading" && <div className="onyx-panel rounded-3xl p-8 text-center text-[13px] text-muted-foreground">Checking your order…</div>}
      {phase === "missing" && <div className="onyx-panel rounded-3xl p-8 text-center"><XCircle size={30} className="mx-auto text-danger" /><p className="mt-3 text-[16px] font-semibold text-foreground">We couldn't find that order</p><p className="mt-1 text-[13px] text-muted-foreground">Check the ID on your receipt — it starts with AG-.</p></div>}
      {phase === "ok" && order && (
        <div className="onyx-panel rounded-3xl p-6 text-center">
          <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${tone === "good" ? "bg-primary/15 text-primary-glow" : tone === "bad" ? "bg-danger/15 text-danger" : "bg-amber/15 text-amber"}`}><Icon size={30} /></span>
          <h1 className="mt-4 font-display text-[24px] font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{order.statusMessage}</p>
          <div className="mx-auto mt-4 max-w-sm rounded-2xl border border-white/[0.08] text-left text-[13px]">
            {[["Order ID", order.reference], ["Bundle", `${order.network ?? ""} ${order.product?.replace(/^.*?—\s*/, "") ?? ""}`.trim()], ["Recipient", order.recipient ?? "—"], ["Amount", order.amount != null ? formatGHS(Number(order.amount)) : "—"]].map(([l, v], i) => <div key={l} className={`flex items-center justify-between gap-4 px-3.5 py-2.5 ${i ? "border-t border-white/[0.06]" : ""}`}><span className="text-faint-foreground">{l}</span><span className={`font-semibold text-foreground ${l === "Order ID" ? "font-mono" : ""}`}>{v}</span></div>)}
          </div>
          {st === "wrong_network" && <Link to={`/track-order?reference=${encodeURIComponent(order.reference)}`} className="mx-auto mt-3 block max-w-sm rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-left text-[12.5px] leading-5 text-foreground"><b>This number isn't on the network you chose.</b> Tap here to enter the correct number and we'll send your bundle straight away.</Link>}
          {isSuccess && <p className="mt-3 text-[11.5px] text-faint-foreground">Keep your Order ID — it's how you check this order any time. We've emailed it to you too.</p>}
          <div className="mx-auto mt-5 grid max-w-sm gap-2 sm:grid-cols-2">
            <Link to={`${storeBase(store.slug)}`} className="onyx-btn-primary py-2.5 text-center text-[13.5px]"><ShoppingBag size={15} className="mr-1 inline" />Buy more data</Link>
            {wa ? <a href={`${wa}?text=${encodeURIComponent(`Hello, about my order ${order.reference}`)}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/[0.12] py-2.5 text-center text-[13.5px] text-foreground"><MessageCircle size={15} className="mr-1 inline" />Ask on WhatsApp</a> : <Link to={`${storeBase(store.slug)}/track?reference=${order.reference}`} className="rounded-full border border-white/[0.12] py-2.5 text-center text-[13.5px] text-foreground">Track later</Link>}
          </div>
        </div>
      )}
    </div>
    </StorePage>
  );
}
