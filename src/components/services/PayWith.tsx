import { PhoneCall, Wallet } from "lucide-react";
import { formatGHS } from "@/lib/format";
import { serviceFee } from "@/lib/services";
import { cn } from "@/lib/utils";

export type Pay = "wallet" | "paystack";

/* The "Pay with" choice shared by every DY Services purchase: wallet (signed in only) or mobile money / card. */
export default function PayWith({ pay, onChange, base, balance, signedIn, walletOnly = false, walletName = "DataYego wallet" }: { pay: Pay; onChange: (p: Pay) => void; base: number; balance: number; signedIn: boolean; walletOnly?: boolean; walletName?: string }) {
  const row = (active: boolean) => cn("flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors", active ? "border-primary-glow bg-primary/[0.1]" : "border-white/[0.1]");
  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">Pay with</p>
      <div className="mt-2 space-y-2" role="radiogroup" aria-label="Pay with">
        {signedIn && <button type="button" role="radio" aria-checked={pay === "wallet"} onClick={() => onChange("wallet")} className={row(pay === "wallet")}>
          <span><span className="block text-[14px] font-semibold text-foreground">{walletName}</span><span className="block text-[12px] text-muted-foreground">Balance {formatGHS(balance)} · no payment fee</span></span>
          <Wallet size={18} className="shrink-0 text-primary-glow" aria-hidden="true" /></button>}
        {!walletOnly && <button type="button" role="radio" aria-checked={pay === "paystack"} onClick={() => onChange("paystack")} className={row(pay === "paystack")}>
          <span><span className="block text-[14px] font-semibold text-foreground">Mobile money or card</span><span className="block text-[12px] text-muted-foreground">{formatGHS(serviceFee(base))} payment fee</span></span>
          <PhoneCall size={18} className="shrink-0 text-primary-glow" aria-hidden="true" /></button>}
      </div>
    </div>
  );
}
