import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bitcoin,
  Clock,
  CreditCard,
  Gift,
  Inbox,
  Link2,
  Plus,
  Smartphone,
  Tv,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SectionHeader from "@/components/ui/section-header";
import StatTile from "@/components/ui/stat-tile";
import ListRow from "@/components/ui/list-row";
import BalanceCard from "@/components/dashboard/BalanceCard";
import { type MockTransaction, type TxType, type TxGroup } from "@/data/mock";
import { useWallet } from "@/store/wallet";
import { formatSigned } from "@/lib/format";
import { comingSoonToast } from "@/lib/toasts";
import { cn } from "@/lib/utils";

/* ── Per-type transaction glyphs (covers every TxType) ─────────────── */
const TX_ICON: Record<TxType, LucideIcon> = {
  data: Wifi,
  airtime: Smartphone,
  deposit: ArrowDownToLine,
  electricity: Zap,
  payment: Link2,
  tv: Tv,
  withdrawal: ArrowUpRight,
  giftcard: Gift,
  crypto: Bitcoin,
};

/* ── Saved funding methods (sample data — swap for backend later) ───── */
const FUNDING_METHODS: { name: string; detail: string; icon: LucideIcon; isDefault?: boolean }[] = [
  { name: "MTN Mobile Money", detail: "024 ••• 221", icon: Smartphone, isDefault: true },
  { name: "Visa card", detail: "•••• 4429", icon: CreditCard },
];

/* ── Transaction history filter + grouping ─────────────────────────── */
type Filter = "all" | "in" | "out";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in", label: "Money in" },
  { id: "out", label: "Money out" },
];

const GROUP_ORDER: TxGroup[] = ["Today", "Yesterday", "This week", "Earlier"];

function matchesFilter(t: MockTransaction, filter: Filter): boolean {
  if (filter === "in") return t.amount > 0;
  if (filter === "out") return t.amount < 0;
  return true;
}

/* ── Neutral rounded chip for a funding-method leading icon ────────── */
function MethodChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border border-white/[0.07] bg-white/[0.03] text-[#b7c6be]">
      <Icon size={17} />
    </span>
  );
}

/* ── One history row — matches RecentActivity exactly ──────────────── */
function TxRow({ t }: { t: MockTransaction }) {
  const isIn = t.amount > 0;
  const pending = t.status === "pending";
  const Icon = TX_ICON[t.type];
  return (
    <li className="onyx-txrow">
      <span className={cn("onyx-tx-icon", isIn ? "is-in" : "is-out")}>
        <Icon size={16} />
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
}

export default function Wallet() {
  const { transactions } = useWallet();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = transactions.filter((t) => matchesFilter(t, filter));

  const recentTx = transactions.filter((t) => t.group !== "Earlier");
  const inflow = recentTx.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outflow = recentTx.filter((t) => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);
  const compact = (n: number) => "GH₵" + Math.round(n).toLocaleString("en-GH");

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="Wallet"
        title="Your wallet"
        subtitle="Your balance, top-ups and every transaction in one place."
      />

      {/* Balance hero — the wallet jewel */}
      <section className="onyx-rise" style={{ animationDelay: "60ms" }}>
        <BalanceCard />
      </section>

      {/* 30-day flow snapshot */}
      <section
        className="onyx-rise grid grid-cols-3 gap-2.5 sm:gap-3"
        style={{ animationDelay: "120ms" }}
      >
        <StatTile size="sm" label="In" value={compact(inflow)} delta="money in" tone="up" />
        <StatTile size="sm" label="Out" value={compact(outflow)} delta="spent" tone="down" />
        <StatTile size="sm" label="Cashback" value="GH₵12.50" delta="earned" tone="muted" />
      </section>

      {/* Funding methods */}
      <section className="onyx-rise space-y-3.5" style={{ animationDelay: "180ms" }}>
        <SectionHeader title="Funding methods" />
        <div className="onyx-panel rounded-[22px] p-2.5 sm:p-3">
          {FUNDING_METHODS.map((m) => (
            <ListRow
              key={m.name}
              icon={<MethodChip icon={m.icon} />}
              title={m.name}
              subtitle={m.detail}
              onClick={() => comingSoonToast(m.name)}
              right={
                m.isDefault ? (
                  <span className="rounded-full border border-primary-glow/25 bg-primary/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-primary-glow">
                    Default
                  </span>
                ) : undefined
              }
            />
          ))}
          <ListRow
            icon={<MethodChip icon={Plus} />}
            title="Add funding method"
            subtitle="Mobile Money or debit card"
            chevron
            onClick={() => comingSoonToast("Add funding method")}
          />
        </div>
      </section>

      {/* Transactions */}
      <section className="onyx-rise space-y-4" style={{ animationDelay: "240ms" }}>
        <SectionHeader title="Transactions" />

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn("onyx-pill", filter === f.id && "onyx-pill-on")}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="onyx-panel flex flex-col items-center justify-center gap-2.5 rounded-[22px] px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-[15px] border border-white/[0.07] bg-white/[0.03] text-faint-foreground">
              <Inbox size={20} />
            </span>
            <p className="text-[14px] font-semibold text-foreground">No transactions to show</p>
            <p className="max-w-[34ch] text-[12.5px] text-faint-foreground">
              Nothing matches this filter yet — try a different view.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {GROUP_ORDER.map((group) => {
              const rows = visible.filter((t) => (t.group ?? "Earlier") === group);
              if (rows.length === 0) return null;
              return (
                <div key={group} className="space-y-2.5">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
                    {group}
                  </p>
                  <div className="onyx-panel rounded-[22px] px-5 py-1.5 sm:px-6">
                    <ul className="flex flex-col">
                      {rows.map((t) => (
                        <TxRow key={t.id} t={t} />
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
