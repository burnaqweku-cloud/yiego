import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
} from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";
import { txRef } from "@/store/wallet";
import { formatSigned } from "@/lib/format";
import type { MockTransaction } from "@/data/mock";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  data: "Data bundle",
  airtime: "Airtime top-up",
  deposit: "Wallet top-up",
  electricity: "Electricity",
  payment: "Payment received",
  tv: "TV subscription",
  withdrawal: "Withdrawal",
  giftcard: "Gift card",
  crypto: "Crypto exchange",
  bill: "Bill payment",
  digital: "Digital service",
  education: "Education",
};

function whenLabel(t: MockTransaction): string {
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

/** The receipt — opened by tapping any transaction anywhere in the app. */
export default function TransactionDetailSheet({
  tx,
  onClose,
}: {
  tx: MockTransaction | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!tx) return null;

  const isIn = tx.amount > 0;
  const pending = tx.status === "pending";
  const reference = txRef(tx);

  const copy = () => {
    navigator.clipboard?.writeText(reference).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  // The Date & time row already carries the timestamp — show only the
  // meaningful part of the subtitle (recipient/meter/method) as Detail.
  const detail =
    tx.subtitle.includes("·") && tx.ts
      ? tx.subtitle.split("·").slice(0, -1).join("·").trim()
      : tx.subtitle;

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Date & time", value: whenLabel(tx) },
    ...(detail ? [{ label: "Detail", value: detail }] : []),
    { label: "Type", value: TYPE_LABEL[tx.type] ?? "Transaction" },
    { label: "Fee", value: "Free" },
    { label: "Reference", value: reference, mono: true },
  ];

  return (
    <Modal open={!!tx} onClose={onClose} label="Transaction receipt">
      <FlowHeader title="Receipt" subtitle={reference} onClose={onClose} />

      <div className="px-5 pb-2 pt-6">
        <div className="flex flex-col items-center text-center">
          <span className={cn("onyx-tx-icon h-14 w-14 rounded-2xl", isIn ? "is-in" : "is-out")}>
            {isIn ? <ArrowDownToLine size={22} /> : <ArrowUpRight size={22} />}
          </span>
          <p
            className={cn(
              "mt-4 font-display text-[32px] font-bold leading-none tracking-tight tnum",
              isIn ? "text-success" : "text-white",
            )}
          >
            {formatSigned(tx.amount)}
          </p>
          <p className="mt-2 text-[14.5px] font-semibold text-foreground">{tx.title}</p>
          {pending ? (
            <span className="onyx-status-pending mt-2">
              <Clock size={10} /> Pending
            </span>
          ) : (
            <span className="mt-2 rounded-full border border-success/25 bg-success/[0.12] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-success">
              Completed
            </span>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={cn(
                "flex items-center justify-between gap-4 px-3.5 py-3",
                i > 0 && "border-t border-white/[0.05]",
              )}
            >
              <span className="shrink-0 text-[12.5px] text-faint-foreground">{r.label}</span>
              {r.label === "Reference" ? (
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Copy reference"
                  className="onyx-copy font-mono text-[12px]"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {reference}
                </button>
              ) : (
                <span
                  className={cn(
                    "truncate text-right text-[13.5px] font-semibold text-foreground",
                    r.mono && "font-mono",
                  )}
                >
                  {r.value}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2.5 pb-[max(8px,env(safe-area-inset-bottom))]">
          <button type="button" className="onyx-btn-primary w-full" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
