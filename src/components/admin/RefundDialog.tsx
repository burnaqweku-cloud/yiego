import { useEffect, useState } from "react";
import { Copy, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import type { RefundQuote } from "../../../supabase/functions/_shared/refundPolicy";

type Preview = { quote: RefundQuote; alternative: RefundQuote | null; reducedEnabled: boolean; blockedReason: string | null };
export default function RefundDialog({ reference, manual = false, initialReason = "", onClose, onDone }: {
  reference: string; manual?: boolean; initialReason?: string; onClose: () => void; onDone: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(initialReason);
  const [reduced, setReduced] = useState(false);
  const [credit, setCredit] = useState(false);
  const [creditNote, setCreditNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [acceptanceNote, setAcceptanceNote] = useState("");
  const [transferReference, setTransferReference] = useState("");
  useEffect(() => {
    let active = true;
    void supabase.functions.invoke<Preview & { error?: string }>("refund-policy", { body: { action: "quote", orderReference: reference } }).then(({ data, error: err }) => {
      if (!active) return;
      if (err || data?.error || !data?.quote) setError(data?.error || "Could not read the refund quote. No money has moved.");
      else setPreview(data);
    });
    return () => { active = false; };
  }, [reference]);
  const quote = reduced ? preview?.alternative : preview?.quote;
  const customerMessage = quote ? `Your order ${reference} can be refunded. ${quote.verificationHold ? "You can instead wait for MTN verification and delivery. " : ""}${quote.policy === "mtn_verification_fee" ? `You paid ${formatGHS(quote.paid)}. Paystack's processing fee is ${formatGHS(quote.processingFee)}. If you choose and agree to this refund, you receive ${formatGHS(quote.refund)}.` : `A full refund of ${formatGHS(quote.refund)} returns ${quote.method === "wallet" ? "to your DataYego wallet, without a new fee" : "to your original payment channel"}.`}` : "";
  const confirm = async () => {
    if (!quote || busy) return;
    setBusy(true); setError("");
    const { data, error: err } = await supabase.functions.invoke<{ status?: string; method?: string; error?: string }>("refund-policy", {
      body: { action: "refund", orderReference: reference, policy: quote.policy, expectedRefund: quote.refund, reason,
        supplierCreditConfirmed: credit, supplierCreditNote: creditNote, customerAccepted: accepted, customerAcceptanceNote: acceptanceNote,
        ...(manual ? { manual: true, manualReference: transferReference } : {}) },
    });
    setBusy(false);
    if (err || data?.error || data?.status !== "refunded") { setError(data?.error || "Refund outcome was not confirmed. Review the order before retrying."); return; }
    toast.success(data.method === "wallet" ? "Full refund returned to the wallet." : quote.policy === "mtn_verification_fee" ? `Refunded ${formatGHS(quote.refund)} after Paystack's ${formatGHS(quote.processingFee)} fee.` : "Full refund recorded through the original payment channel.");
    onDone(); onClose();
  };
  const disabled = !quote || busy || Boolean(preview?.blockedReason) || !reason.trim()
    || (quote.supplierConfirmationRequired && (!credit || creditNote.trim().length < 5))
    || (reduced && (!accepted || acceptanceNote.trim().length < 5)) || (manual && !transferReference.trim());
  return <Modal open onClose={() => { if (!busy) onClose(); }} label="Refund quote">
    <div className="max-h-[88vh] space-y-4 overflow-y-auto p-5">
      <header className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-foreground">{manual ? "Record full manual refund" : "Refund customer"}</h2><p className="font-mono text-sm text-muted-foreground">{reference}</p></div><Button size="icon" variant="quiet" aria-label="Close refund" onClick={onClose} disabled={busy}><X /></Button></header>
      {!preview && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16} />Checking payment and supplier history…</p>}
      {preview?.quote.verificationHold && <p className="text-sm leading-6 text-amber">The customer can wait for MTN number verification and delivery instead of requesting a refund.</p>}
      {preview?.alternative && !manual && <>
        <p className="text-sm leading-6 text-muted-foreground">A fee-excluding refund would return {formatGHS(preview.alternative.refund)} after Paystack's actual {formatGHS(preview.alternative.processingFee)} fee.</p>
        {preview.reducedEnabled ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reduced} onChange={(e) => { setReduced(e.target.checked); setAccepted(false); }} />Apply the agreed MTN verification fee deduction</label> : <p className="text-xs leading-5 text-amber">Fee deduction is not activated. Existing orders still receive full refunds until the policy and accounting checks are cleared.</p>}
      </>}
      {quote && <dl className="divide-y divide-border border-y border-border">{[{ label: "Originally paid", amount: quote.paid }, { label: "Fee retained", amount: quote.processingFee }, { label: "Customer receives", amount: quote.refund }].map((row) => <div key={row.label} className="flex justify-between gap-4 py-3 text-sm"><dt className="text-muted-foreground">{row.label}</dt><dd className="font-semibold tabular-nums text-foreground">{formatGHS(row.amount)}</dd></div>)}</dl>}
      {quote && <div><p className="text-sm leading-6 text-muted-foreground">{customerMessage}</p><Button variant="ghost" size="sm" className="mt-1" onClick={() => { void navigator.clipboard.writeText(customerMessage).then(() => toast.success("Refund message copied.")); }}><Copy />Copy customer message</Button></div>}
      {quote?.supplierConfirmationRequired && <div className="space-y-2"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />The supplier confirmed our balance was credited back</label><textarea aria-label="Supplier credit confirmation" className="onyx-field" value={creditNote} onChange={(e) => setCreditNote(e.target.value)} maxLength={500} placeholder="Record supplier confirmation or reference" /></div>}
      {reduced && <div className="space-y-2"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />Customer requested and accepted this exact reduced refund</label><textarea aria-label="Customer acceptance record" className="onyx-field" value={acceptanceNote} onChange={(e) => setAcceptanceNote(e.target.value)} maxLength={500} placeholder="Record informed agreement, amount and support reference" /></div>}
      {quote && <label className="block space-y-2 text-sm"><span>Refund reason</span><textarea className="onyx-field" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>}
      {manual && <label className="block space-y-2 text-sm"><span>Transfer reference — money already sent in full</span><input className="onyx-field" value={transferReference} onChange={(e) => setTransferReference(e.target.value)} maxLength={120} /></label>}
      {(error || preview?.blockedReason) && <p role="alert" className="text-sm leading-6 text-danger">{error || preview?.blockedReason}</p>}
      <footer className="flex justify-end gap-2"><Button variant="quiet" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={disabled} onClick={() => void confirm()}>{busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}{manual ? "Record refund" : "Confirm refund"}</Button></footer>
    </div>
  </Modal>;
}