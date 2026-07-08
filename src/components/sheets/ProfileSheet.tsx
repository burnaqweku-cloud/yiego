import { useEffect, useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";
import { useProfile } from "@/store/profile";

/** Edit personal details — writes straight into the profile store, so the
 *  avatar initials and contact line update everywhere instantly. */
export default function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, update } = useProfile();
  const [first, setFirst] = useState(profile.firstName);
  const [last, setLast] = useState(profile.lastName);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);

  // Re-seed the form from the store each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setFirst(profile.firstName);
    setLast(profile.lastName);
    setEmail(profile.email);
    setPhone(profile.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const phoneOk = phone.length === 10;
  const valid = first.trim().length >= 2 && last.trim().length >= 2 && emailOk && phoneOk;

  const save = () => {
    update({
      firstName: first.trim(),
      lastName: last.trim(),
      email: email.trim(),
      phone,
    });
    toast("Profile updated", { description: "Your details are saved on this device." });
    onClose();
  };

  const labelCls = "text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground";

  return (
    <Modal open={open} onClose={onClose} label="Edit profile">
      <FlowHeader title="Edit profile" subtitle="Your personal details" onClose={onClose} />
      <div className="space-y-5 px-5 pb-2 pt-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pf-first" className={labelCls}>
              First name
            </label>
            <input
              id="pf-first"
              className="onyx-field mt-2 text-[16px]"
              value={first}
              autoComplete="given-name"
              onChange={(e) => setFirst(e.target.value.slice(0, 30))}
              placeholder="Kwame"
            />
          </div>
          <div>
            <label htmlFor="pf-last" className={labelCls}>
              Last name
            </label>
            <input
              id="pf-last"
              className="onyx-field mt-2 text-[16px]"
              value={last}
              autoComplete="family-name"
              onChange={(e) => setLast(e.target.value.slice(0, 30))}
              placeholder="Mensah"
            />
          </div>
        </div>

        <div>
          <label htmlFor="pf-email" className={labelCls}>
            Email
          </label>
          <input
            id="pf-email"
            className="onyx-field mt-2 text-[16px]"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.slice(0, 60))}
            placeholder="you@example.com"
          />
          {email.length > 0 && !emailOk && (
            <p className="mt-1.5 text-[12px] text-danger">That doesn't look like an email address.</p>
          )}
        </div>

        <div>
          <label htmlFor="pf-phone" className={labelCls}>
            Phone
          </label>
          <input
            id="pf-phone"
            className="onyx-field mt-2 text-[16px] tnum"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="0244001122"
          />
          {phone.length > 0 && !phoneOk && (
            <p className="mt-1.5 text-[12px] text-danger">Enter your 10-digit Ghana number.</p>
          )}
        </div>

        <p className="text-[12.5px] leading-relaxed text-faint-foreground">
          Your name appears on receipts and payment links. We'll use this email and number for
          statements and alerts.
        </p>
      </div>
      <FlowFooter>
        <button
          type="button"
          className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
          disabled={!valid}
          onClick={save}
        >
          Save changes
        </button>
      </FlowFooter>
    </Modal>
  );
}
