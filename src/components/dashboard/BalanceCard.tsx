import { useState } from "react";
import { ArrowUpRight, Eye, EyeOff, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatGHS, MASKED_BALANCE } from "@/lib/format";
import { comingSoonToast } from "@/lib/toasts";
import { MOCK_WALLET } from "@/data/mock";

export default function BalanceCard() {
  const [hidden, setHidden] = useState(false);

  return (
    <section className="relative overflow-hidden rounded-[26px] bg-ink p-6 text-ink-foreground shadow-glow sm:p-7">
      {/* Decorative: soft mint glow, faint rings, and a top-left sheen */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent" />
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-12 -top-24 h-64 w-64 rounded-full border border-white/[0.08]" />
        <div className="absolute -right-24 -top-36 h-96 w-96 rounded-full border border-white/[0.05]" />
      </div>

      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
            Wallet Balance
          </p>
          <button
            type="button"
            aria-label={hidden ? "Show balance" : "Hide balance"}
            onClick={() => setHidden((v) => !v)}
            className="-my-3 -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition-colors duration-150 hover:bg-white/10 hover:text-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <p className="mt-2.5 font-display text-[2.6rem] font-bold leading-none tracking-[-0.02em] tnum">
          {hidden ? MASKED_BALANCE : formatGHS(MOCK_WALLET.balance)}
        </p>

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <Badge variant="mint" className="tnum">
            {formatGHS(MOCK_WALLET.cashback)} cashback
          </Badge>
          <span className="text-xs text-white/50">Instant MoMo &amp; card top-ups</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
          <Button
            variant="white"
            size="lg"
            className="focus-visible:ring-white/70 focus-visible:ring-offset-0"
            onClick={() => comingSoonToast("Add Money")}
          >
            <Plus />
            Add Money
          </Button>
          <Button
            variant="glass"
            size="lg"
            className="focus-visible:ring-white/70 focus-visible:ring-offset-0"
            onClick={() => comingSoonToast("Withdraw")}
          >
            <ArrowUpRight />
            Withdraw
          </Button>
        </div>
      </div>
    </section>
  );
}
