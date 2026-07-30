import { useEffect, useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";
import { useProfile } from "@/store/profile";

/**
 * Invite friends — "Give GH₵5, get GH₵5". The code is derived live from the
 * profile, so editing your name updates it everywhere it's shown.
 */

/** "YIEGO-KWA5" — first three letters of the first name, uppercased. */
export function referralCode(firstName: string): string {
  const letters = firstName.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase();
  return `YIEGO-${letters || "YOU"}5`;
}

const STEPS: { title: string; body: string }[] = [
  {
    title: "Share your code",
    body: "Send it to friends on WhatsApp, SMS — anywhere.",
  },
  {
    title: "Your friend signs up",
    body: "They create a YieGo wallet and enter your code.",
  },
  {
    title: "You both get GH₵5",
    body: "The moment they make their first purchase, GH₵5 lands in each wallet.",
  },
];

export default function ReferralSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useProfile();
  const [copied, setCopied] = useState(false);

  const code = referralCode(profile.firstName);
  const message =
    `Join me on YieGo — data, airtime, bills and 20+ services from one wallet. ` +
    `Sign up with my code ${code} and we both get GH₵5 when you make your first purchase!`;

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const shareInvite = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "YieGo — Give GH₵5, get GH₵5", text: message });
      } catch {
        /* user dismissed the share sheet — nothing to do */
      }
      return;
    }
    // No Web Share here (desktop) — put the full message on the clipboard.
    navigator.clipboard?.writeText(message).catch(() => {});
    toast("Invite message copied", {
      description: "Sharing isn't available on this device — paste it anywhere.",
    });
  };

  return (
    <Modal open={open} onClose={onClose} label="Invite friends">
      <FlowHeader title="Invite friends" subtitle="Referrals" onClose={onClose} />

      <div className="px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-7">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-[20px] border border-primary-glow/25 bg-gradient-to-b from-primary/[0.22] to-primary/[0.04] text-primary-glow shadow-[0_0_34px_-8px_rgba(34,195,135,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]"
            aria-hidden="true"
          >
            <Gift size={26} strokeWidth={1.8} />
          </span>
          <h3 className="mt-4 font-display text-[22px] font-semibold tracking-tight text-white">
            Give GH₵5, get GH₵5
          </h3>
          <p className="mt-1.5 max-w-[32ch] text-[13.5px] leading-relaxed text-muted-foreground">
            Share your code — when a friend signs up and makes their first purchase, you both get
            GH₵5 in your wallets.
          </p>
        </div>

        {/* The code — tap to copy */}
        <button
          type="button"
          onClick={copyCode}
          aria-label={copied ? "Referral code copied" : `Copy referral code ${code}`}
          className="mt-6 flex w-full flex-col items-center rounded-2xl border border-dashed border-primary-glow/35 bg-primary/[0.06] px-5 py-4 transition-colors hover:border-primary-glow/60 hover:bg-primary/[0.09]"
        >
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-faint-foreground">
            Your code
          </span>
          <span className="tnum mt-1.5 font-mono text-[22px] font-semibold tracking-[0.14em] text-primary-glow">
            {code}
          </span>
          <span
            className={`mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold ${
              copied ? "text-primary-glow" : "text-faint-foreground"
            }`}
          >
            {copied ? (
              <>
                <Check size={12} strokeWidth={2.6} /> Copied
              </>
            ) : (
              "Tap to copy"
            )}
          </span>
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Referral code copied to clipboard" : ""}
        </span>

        {/* Actions */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={shareInvite} className="onyx-btn-primary">
            <Share2 size={16} />
            Share invite
          </button>
          <button type="button" onClick={copyCode} className="onyx-btn-ghost">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>

        {/* How it works */}
        <div className="mt-7">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
            How it works
          </p>
          <ol className="mt-3 space-y-3.5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <span
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-b from-primary-glow to-primary font-display text-[12px] font-bold text-[#04120c] shadow-[0_6px_16px_-6px_rgba(34,195,135,0.7)]"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold tracking-tight text-foreground">
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-6 text-center text-[12px] text-faint-foreground">
          Rewards land automatically — no forms.
        </p>
      </div>
    </Modal>
  );
}
