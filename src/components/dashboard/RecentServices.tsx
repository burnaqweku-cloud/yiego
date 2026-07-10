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
      <h2 className="font-display text-[15px] font-semibold tracking-tight text-white">
        Buy again
      </h2>
      <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-1">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openService(s.id)}
            aria-label={`Buy ${s.name} again`}
            className="group flex min-h-[52px] shrink-0 items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#101a15]/85 to-[#090e0c]/85 py-2 pl-2 pr-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#7cf0b4]/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_30px_-16px_rgba(34,195,135,0.5)]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[#7cf0b4]/[0.16] bg-gradient-to-b from-primary/[0.16] to-primary/[0.04] text-primary-glow transition-transform duration-200 group-hover:scale-105">
              <s.icon size={16} strokeWidth={2.1} />
            </span>
            <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-[#d6e2db]">
              {s.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
