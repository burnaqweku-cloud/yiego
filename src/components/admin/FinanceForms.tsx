import { useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { Field, inputCls } from "@/components/admin/ui";

type Supplier = { code: string; name: string; fee_rate: number };
const nowLocal = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = (local: string) => new Date(local).toISOString();
const rpc = (fn: string, args: Record<string, unknown>) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(fn, args);

function Shell({ open, onClose, title, children, onSubmit, busy, submitLabel }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; onSubmit: () => void; busy: boolean; submitLabel: string }) {
  return (
    <Modal open={open} onClose={onClose} label={title}>
      <div className="w-[min(92vw,420px)] p-5">
        <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
        <div className="mt-4 space-y-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onSubmit} disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

const PaidFrom = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <Field label="Paid from">
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="outside_funding">Money from outside the business</option>
      <option value="bank">The business bank account</option>
    </select>
  </Field>
);

export function RecordTopupModal({ open, onClose, actorId, suppliers, onDone }: { open: boolean; onClose: () => void; actorId: string; suppliers: Supplier[]; onDone: () => void }) {
  const [supplier, setSupplier] = useState(suppliers[0]?.code ?? "");
  const [amount, setAmount] = useState(""); const [when, setWhen] = useState(nowLocal()); const paidFrom = "bank"; const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const rate = suppliers.find((s) => s.code === supplier)?.fee_rate ?? 0;
  const fee = Math.round(Number(amount || 0) * rate * 100) / 100;
  const submit = async () => {
    if (!supplier || !(Number(amount) > 0)) return toast.error("Enter the amount of float the supplier credited.");
    setBusy(true);
    const { error } = await rpc("finance_record_topup", { p_actor: actorId, p_supplier_code: supplier, p_amount: Number(amount), p_occurred_at: toIso(when), p_paid_from: paidFrom, p_fee: null, p_note: note || null, p_reference: null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Top-up recorded: ${formatGHS(Number(amount))} to ${supplier}`); onDone(); onClose();
  };
  return (
    <Shell open={open} onClose={onClose} title="Record supplier top-up" onSubmit={submit} busy={busy} submitLabel="Record top-up">
      <Field label="Supplier"><select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls}>{suppliers.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
      <Field label="Float credited (GH₵)" hint={amount ? `Charge ${Math.round(rate * 100)}% = ${formatGHS(fee)} · you paid ${formatGHS(Number(amount) + fee)}` : `The supplier's charge (${Math.round(rate * 100)}%) is added on top`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" className={inputCls} /></Field>
      <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. MoMo ref 1234" className={inputCls} /></Field>
    </Shell>
  );
}

export function RecordPayoutModal({ open, onClose, actorId, onDone }: { open: boolean; onClose: () => void; actorId: string; onDone: () => void }) {
  const [net, setNet] = useState(""); const [gross, setGross] = useState(""); const [when, setWhen] = useState(nowLocal()); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!(Number(net) > 0)) return toast.error("Enter the amount that landed in the bank.");
    setBusy(true);
    const { error } = await rpc("finance_record_payout", { p_actor: actorId, p_net: Number(net), p_occurred_at: toIso(when), p_reference: null, p_gross: gross ? Number(gross) : null, p_note: note || null, p_source: "manual" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Payout recorded. If Paystack later reports it, this entry is replaced automatically."); onDone(); onClose();
  };
  return (
    <Shell open={open} onClose={onClose} title="Record Paystack payout" onSubmit={submit} busy={busy} submitLabel="Record payout">
      <p className="text-[12.5px] text-muted-foreground">Payouts are picked up from Paystack automatically every 4 hours. Use this only if that has stopped working.</p>
      <Field label="Amount received in bank (GH₵)"><input inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} placeholder="422.28" className={inputCls} /></Field>
      <Field label="Gross before Paystack fees (optional)" hint="Leave blank if unknown; fees will show as 0 until Paystack confirms"><input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="431.08" className={inputCls} /></Field>
      <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
    </Shell>
  );
}

export function RecordPartnerCapitalModal({ open, onClose, actorId, onDone }: { open: boolean; onClose: () => void; actorId: string; onDone: () => void }) {
  const [amount, setAmount] = useState(""); const [when, setWhen] = useState(nowLocal()); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!(Number(amount) > 0)) return toast.error("Enter the amount put in.");
    setBusy(true);
    const { error } = await rpc("finance_record_partner_capital", { p_actor: actorId, p_amount: Number(amount), p_occurred_at: toIso(when), p_note: note || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Partner money recorded. Master balance goes up by this amount."); onDone(); onClose();
  };
  return (
    <Shell open={open} onClose={onClose} title="Partner put in money" onSubmit={submit} busy={busy} submitLabel="Record">
      <p className="text-[12.5px] text-muted-foreground">Fresh money from a partner's own pocket into the business — not a top-up. It raises the master balance; a top-up afterwards lowers it again.</p>
      <Field label="Amount (GH₵)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" className={inputCls} /></Field>
      <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
      <Field label="Note (optional)" hint="who put it in, for the record"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
    </Shell>
  );
}

export function RecordExpenseModal({ open, onClose, actorId, onDone }: { open: boolean; onClose: () => void; actorId: string; onDone: () => void }) {
  const [amount, setAmount] = useState(""); const [when, setWhen] = useState(nowLocal()); const [paidFrom, setPaidFrom] = useState("bank"); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!(Number(amount) > 0) || !note.trim()) return toast.error("Enter the amount and what it was for.");
    setBusy(true);
    const { error } = await rpc("finance_record_expense", { p_actor: actorId, p_amount: Number(amount), p_occurred_at: toIso(when), p_note: note.trim(), p_paid_from: paidFrom });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Expense recorded."); onDone(); onClose();
  };
  return (
    <Shell open={open} onClose={onClose} title="Record an expense" onSubmit={submit} busy={busy} submitLabel="Record expense">
      <Field label="Amount (GH₵)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
      <Field label="What for"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Domain renewal, SMS credits…" className={inputCls} /></Field>
      <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} /></Field>
      <PaidFrom value={paidFrom} onChange={setPaidFrom} />
    </Shell>
  );
}

