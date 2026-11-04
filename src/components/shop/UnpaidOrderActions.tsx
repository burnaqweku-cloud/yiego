import { useEffect, useState } from "react";
import { CreditCard, Loader2, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/format";
import { forgetUnpaidReference, savedOrderToken, unpaidOrderAction, UnpaidOrderError, type UnpaidDetails } from "@/lib/unpaidOrders";
import { useAuth } from "@/store/auth-context";

export default function UnpaidOrderActions({ reference, onCancelled, onUnavailable, onContinue, initialEmail = "", changeBundle = false }: { reference: string; onCancelled: () => void; onUnavailable?: () => void; onContinue?: () => void; initialEmail?: string; changeBundle?: boolean }) {
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [details, setDetails] = useState<UnpaidDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [closed, setClosed] = useState(false);
  const needsEmail = !isAuthenticated && !savedOrderToken(reference);
  async function run(action: "lookup" | "continue" | "cancel") {
    setBusy(true); setError("");
    try {
      const result = await unpaidOrderAction(action, reference, email);
      if (action === "cancel") { forgetUnpaidReference(reference); onCancelled(); return; }
      if (action === "continue" && onContinue) { onContinue(); return; }
      if (action === "continue" && result?.paymentUrl) { window.location.assign(result.paymentUrl); return; }
      if (result) setDetails(result);
    } catch (cause) {
      if (cause instanceof UnpaidOrderError && cause.status === 410) { forgetUnpaidReference(reference); setClosed(true); onUnavailable?.(); }
      setError(cause instanceof Error ? cause.message : "Could not confirm this order. Please try again.");
    }
    finally { setBusy(false); }
  }
  useEffect(() => {
    setDetails(null); setConfirmCancel(false); setClosed(false);
    if (!needsEmail || initialEmail) void run("lookup");
    // A lookup only reads; confirmation is required for cancellation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, needsEmail]);
  return <section className="mt-4 border-t border-border pt-4 text-left">
    <h3 className="text-sm font-semibold text-foreground">Order awaiting payment</h3>
    <p className="mt-1 text-sm text-muted-foreground">Continue payment, or cancel this order before placing a new one for this number.</p>
    {needsEmail && <label className="mt-3 block text-sm text-foreground">Email used at checkout<input className="onyx-field mt-1 w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your checkout email" /></label>}
    {details && <dl className="mt-3 divide-y divide-border text-sm">{[["Order ID", details.reference], ["Bundle", `${details.network} · ${details.product}`], ["Recipient", details.recipient], ["Amount", formatGHS(Number(details.amount))], ["Placed", new Date(details.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Accra" })]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-right font-medium text-foreground">{value}</dd></div>)}</dl>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {!closed && (!details ? <Button disabled={busy || (needsEmail && !email.trim())} onClick={() => void run("lookup")}>{busy ? <Loader2 className="animate-spin" /> : <CreditCard />}{busy ? "Loading order…" : "Show unpaid order"}</Button> : <><Button className="w-full" disabled={busy || confirmCancel} onClick={() => onContinue ? onContinue() : void run("continue")}><CreditCard />Continue payment</Button><Button className="w-full" variant="soft" disabled={busy} onClick={() => setConfirmCancel(true)}><X />{changeBundle ? "Cancel & change bundle" : "Cancel order"}</Button></>)}
    </div>
    {confirmCancel && <div role="alertdialog" aria-label="Cancel unpaid order" className="mt-4 border-t border-border pt-4"><p className="text-sm text-foreground">Cancel {reference}? Only this unpaid order will be cancelled. No payment or refund is made.</p><div className="mt-3 grid gap-2"><Button disabled={busy} onClick={() => void run("cancel")}>{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}{changeBundle ? "Cancel & choose bundle" : "Confirm cancellation"}</Button><Button variant="quiet" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep order</Button></div></div>}
  </section>;
}