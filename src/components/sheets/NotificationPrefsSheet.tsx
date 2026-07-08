import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";
import { useProfile, type NotifPrefs } from "@/store/profile";
import Toggle from "./Toggle";

const ROWS: { key: keyof NotifPrefs; title: string; sub: string }[] = [
  {
    key: "txAlerts",
    title: "Transaction alerts",
    sub: "Every debit and credit, the moment it happens.",
  },
  {
    key: "promos",
    title: "Promos & offers",
    sub: "Cashback boosts, bundle deals and new services.",
  },
  {
    key: "security",
    title: "Security alerts",
    sub: "New sign-ins, PIN changes and anything unusual.",
  },
];

/** Notification preferences — toggles write straight to the profile store. */
export default function NotificationPrefsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, setNotifs } = useProfile();

  return (
    <Modal open={open} onClose={onClose} label="Notifications">
      <FlowHeader title="Notifications" subtitle="Choose what reaches you" onClose={onClose} />
      <div className="px-5 pb-2 pt-5">
        <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center gap-3.5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold tracking-tight text-foreground">
                  {row.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-faint-foreground">{row.sub}</p>
              </div>
              <Toggle
                on={profile.notifs[row.key]}
                onChange={(next) => setNotifs({ [row.key]: next })}
                label={row.title}
              />
            </div>
          ))}
        </div>
        <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-faint-foreground">
          Changes apply instantly. Security alerts are recommended — they're how you'd spot someone
          else in your account.
        </p>
      </div>
      <FlowFooter>
        <button type="button" className="onyx-btn-primary w-full" onClick={onClose}>
          Done
        </button>
      </FlowFooter>
    </Modal>
  );
}
