import { useState } from "react";
import { ArrowDownToLine, Plus, Sparkles } from "lucide-react";
import GuillocheMesh from "@/components/fx/GuillocheMesh";
import { formatGHS } from "@/lib/format";
import { comingSoonToast } from "@/lib/toasts";
import { useCountUp } from "@/hooks/useCountUp";
import { MOCK_WALLET } from "@/data/mock";

/** The wallet — a machined-metal jewel and the one splash of light on the page. */
export default function BalanceCard() {
  const [hidden, setHidden] = useState(false);
  const animatedBalance = useCountUp(MOCK_WALLET.balance);

  return (
    <div className="onyx-wallet group relative flex h-full flex-col overflow-hidden rounded-[26px] p-6 sm:p-7">
      <GuillocheMesh />
      <span className="onyx-wallet-sheen" aria-hidden="true" />
      <span className="onyx-wallet-edge" aria-hidden="true" />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.22em] text-[#7c9a8c]">
            Total balance
          </p>
          <div className="mt-3 flex min-w-0 items-end gap-3">
            <span className="onyx-balance tnum">
              {hidden ? "GH₵ ••••••" : formatGHS(animatedBalance)}
            </span>
            <button
              type="button"
              onClick={() => setHidden((v) => !v)}
              className="onyx-eye mb-2"
              aria-label={hidden ? "Show balance" : "Hide balance"}
            >
              {hidden ? "Show" : "Hide"}
            </button>
          </div>

          <div className="onyx-cashback mt-3.5">
            <Sparkles size={13} className="text-amber" />
            <strong className="tnum">{formatGHS(MOCK_WALLET.cashback)}</strong> cashback earned
          </div>
        </div>

        <span className="onyx-wallet-mono" aria-hidden="true">
          YG
        </span>
      </div>

      <div className="relative mt-7 flex items-center gap-3">
        <button
          type="button"
          className="onyx-btn-primary flex-1"
          onClick={() => comingSoonToast("Add Money")}
        >
          <Plus size={17} strokeWidth={2.4} />
          Add Money
        </button>
        <button
          type="button"
          className="onyx-btn-ghost flex-1"
          onClick={() => comingSoonToast("Withdraw")}
        >
          <ArrowDownToLine size={17} strokeWidth={2.2} />
          Withdraw
        </button>
      </div>

      <div className="relative mt-auto flex items-center justify-between pt-6 text-[11.5px] tracking-tight text-[#6e8b7d]">
        <span className="font-mono tracking-[0.18em]">•••• 4429 · GHS WALLET</span>
        <span className="flex items-center gap-1.5 text-primary-glow">
          <span className="onyx-live-dot" /> Live
        </span>
      </div>
    </div>
  );
}
