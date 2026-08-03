import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";
import { txRef } from "@/store/wallet";
import { formatSigned } from "@/lib/format";
import type { WalletTransaction } from "@/types/wallet";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  data: "Data bundle",
  deposit: "Wallet top-up",
  payment: "Wallet adjustment",
};

function whenLabel(t: WalletTransaction): string {
  if (t.ts) {
    return new Date(t.ts).toLocaleString("en-GH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return t.subtitle.split("·").pop()?.trim() ?? "—";
}

export default function TransactionDetailSheet({ tx, onClose }: { tx: WalletTransaction | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  if (!tx) return null;

  const isIn = tx.amount > 0;
  const pending = tx.status === "pending";
  const reference = txRef(tx);
  const detail = tx.subtitle.includes("·") ? tx.subtitle.split("·").slice(0, -1).join("·").trim() : tx.subtitle;

  const copy = (value: string, key: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const rows: { label: string; value: string; copyKey?: string }[] = [
    { label: "Date & time", value: whenLabel(tx) },
    ...(detail ? [{ label: "Detail", value: detail }] : []),
    { label: "Type", value: TYPE_LABEL[tx.type] ?? "Transaction" },
    { label: "Fee", value: "Free" },
    ...(tx.orderReference ? [{ label: "Order ID", value: tx.orderReference, copyKey: "order" }] : []),
    { label: "Wallet transaction", value: reference, copyKey: "wallet" },
  ];

  return (
    <Modal open={!!tx} onClose={onClose} label="Transaction receipt">
      <FlowHeader title="Receipt" subtitle={reference} onClose={onClose} />
      <div className="px-5 pb-2 pt-6">
        <div className="flex flex-col items-center text-center">
          <span className={cn("onyx-tx-icon h-14 w-14 rounded-2xl", isIn ? "is-in" : "is-out")}>{isIn ? <ArrowDownToLine size={22} /> : <ArrowUpRight size={22} />}</span>
          <p className={cn("mt-4 font-display text-[32px] font-bold leading-none tracking-tight tnum", isIn ? "text-success" : "text-white")}>{formatSigned(tx.amount)}</p>
          <p className="mt-2 text-[14.5px] font-semibold text-foreground">{tx.title}</p>
          {pending ? <span className="onyx-status-pending mt-2"><Clock size={10} /> Pending</span> : <span className="mt-2 rounded-full border border-success/25 bg-success/[0.12] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-success">Completed</span>}
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
          {rows.map((row, index) => (
            <div key={row.label} className={cn("flex items-center justify-between gap-4 px-3.5 py-3", index > 0 && "border-t border-white/[0.05]")}>
              <span className="shrink-0 text-[12.5px] text-faint-foreground">{row.label}</span>
              {row.copyKey ? (
                <button type="button" onClick={() => copy(row.value, row.copyKey!)} aria-label={`Copy ${row.label}`} className="onyx-copy max-w-[68%] font-mono text-[12px]">
                  {copied === row.copyKey ? <Check size={12} /> : <Copy size={12} />}{row.value}
                </button>
              ) : <span className="truncate text-right text-[13.5px] font-semibold text-foreground">{row.value}</span>}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2.5 pb-[max(8px,env(safe-area-inset-bottom))]">
          {tx.orderReference && <button type="button" className="onyx-btn-secondary w-full" onClick={() => { onClose(); navigate(`/track-order?reference=${encodeURIComponent(tx.orderReference!)}`); }}>View order</button>}
          <button type="button" className="onyx-btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
