import { useState } from "react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import { formatGHS, moneyParts } from "@/lib/format";
import { useFlows } from "@/store/flows";
import { useWallet } from "@/store/wallet";
import "./latest-delivery.css";

/** The wallet as it sits inside a green band (the shop and the Wallet page): balance, show or hide it, Add money. */
export default function Purse() {
  const { balance, isRealWallet, hasWallet, loading } = useWallet();
  const { openAddMoney } = useFlows();
  const [hidden, setHidden] = useState(false);
  const { symbol, value } = moneyParts(formatGHS(useCountUp(balance)));
  const state = loading ? "syncing" : isRealWallet ? null : "unavailable";
  return (
    <div className="yg-purse">
      <p className="yg-purse__label">
        Your wallet{state && <span className="yg-purse__state">· {state}</span>}
        <button type="button" className="yg-purse__eye" onClick={() => setHidden((v) => !v)} aria-label={hidden ? "Show balance" : "Hide balance"} aria-pressed={hidden}>
          {hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
        </button>
      </p>
      <button type="button" className="yg-purse__add" onClick={openAddMoney} disabled={loading || !hasWallet}>
        <Plus size={16} strokeWidth={2.8} aria-hidden="true" />Add money
      </button>
      <p className="yg-purse__money" data-long={!hidden && value.length > 8 ? "" : undefined}>{symbol && <small>{symbol}</small>}{hidden ? "••••••" : value}</p>
    </div>
  );
}