export interface TopupCandidate { id: string; supplier_code: string; supplier_name: string; amount: number; balance_before: number; balance_after: number; detected_at: string; fee_rate: number }

export function ConfirmTopupModal({ open, onClose, actorId, candidate, onDone }: { open: boolean; onClose: () => void; actorId: string; candidate: TopupCandidate | null; onDone: () => void }) {
  const [amount, setAmount] = useState(""); const [paidFrom, setPaidFrom] = useState("outside_funding"); const [busy, setBusy] = useState(false);
  if (!candidate) return null;
  const amt = amount === "" ? candidate.amount : Number(amount);
  const fee = Math.round(amt * candidate.fee_rate * 100) / 100;
  const confirm = async () => {
    setBusy(true);
    const { error } = await rpc("finance_confirm_topup", { p_actor: actorId, p_candidate: candidate.id, p_amount: amount === "" ? null : Number(amount), p_paid_from: paidFrom, p_note: null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Top-up confirmed: ${formatGHS(amt)} to ${candidate.supplier_name}`); onDone(); onClose();
  };
  const dismiss = async () => {
    setBusy(true);
    const { error } = await rpc("finance_dismiss_topup", { p_actor: actorId, p_candidate: candidate.id, p_note: "Not a top-up" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Dismissed."); onDone(); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} label="Confirm detected top-up">
      <div className="w-[min(92vw,420px)] p-5">
        <h2 className="text-[17px] font-semibold text-foreground">Top-up detected</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{candidate.supplier_name} balance went from {formatGHS(candidate.balance_before)} to {formatGHS(candidate.balance_after)}.</p>
        <div className="mt-4 space-y-3">
          <Field label="Float credited (GH₵)" hint={`Charge ${Math.round(candidate.fee_rate * 100)}% = ${formatGHS(fee)} · you paid ${formatGHS(amt + fee)}`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(candidate.amount)} className={inputCls} /></Field>
          <PaidFrom value={paidFrom} onChange={setPaidFrom} />
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="quiet" onClick={dismiss} disabled={busy}>Not a top-up</Button>
          <div className="flex gap-2"><Button variant="quiet" onClick={onClose} disabled={busy}>Later</Button><Button onClick={confirm} disabled={busy}>{busy ? "Saving…" : "Confirm"}</Button></div>
        </div>
      </div>
    </Modal>
  );
}

export function ReverseEntryModal({ open, onClose, actorId, entry, onDone }: { open: boolean; onClose: () => void; actorId: string; entry: { id: string; kind: string; amount: number; reference: string | null } | null; onDone: () => void }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  if (!entry) return null;
  const submit = async () => {
    if (!note.trim()) return toast.error("Say why this entry is being reversed.");
    setBusy(true);
    const { error } = await rpc("finance_reverse", { p_actor: actorId, p_entry_id: entry.id, p_note: note.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Entry reversed."); onDone(); onClose();
  };
  return (
    <Shell open={open} onClose={onClose} title="Reverse this entry" onSubmit={submit} busy={busy} submitLabel="Reverse">
      <p className="text-[13px] text-muted-foreground">{entry.kind.replace(/_/g, " ")} · {formatGHS(entry.amount)}{entry.reference ? ` · ${entry.reference}` : ""}. Nothing is deleted — an opposite entry is added and both stay in the ledger.</p>
      <Field label="Reason"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded twice / wrong amount…" className={inputCls} /></Field>
    </Shell>
  );
}
