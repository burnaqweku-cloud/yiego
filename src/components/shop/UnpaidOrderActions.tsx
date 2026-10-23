import { useState } from "react";
import { CreditCard, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/format";
import { savedOrderToken, unpaidOrderAction, type UnpaidDetails } from "@/lib/unpaidOrders";
import { useAuth } from "@/store/auth-context";

export default function UnpaidOrderActions({ reference, onCancelled }: { reference: string; onCancelled: () => void }) {
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState<UnpaidDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsEmail = !isAuthenticated && !savedOrderToken(reference);
  async function run(action: "lookup" | "continue" | "cancel") {
    if (action === "cancel" && !window.confirm(`Cancel unpaid order ${reference}? You can place a new order afterwards.`)) return;
    setBusy(true); setError("");
    try {
      const result = await unpaidOrderAction(action, reference, email);
      if (action === "cancel") { onCancelled(); return; }
      if (action === "continue" && result?.paymentUrl) { window.location.assign(result.paymentUrl); return; }
      if (result) setDetails(result);
    } catch { setError("We couldn't confirm this unpaid order. Use the account or email used at checkout, or ask support to cancel it."); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 border-t border-border pt-4 text-left">
    <h3 className="text-sm font-semibold text-foreground">Order awaiting payment</h3>
    <p className="mt-1 text-sm text-muted-foreground">Continue payment, or cancel this order before placing a new one for this number.</p>
    <label className="mt-3 block text-sm text-foreground">Email used at checkout{!needsEmail && <span className="text-muted-foreground"> (only needed if this was a guest order on another device)</span>}<input className="onyx-field mt-1 w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your checkout email" /></label>
    {details && <dl className="mt-3 divide-y divide-border text-sm">{[["Order ID", details.reference], ["Bundle", `${details.network} · ${details.product}`], ["Recipient", details.recipient], ["Amount", formatGHS(Number(details.amount))], ["Placed", new Date(details.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Accra" })]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-right font-medium text-foreground">{value}</dd></div>)}</dl>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {!details ? <Button disabled={busy || (needsEmail && !email.trim())} onClick={() => void run("lookup")}>{busy ? <Loader2 className="animate-spin" /> : <CreditCard />}Show unpaid order</Button> : <><Button disabled={busy} onClick={() => void run("continue")}><CreditCard />Continue payment</Button><Button variant="ghost" disabled={busy} onClick={() => void run("cancel")}><X />Cancel order</Button></>}
    </div>
  </section>;
}