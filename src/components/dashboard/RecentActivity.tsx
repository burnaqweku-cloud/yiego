import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowUpRight, ChevronRight, Clock } from "lucide-react";
import { formatSigned } from "@/lib/format";
import { useWallet } from "@/store/wallet";
import { cn } from "@/lib/utils";

export default function RecentActivity() {
  const { transactions } = useWallet();
  const recent = transactions.slice(0, 5);
  return (
    <div className="onyx-panel rounded-[26px] p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[17px] font-semibold tracking-tight text-white">
          Recent activity
        </h3>
        <Link to="/wallet" className="onyx-ghostlink">
          All <ChevronRight size={14} />
        </Link>
      </div>

      <ul className="mt-4 flex flex-col">
        {recent.map((t) => {
          const isIn = t.amount > 0;
          const pending = t.status === "pending";
          return (
            <li key={t.id} className="onyx-txrow">
              <span className={cn("onyx-tx-icon", isIn ? "is-in" : "is-out")}>
                {isIn ? <ArrowDownToLine size={16} /> : <ArrowUpRight size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold tracking-tight text-foreground">
                  {t.title}
                </p>
                <p className="truncate text-[11.5px] text-faint-foreground">{t.subtitle}</p>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "font-display text-[14px] font-semibold tnum",
                    isIn ? "text-success" : "text-[#d6e2db]",
                  )}
                >
                  {formatSigned(t.amount)}
                </p>
                {pending ? (
                  <span className="onyx-status-pending">
                    <Clock size={10} /> Pending
                  </span>
                ) : (
                  <span className="onyx-status-ok">Done</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
