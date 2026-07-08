import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I add money to my wallet?",
    a: "Open the Wallet page and tap Add Money. You can top up with MTN MoMo, Telecel Cash, AT Money or a bank card — the balance lands instantly.",
  },
  {
    q: "How fast do data bundles arrive?",
    a: "Most bundles are delivered within seconds. During network congestion it can take up to 5 minutes — if nothing arrives after that, the purchase is refunded to your wallet automatically.",
  },
  {
    q: "What fees does YieGo charge?",
    a: "Buying services from your wallet is free — the price you see is what you pay. Withdrawals to MoMo or bank carry only the network's transfer fee, which we show before you confirm.",
  },
  {
    q: "Can I withdraw my balance to MoMo?",
    a: "Yes. Go to Wallet → Withdraw, enter the amount and pick your MoMo number or bank card. Withdrawals arrive instantly with no YieGo fee.",
  },
  {
    q: "Is YieGo safe to use?",
    a: "Your wallet is protected by your 4-digit PIN and security alerts flag anything unusual. We never ask for your PIN by call, SMS or WhatsApp — anyone who does is not YieGo.",
  },
];

/** Help center — quick answers as accordions. */
export default function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <Modal open={open} onClose={onClose} label="Help center">
      <FlowHeader title="Help center" subtitle="Quick answers" onClose={onClose} />
      <div className="space-y-2.5 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5">
        {FAQS.map((faq, i) => {
          const expanded = openIdx === i;
          return (
            <div
              key={faq.q}
              className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
            >
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`faq-panel-${i}`}
                onClick={() => setOpenIdx(expanded ? null : i)}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="flex-1 text-[13.5px] font-semibold tracking-tight text-foreground">
                  {faq.q}
                </span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-faint-foreground transition-transform duration-200 ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              </button>
              {expanded && (
                <p
                  id={`faq-panel-${i}`}
                  className="px-4 pb-4 text-[12.5px] leading-relaxed text-muted-foreground"
                >
                  {faq.a}
                </p>
              )}
            </div>
          );
        })}
        <p className="px-1 pt-2 text-[12.5px] leading-relaxed text-faint-foreground">
          Still stuck? Use Contact support below — a human replies, not a bot.
        </p>
      </div>
    </Modal>
  );
}
