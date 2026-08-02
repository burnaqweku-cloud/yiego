import { useState } from "react";
import { Plus } from "lucide-react";
import GuillocheMesh from "@/components/fx/GuillocheMesh";
import { formatAmountParts } from "@/lib/format";
import { useCountUp } from "@/hooks/useCountUp";
import { useWallet } from "@/store/wallet";
import { useFlows } from "@/store/flows";

/** The wallet — a machined-metal jewel and the one splash of light on the page. */
export default function BalanceCard() {
  const { balance, isRealWallet, hasWallet, loading } = useWallet();
  const { openAddMoney } = useFlows();
  const [hidden, setHidden] = useState(false);
  const animatedBalance = useCountUp(balance);
  const { symbol, value } = formatAmountParts(animatedBalance);

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
            <div className="flex items-baseline gap-2">
              <span className="onyx-cur">{symbol}</span>
              <span className="onyx-balance tnum">{hidden ? "••••••" : value}</span>
            </div>
            <button
              type="button"
              onClick={() => setHidden((v) => !v)}
              className="onyx-eye mb-2"
              aria-label={hidden ? "Show balance" : "Hide balance"}
            >
              {hidden ? "Show" : "Hide"}
            </button>
          </div>

        </div>

        <span className="onyx-wallet-mono" aria-hidden="true">
          YG
        </span>
      </div>

      <div className="relative mt-7 flex items-center gap-3 sm:max-w-[520px]">
        <button
          type="button"
          className="onyx-btn-primary flex-1"
          onClick={openAddMoney}
          disabled={loading || !hasWallet}
        >
          <Plus size={17} strokeWidth={2.4} />
          Add Money
        </button>
      </div>

      <div className="relative mt-auto flex items-center justify-between pt-6 text-[11.5px] tracking-tight text-[#6e8b7d]">
        <span className="font-mono tracking-[0.18em]">
          GHS WALLET
        </span>
        <span className="flex items-center gap-1.5 text-primary-glow">
          <span className="onyx-live-dot" /> {loading ? "Syncing" : isRealWallet ? "Live" : "Unavailable"}
        </span>
      </div>
    </div>
  );
}
