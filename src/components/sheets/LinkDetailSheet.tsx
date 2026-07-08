import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Link2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";
import { useLinks, linkUrl, type LinkStatus } from "@/store/links";
import { formatGHS } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Status pill — mirrors the badge used in the Payments list. */
function StatusPill({ status }: { status: LinkStatus }) {
  const active = status === "Active";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
        active ? "bg-primary/[0.12] text-primary-glow" : "bg-white/[0.06] text-muted-foreground",
      )}
    >
      {status === "Off" ? "Paused" : status}
    </span>
  );
}

/**
 * Payment-link detail sheet — opened from a row on /payments.
 * Copy the URL, read the numbers, pause/resume the link.
 * Reads the link fresh from the store so a toggle re-renders live.
 */
export default function LinkDetailSheet({
  linkId,
  open,
  onClose,
}: {
  linkId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { links, toggleLink } = useLinks();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [open, linkId]);

  const link = links.find((l) => l.id === linkId);
  if (!open || !link) return null;

  const copy = () => {
    navigator.clipboard?.writeText(`https://${linkUrl(link)}`).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const pausing = link.status !== "Off";
  const onToggle = () => {
    toggleLink(link.id);
    if (pausing) {
      toast("Link paused", { description: `“${link.title}” won't accept new payments.` });
    } else {
      toast("Link resumed", { description: `“${link.title}” is live and accepting payments.` });
    }
  };

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Price", value: formatGHS(link.amount) },
    { label: "Payments received", value: String(link.paid) },
    { label: "Total collected", value: formatGHS(link.amount * link.paid) },
    { label: "Status", value: <StatusPill status={link.status} /> },
  ];

  return (
    <Modal open={open} onClose={onClose} label={`${link.title} — payment link details`}>
      <FlowHeader title={link.title} subtitle="Payment link" onClose={onClose} />

      <div className="px-5 pb-2 pt-5">
        {/* Prominent copyable URL — same block as the create-link success. */}
        <button
          type="button"
          onClick={copy}
          className="flex w-full items-center gap-3 rounded-2xl border border-primary-glow/25 bg-primary/[0.08] px-4 py-4 text-left transition hover:bg-primary/[0.14]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary-glow/20 bg-primary/[0.12] text-primary-glow">
            <Link2 size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[13.5px] font-semibold text-primary-glow">
              {linkUrl(link)}
            </span>
            <span className="text-[11.5px] text-faint-foreground">Tap to copy</span>
          </span>
          <span className="onyx-copy shrink-0">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </span>
        </button>

        {/* Numbers */}
        <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex items-center justify-between gap-4 px-3.5 py-3 ${
                i > 0 ? "border-t border-white/[0.05]" : ""
              }`}
            >
              <span className="text-[12.5px] text-faint-foreground">{r.label}</span>
              <span className="truncate text-right text-[13.5px] font-semibold tnum text-foreground">
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2.5 pb-[max(8px,env(safe-area-inset-bottom))]">
          <button type="button" className="onyx-btn-ghost w-full" onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Link copied" : "Copy link"}
          </button>
          {link.status !== "Paid" && (
            <button type="button" className="onyx-btn-ghost w-full" onClick={onToggle}>
              {pausing ? <Pause size={16} /> : <Play size={16} />}
              {pausing ? "Pause link" : "Resume link"}
            </button>
          )}
          <button type="button" className="onyx-btn-primary w-full" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
