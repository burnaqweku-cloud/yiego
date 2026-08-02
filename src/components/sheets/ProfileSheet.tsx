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
  const [phone, setPhone] = useState(profile.phone);
  const [saving, setSaving] = useState(false);

  // Re-seed the form from the store each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setFirst(profile.firstName);
    setLast(profile.lastName);
    setPhone(profile.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const phoneOk = phone.length === 10;
  const valid = first.trim().length >= 2 && phoneOk;

  const save = async () => {
    setSaving(true);
    try {
      await update({ firstName: first.trim(), lastName: last.trim(), phone });
      toast.success("Profile updated");
      onClose();
    } catch {
      toast.error("We couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
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
              placeholder="First name"
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
              placeholder="Last name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="pf-email" className={labelCls}>
            Email
          </label>
          <div id="pf-email" className="onyx-field mt-2 flex items-center text-[16px] text-muted-foreground">{profile.email}</div>
          <p className="mt-1.5 text-[12px] text-faint-foreground">Email changes require account verification and are not available here yet.</p>
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
          Your name and phone number are saved to your YieGo account.
        </p>
      </div>
      <FlowFooter>
        <button
          type="button"
          className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
          disabled={!valid || saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </FlowFooter>
    </Modal>
  );
}
