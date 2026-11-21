import { useState } from "react";
import { Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { p1, useAgent } from "@/components/agent/AgentShell";
import { NUMBER_NETWORK_LABEL, networkForNumber } from "@/lib/numberNetwork";

/* Where an agent's earnings are paid (owner, 21 Nov 2026: an agent changed her SIM and only managed to change her
   WhatsApp number; "make it possible for agents to be able to change their payment number"). One card, used on the
   Earnings page (next to Withdraw) and under Store. The number is typed twice, its network is shown, and
   phase1.agent_set_payout_number checks it again, moves a waiting withdrawal to it and tells the agent's phones. */

export function payoutDigits(text: string): string {
  const d = text.replace(/\D/g, "");
  if (/^233\d{9}$/.test(d)) return `0${d.slice(3)}`;
  if (/^\d{9}$/.test(d)) return `0${d}`;
  return d;
}

/** What is wrong with the form, or null when it can be saved. */
export function payoutFormProblem(number: string, again: string, name: string): string | null {
  const n = payoutDigits(number);
  if (!/^0\d{9}$/.test(n)) return "Enter a 10-digit MoMo number, e.g. 0241234567.";
  if (!networkForNumber(n)) return "That number is not on MTN, Telecel or AirtelTigo.";
  if (payoutDigits(again) !== n) return "The two numbers are not the same.";
  if (name.trim().length < 3) return "Enter the name on the MoMo account.";
  return null;
}

export function payoutErrorText(message: string): string {
  if (message.includes("bad_momo_number")) return "That MoMo number is not right. Check it and try again.";
  if (message.includes("bad_momo_name")) return "Enter the name on the MoMo account.";
  if (message.includes("too_many_changes")) return "You have changed your payout number too many times today. Try again tomorrow or contact support.";
  return "Could not save. Try again.";
}

export default function PayoutNumber({ compact = false }: { compact?: boolean }) {
  const { agent, payouts, reload } = useAgent();
  const has = Boolean(agent.momo_number);
  const [open, setOpen] = useState(!has);
  const [number, setNumber] = useState(""); const [again, setAgain] = useState(""); const [name, setName] = useState(agent.momo_name ?? "");
  const [busy, setBusy] = useState(false);
  const current = agent.momo_number ? networkForNumber(agent.momo_number) : null;
  const typed = networkForNumber(payoutDigits(number));
  const problem = payoutFormProblem(number, again, name);
  const waiting = payouts.filter((p) => p.status === "requested" || p.status === "approved").length;

  const save = async () => {
    if (problem) { toast.error(problem); return; }
    const n = payoutDigits(number);
    const net = typed ? NUMBER_NETWORK_LABEL[typed] : "";
    if (!window.confirm(`Pay your earnings to ${n} (${net} MoMo, ${name.trim()}) from now on?${waiting ? " Your waiting withdrawal will go there too." : ""}`)) return;
    setBusy(true);
    const { error } = await p1().rpc("agent_set_payout_number", { p_number: n, p_name: name.trim() });
    setBusy(false);
    if (error) { toast.error(payoutErrorText(String(error.message))); return; }
    toast.success(`Saved. We'll pay your earnings to ${n}.`);
    setNumber(""); setAgain(""); setOpen(false); void reload();
  };

  return (
    <div className={compact ? "" : "onyx-panel rounded-2xl p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground"><Wallet size={15} className="text-primary-glow" />We pay your earnings to</p>
          {has ? (
            <p className="mt-1 text-[15px] font-semibold tabular-nums text-foreground">{agent.momo_number}<span className="ml-1.5 text-[12px] font-normal text-muted-foreground">{current ? `${NUMBER_NETWORK_LABEL[current]} MoMo` : "MoMo"}{agent.momo_name ? ` · ${agent.momo_name}` : ""}</span></p>
          ) : (
            <p className="mt-1 text-[12.5px] text-muted-foreground">No MoMo number yet. Add one so you can withdraw.</p>
          )}
        </div>
        {has && !open && <button type="button" onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.14] px-3 py-1.5 text-[12.5px] font-semibold text-foreground"><Pencil size={13} />Change</button>}
      </div>
      {open && (
        <div className="mt-3 space-y-2.5">
          <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">{has ? "New MoMo number" : "MoMo number"}</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="tel" autoComplete="off" placeholder="0241234567" className="onyx-field w-full" />
            {typed && <span className="mt-1 block text-[11.5px] text-primary-glow">{NUMBER_NETWORK_LABEL[typed]} number</span>}
          </label>
          <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">Type the number again</span>
            <input value={again} onChange={(e) => setAgain(e.target.value)} inputMode="tel" autoComplete="off" placeholder="0241234567" className="onyx-field w-full" onPaste={(e) => e.preventDefault()} />
          </label>
          <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">Name on the MoMo account</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="As it shows when someone sends you money" className="onyx-field w-full" />
          </label>
          {waiting > 0 && <p className="text-[11.5px] text-faint-foreground">Your waiting withdrawal will be paid to the new number.</p>}
          <div className="flex justify-end gap-2">
            {has && <button type="button" onClick={() => { setOpen(false); setNumber(""); setAgain(""); setName(agent.momo_name ?? ""); }} className="rounded-full px-4 py-2 text-[13px] font-semibold text-muted-foreground">Cancel</button>}
            <button type="button" disabled={busy || Boolean(problem)} onClick={() => void save()} className="onyx-btn-primary px-5 py-2.5 text-[13.5px] disabled:opacity-50">{busy ? "Saving…" : "Save number"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
