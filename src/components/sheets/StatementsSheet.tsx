import { FileDown, Mail } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";
import { useWallet } from "@/store/wallet";
import { useProfile } from "@/store/profile";

/** Statements — a real CSV download built from live wallet history. */
export default function StatementsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { transactions } = useWallet();
  const { profile } = useProfile();

  const downloadCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [
      ["Title", "Detail", "Amount", "Status"],
      ...transactions.map((t) => [t.title, t.subtitle, t.amount.toFixed(2), t.status]),
    ];
    const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
    // BOM so Excel reads the file as UTF-8 (subtitles contain "•" and "₵").
    const bom = String.fromCharCode(0xfeff);
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yiego-statement.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Statement downloaded", {
      description: `${transactions.length} transactions · yiego-statement.csv`,
    });
  };

  return (
    <Modal open={open} onClose={onClose} label="Statements">
      <FlowHeader title="Statements" subtitle="Your full YieGo history" onClose={onClose} />
      <div className="space-y-2.5 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5">
        <button type="button" className="onyx-select" onClick={downloadCsv}>
          <span className="onyx-tx-icon is-in shrink-0">
            <FileDown size={17} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[14px] font-semibold tracking-tight text-foreground">
              Download CSV statement
            </span>
            <span className="block truncate text-[12px] text-faint-foreground">
              {transactions.length} transactions · opens in any spreadsheet
            </span>
          </span>
        </button>

        <button
          type="button"
          className="onyx-select"
          onClick={() => toast(`Statement sent to ${profile.email}`)}
        >
          <span className="onyx-tx-icon is-out shrink-0">
            <Mail size={17} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[14px] font-semibold tracking-tight text-foreground">
              Email me a PDF
            </span>
            <span className="block truncate text-[12px] text-faint-foreground">
              Sent to {profile.email}
            </span>
          </span>
        </button>

        <p className="px-1 pt-2 text-[12.5px] leading-relaxed text-faint-foreground">
          Statements cover everything in your wallet history on this device — great for
          bookkeeping or momo reconciliation.
        </p>
      </div>
    </Modal>
  );
}
