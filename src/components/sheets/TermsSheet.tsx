import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";

const SECTIONS: { h: string; p: string }[] = [
  {
    h: "1 · Who we are",
    p: "YieGo is a digital-services platform operated from Accra, Ghana. We let you buy data, airtime, bills and other digital products from a single wallet, and offer payment tools for sellers and developers.",
  },
  {
    h: "2 · Your account",
    p: "You must be 18 or older and provide accurate details. You're responsible for what happens under your login and PIN — tell us immediately if you suspect someone else has access.",
  },
  {
    h: "3 · Wallet & payments",
    p: "Your wallet balance is prepaid value, not a bank deposit. Top-ups, purchases and withdrawals are executed at the price shown at confirmation. Completed purchases of delivered digital goods are non-refundable; failed deliveries are refunded to your wallet.",
  },
  {
    h: "4 · Fees",
    p: "Wallet purchases carry no YieGo fee — the displayed price is final. Where a network or processor charges a transfer fee (for example on withdrawals), we show it before you confirm.",
  },
  {
    h: "5 · Acceptable use",
    p: "Don't use YieGo for fraud, money laundering, reselling in breach of network terms, or anything unlawful in Ghana. We may suspend accounts that put other users or the platform at risk.",
  },
  {
    h: "6 · Your data",
    p: "We collect only what we need to run your account: your contact details, transaction history and device information. We never sell your personal data, and we share it only with payment partners needed to complete your transactions or where the law requires.",
  },
  {
    h: "7 · Security",
    p: "Transactions are protected by your 4-digit PIN and monitored for unusual activity. YieGo staff will never ask for your PIN or a one-time code — treat any such request as fraud and report it.",
  },
  {
    h: "8 · Changes & contact",
    p: "We may update these terms as YieGo grows; material changes are announced in the app before they take effect. Questions or complaints: support@yiego.com — we aim to respond within one business day.",
  },
];

/** Terms & Privacy — a concise, scrollable summary. */
export default function TermsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Terms and privacy">
      <FlowHeader title="Terms & Privacy" subtitle="The short version" onClose={onClose} />
      <div className="px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5">
        <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] leading-relaxed text-faint-foreground">
          Effective 1 July 2026 · This is a plain-language summary of the YieGo preview terms. The
          full legal text ships with the public launch.
        </p>

        <div className="mt-5 space-y-5">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{s.h}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
