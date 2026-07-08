import { useEffect, useState } from "react";
import { Check, CreditCard, Smartphone } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, SelectRow } from "@/components/flows/flow-parts";
import { useMethods, type FundingMethod } from "@/store/methods";
import { maskedPhone } from "@/store/profile";

/** Add a funding method — pick Mobile Money or a debit card, enter the
 *  number, and we save a MASKED copy only (never the full number). */

type Kind = FundingMethod["kind"];

const KINDS: { id: Kind; name: string; detail: string; icon: typeof Smartphone }[] = [
  { id: "momo", name: "Mobile Money", detail: "MTN, Telecel or AT wallet", icon: Smartphone },
  { id: "card", name: "Debit card", detail: "Visa or Mastercard", icon: CreditCard },
];

/** Ghana network from a 10-digit MoMo number's prefix. */
function momoName(digits: string): string {
  const p = digits.slice(0, 3);
  if (["024", "025", "053", "054", "055", "059"].includes(p)) return "MTN Mobile Money";
  if (["020", "050"].includes(p)) return "Telecel Cash";
  if (["026", "027", "056", "057"].includes(p)) return "AT Money";
  return "Mobile Money";
}

/** Card brand from the leading digit. */
function cardName(digits: string): string {
  if (digits.startsWith("4")) return "Visa card";
  if (digits.startsWith("5")) return "Mastercard";
  return "Debit card";
}

export default function AddMethodSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addMethod } = useMethods();
  const [kind, setKind] = useState<Kind>("momo");
  const [digits, setDigits] = useState("");

  // Reset on open AND close so a half-typed number never lingers.
  useEffect(() => {
    setKind("momo");
    setDigits("");
  }, [open]);

  const required = kind === "momo" ? 10 : 16;
  const valid = digits.length === required;
  // Cards read in groups of four while typing.
  const display = kind === "card" ? digits.replace(/(\d{4})(?=\d)/g, "$1 ") : digits;

  const save = () => {
    const name = kind === "momo" ? momoName(digits) : cardName(digits);
    const detail = kind === "momo" ? maskedPhone(digits) : `•••• ${digits.slice(-4)}`;
    addMethod(kind, name, detail);
    toast("Funding method added", { description: `${name} · ${detail} is ready to use.` });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} label="Add funding method">
      <FlowHeader
        title="Add funding method"
        subtitle="Mobile Money or debit card"
        onClose={onClose}
      />

      <div className="space-y-5 px-5 pb-4 pt-4">
        {/* Type */}
        <div className="space-y-2.5">
          {KINDS.map((k) => (
            <SelectRow
              key={k.id}
              selected={kind === k.id}
              onClick={() => {
                if (kind !== k.id) {
                  setKind(k.id);
                  setDigits("");
                }
              }}
              leading={
                <span className="onyx-tx-icon is-out shrink-0">
                  <k.icon size={17} />
                </span>
              }
              title={k.name}
              subtitle={k.detail}
              trailing={
                kind === k.id ? <Check size={18} className="shrink-0 text-primary-glow" /> : undefined
              }
            />
          ))}
        </div>

        {/* Number */}
        <div className="space-y-2">
          <label
            htmlFor="add-method-number"
            className="block px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint-foreground"
          >
            {kind === "momo" ? "Mobile Money number" : "Card number"}
          </label>
          <input
            id="add-method-number"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="onyx-field tnum"
            placeholder={kind === "momo" ? "024 000 0000" : "0000 0000 0000 0000"}
            value={display}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, required))}
          />
          <p className="px-1 text-[12px] text-faint-foreground">
            {kind === "momo"
              ? "10 digits — we only keep a masked copy, like 024 ••• 221."
              : "16 digits — we only keep the last four, like •••• 4429."}
          </p>
        </div>
      </div>

      <FlowFooter>
        <button
          type="button"
          className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
          disabled={!valid}
          onClick={save}
        >
          Save method
        </button>
      </FlowFooter>
    </Modal>
  );
}
