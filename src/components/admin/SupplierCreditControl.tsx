import { useState } from "react";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { creditMatches, canMarkSupplierCredit, setSupplierCredit, type SupplierCredit, type SupplierCreditOrder } from "@/lib/supplierCredit";

export default function SupplierCreditControl({ order, credit, onSaved }: {
  order: SupplierCreditOrder; credit?: SupplierCredit; onSaved: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmed = creditMatches(order, credit);
  const save = async () => {
    if (busy || note.trim().length < 5) return;
    if (!window.confirm(confirmed ? "Clear this internal supplier confirmation? No refund or status change will occur." : "Confirm the supplier credited this exact order? This will not refund the customer or change the order status.")) return;
    setBusy(true);
    try { await setSupplierCredit(order.id, !confirmed, note); await onSaved(); setNote(""); toast.success(confirmed ? "Supplier confirmation cleared." : "Supplier credit confirmed. No customer refund issued."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save confirmation."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 border-y border-border py-4">
    <p className={`flex items-center gap-2 text-sm font-semibold ${confirmed ? "text-success" : "text-amber"}`}><CheckCircle2 size={16} />{confirmed ? "Supplier credit confirmed" : "Supplier credit not confirmed"}</p>
    {credit && <><p className="break-words text-sm text-muted-foreground">{credit.note}</p><p className="text-xs text-faint-foreground">{new Date(credit.at).toLocaleString("en-GH", { timeZone: "Africa/Accra" })}</p></>}
    {canMarkSupplierCredit(order) && <><label className="block space-y-2 text-sm text-foreground"><span>{confirmed ? "Reason for clearing confirmation" : "Supplier support confirmation / reference"}</span><textarea className="onyx-field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label><Button variant="ghost" size="sm" disabled={busy || note.trim().length < 5} onClick={() => void save()}>{busy ? <Loader2 className="animate-spin" /> : confirmed ? <Undo2 /> : <CheckCircle2 />}{confirmed ? "Clear confirmation" : "Mark supplier credit confirmed"}</Button></>}
  </section>;
}