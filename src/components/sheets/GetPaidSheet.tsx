import { Check, FileText, LayoutPanelTop, type LucideIcon } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";
import { useFlows } from "@/store/flows";

/**
 * "Ways to get paid" explainer sheet — checkout pages & invoices.
 * Both ride on payment links in the demo, so the CTA hands the user
 * straight to the create-link flow.
 */

export type GetPaidKind = "checkout" | "invoices";

interface Copy {
  icon: LucideIcon;
  title: string;
  headline: string;
  sub: string;
  bullets: { title: string; desc: string }[];
  cta: string;
  caption: string;
}

const COPY: Record<GetPaidKind, Copy> = {
  checkout: {
    icon: LayoutPanelTop,
    title: "Checkout Pages",
    headline: "A hosted page that sells for you",
    sub: "Your brand, our rails — no code, no store, no monthly fee.",
    bullets: [
      {
        title: "Branded checkout",
        desc: "Your name, colours and product photos on a page YieGo hosts for you.",
      },
      {
        title: "MoMo and cards built in",
        desc: "Every popular way to pay in Ghana works out of the box.",
      },
      {
        title: "Instant settlement",
        desc: "Money lands in your YieGo wallet the moment a customer pays.",
      },
    ],
    cta: "Create a checkout page",
    caption: "In this demo, checkout pages run on payment links — same rails, same wallet.",
  },
  invoices: {
    icon: FileText,
    title: "Invoices",
    headline: "Professional invoices, paid faster",
    sub: "Bill like a business — and let the invoice collect the money itself.",
    bullets: [
      {
        title: "Itemised and professional",
        desc: "Line items, due dates and your business details on every invoice.",
      },
      {
        title: "One tap to pay",
        desc: "Each invoice carries a secure link your client pays by MoMo or card.",
      },
      {
        title: "Track what you're owed",
        desc: "See paid, pending and overdue at a glance — no spreadsheet needed.",
      },
    ],
    cta: "Create an invoice",
    caption: "In this demo, invoices run on payment links — same rails, same wallet.",
  },
};

export default function GetPaidSheet({
  kind,
  open,
  onClose,
}: {
  kind: GetPaidKind;
  open: boolean;
  onClose: () => void;
}) {
  const { openCreateLink } = useFlows();
  const c = COPY[kind];
  const Icon = c.icon;

  const onCta = () => {
    onClose();
    openCreateLink();
  };

  return (
    <Modal open={open} onClose={onClose} label={c.title}>
      <FlowHeader title={c.title} subtitle="Ways to get paid" onClose={onClose} />

      <div className="px-5 pb-2 pt-6">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-[16px] border border-primary-glow/20 bg-gradient-to-b from-primary/[0.18] to-primary/[0.05] text-primary-glow">
            <Icon size={24} />
          </span>
          <h3 className="mt-4 font-display text-[21px] font-semibold tracking-tight text-white">
            {c.headline}
          </h3>
          <p className="mt-1.5 max-w-[34ch] text-[13.5px] leading-relaxed text-muted-foreground">
            {c.sub}
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
          {c.bullets.map((b, i) => (
            <div
              key={b.title}
              className={`flex items-start gap-3.5 px-3.5 py-3.5 ${
                i > 0 ? "border-t border-white/[0.05]" : ""
              }`}
            >
              <span className="mt-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border border-primary-glow/25 bg-primary/[0.12] text-primary-glow">
                <Check size={14} strokeWidth={2.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold tracking-tight text-foreground">
                  {b.title}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {b.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-faint-foreground">
          {c.caption}
        </p>
      </div>

      <FlowFooter>
        <button type="button" className="onyx-btn-primary w-full" onClick={onCta}>
          {c.cta}
        </button>
      </FlowFooter>
    </Modal>
  );
}
