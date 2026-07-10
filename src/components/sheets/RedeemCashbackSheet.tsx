import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowHeader, SuccessView } from "@/components/flows/flow-parts";
import { useWallet, CASHBACK_MIN_REDEEM } from "@/store/wallet";
import { formatAmountParts, formatGHS } from "@/lib/format";

/**
 * Cashback sheet — opened from the Cashback stat tile on the Wallet page.
 * Shows the pot, explains the 1% rule, and redeems it into the balance
 * with an in-sheet success state.
 */
export default function RedeemCashbackSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { balance, cashback, redeemCashback } = useWallet();
  /** Amount just redeemed — non-null flips the sheet into its success state. */
  const [redeemed, setRedeemed] = useState<number | null>(null);

  // Each open starts fresh on the redeem step.
  useEffect(() => {
    if (open) setRedeemed(null);
  }, [open]);

  const canRedeem = cashback >= CASHBACK_MIN_REDEEM;
  const { symbol, value } = formatAmountParts(cashback);

  const onRedeem = () => {
    const amount = redeemCashback();
    if (amount <= 0) {
      // Defensive — the pot slipped below the minimum (e.g. redeemed elsewhere).
      toast("Nothing to redeem yet", {
        description: `You need at least ${formatGHS(CASHBACK_MIN_REDEEM)} in cashback.`,
      });
      return;
    }
    setRedeemed(amount);
    toast("Cashback redeemed", {
      description: `${formatGHS(amount)} added to your balance.`,
    });
  };

  return (
    <Modal open={open} onClose={onClose} label="Redeem cashback">
      <FlowHeader title="Cashback" subtitle="1% back, every time" onClose={onClose} />

      {redeemed !== null ? (
        <SuccessView
          title="Cashback redeemed"
          message="Your cashback just became spendable balance."
          rows={[
            { label: "Redeemed", value: formatGHS(redeemed) },
            // The wallet has already applied the redeem, so this is live.
            { label: "New balance", value: formatGHS(balance) },
          ]}
          primaryLabel="Done"
          onPrimary={onClose}
        />
      ) : (
        <div className="px-5 pb-2 pt-8">
          <div className="flex flex-col items-center text-center">
            <span
              className="grid h-14 w-14 place-items-center rounded-2xl border border-amber/25 bg-amber/[0.10] text-amber"
              aria-hidden="true"
            >
              <Sparkles size={22} />
            </span>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-faint-foreground">
              Cashback balance
            </p>
            <p className="mt-2.5 font-display font-semibold leading-none tracking-[-0.03em] tnum text-white drop-shadow-[0_0_26px_rgba(124,240,180,0.4)]">
              <span className="text-[20px] text-primary-glow">{symbol}</span>{" "}
              <span className="text-[44px]">{value}</span>
            </p>
            <p className="mt-4 max-w-[30ch] text-[13.5px] leading-relaxed text-muted-foreground">
              You earn 1% back on every purchase. Redeem it straight into your balance.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-2.5 pb-[max(8px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onRedeem}
              disabled={!canRedeem}
              className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
            >
              Redeem {formatGHS(cashback)}
            </button>
            {!canRedeem && (
              <p className="text-center text-[12px] leading-relaxed text-faint-foreground">
                You need at least {formatGHS(CASHBACK_MIN_REDEEM)} in cashback to redeem — keep
                buying, it adds up.
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
