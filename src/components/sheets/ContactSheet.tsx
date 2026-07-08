import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView, SuccessView } from "@/components/flows/flow-parts";
import { useProfile } from "@/store/profile";

type Step = "form" | "sending" | "sent";

/** Contact support — subject + message, then a success state in the sheet. */
export default function ContactSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useProfile();
  const [step, setStep] = useState<Step>("form");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [ticket, setTicket] = useState("");

  // Reset on open AND close — closing mid-send cancels the pending timer.
  useEffect(() => {
    setStep("form");
    setSubject("");
    setMessage("");
    setTicket("");
  }, [open]);

  const valid = subject.trim().length >= 3 && message.trim().length >= 10;

  useEffect(() => {
    if (step !== "sending") return;
    const id = window.setTimeout(() => {
      setTicket(`YG-${Math.floor(1000 + Math.random() * 9000)}`);
      setStep("sent");
    }, 1000);
    return () => window.clearTimeout(id);
  }, [step]);

  const labelCls = "text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground";

  return (
    <Modal open={open} onClose={onClose} label="Contact support">
      {step === "form" && (
        <>
          <FlowHeader title="Contact support" subtitle="We reply within a few hours" onClose={onClose} />
          <div className="space-y-5 px-5 pb-2 pt-5">
            <div>
              <label htmlFor="cs-subject" className={labelCls}>
                Subject
              </label>
              <input
                id="cs-subject"
                className="onyx-field mt-2 text-[16px]"
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, 80))}
                placeholder="e.g. Bundle didn't arrive"
              />
            </div>
            <div>
              <label htmlFor="cs-message" className={labelCls}>
                Message
              </label>
              <textarea
                id="cs-message"
                className="onyx-field mt-2 min-h-[130px] resize-none text-[16px] leading-relaxed"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                placeholder="Tell us what happened — include the phone number or transaction if you can."
              />
            </div>
            <p className="text-[12.5px] leading-relaxed text-faint-foreground">
              We'll reply to {profile.email}. For anything money-related, the transaction stays safe
              in your wallet while we sort it out.
            </p>
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
              disabled={!valid}
              onClick={() => setStep("sending")}
            >
              Send message
            </button>
          </FlowFooter>
        </>
      )}

      {step === "sending" && <ProcessingView label="Sending your message…" />}

      {step === "sent" && (
        <SuccessView
          title="Message sent!"
          message="Our support team is on it — you'll hear back in your inbox within a few hours."
          rows={[
            { label: "Subject", value: subject.trim() },
            { label: "Reply to", value: profile.email },
            { label: "Ticket", value: `#${ticket}` },
          ]}
          primaryLabel="Done"
          onPrimary={onClose}
        />
      )}
    </Modal>
  );
}
