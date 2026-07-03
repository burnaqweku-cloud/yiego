import {
  ArrowDownLeft,
  Link2,
  Smartphone,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { comingSoonToast } from "@/lib/toasts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_TRANSACTIONS, type TxType } from "@/data/mock";
import { formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";

const TX_ICONS: Record<TxType, LucideIcon> = {
  data: Wifi,
  airtime: Smartphone,
  deposit: ArrowDownLeft,
  electricity: Zap,
  payment: Link2,
};

/** Latest wallet movements — money in reads mint, money out stays quiet. */
export default function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 -mr-2.5 h-11 text-muted-foreground hover:text-foreground"
          onClick={() => comingSoonToast("Transaction history")}
        >
          View all
        </Button>
      </CardHeader>
      <CardContent className="pt-2 pb-2">
        <ul className="divide-y divide-border">
          {MOCK_TRANSACTIONS.map((tx) => {
            const Icon = TX_ICONS[tx.type];
            const moneyIn = tx.amount > 0;
            return (
              <li key={tx.id} className="flex items-center gap-3.5 py-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/70">
                  <Icon size={18} strokeWidth={1.75} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tx.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {tx.subtitle}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end">
                  <span
                    className={cn(
                      "tnum text-sm font-semibold",
                      moneyIn ? "text-primary-strong" : "text-foreground",
                    )}
                  >
                    {formatSigned(tx.amount)}
                  </span>
                  {tx.status === "pending" && (
                    <Badge
                      variant="amber"
                      className="mt-1 px-1.5 py-0 text-[10px] leading-4"
                    >
                      Pending
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
