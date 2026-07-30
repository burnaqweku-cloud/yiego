import { useMemo } from "react";
import { recentServices } from "@/lib/recent-services";
import { useFlows } from "@/store/flows";
import { useWallet } from "@/store/wallet";

/**
 * "Buy again" — one-tap re-entry into the services this wallet actually uses,
 * derived from real transaction history. Renders nothing until there is one.
 */
export default function RecentServices() {
  const { transactions } = useWallet();
  const { openService } = useFlows();
  const services = useMemo(() => recentServices(transactions, 4), [transactions]);
  if (services.length === 0) return null;

  return (
    <section className="onyx-rise" style={{ animationDelay: "180ms" }} aria-label="Buy again">
      <h2 className="font-display text-[17px] font-semibold tracking-tight text-white">
        Buy again
      </h2>
      <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-1">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openService(s.id)}
            aria-label={`Buy ${s.name} again`}
            className="onyx-chip group flex min-h-[52px] shrink-0 items-center gap-2.5 rounded-2xl py-2 pl-2 pr-4"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-primary-glow/[0.16] bg-gradient-to-b from-primary/[0.16] to-primary/[0.04] text-primary-glow transition-transform duration-200 group-hover:scale-105">
              <s.icon size={16} strokeWidth={2.1} />
            </span>
            <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-foreground">
              {s.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
