import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";
import { useNotices, type Notice } from "@/store/notices";

/** The bell sheet — every in-app notification, unread ones marked with an
 *  emerald dot. Read-state only changes via the explicit "Mark all as read"
 *  action (nothing happens silently on close). */

function NoticeRow({ notice, unread }: { notice: Notice; unread: boolean }) {
  const Icon = notice.icon;
  return (
    <li className="flex items-start gap-3.5 px-1 py-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border border-white/[0.07] bg-white/[0.03] text-ink-mid">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-semibold tracking-tight text-foreground">
            {notice.title}
          </p>
          {unread && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-primary-glow shadow-[0_0_8px_rgba(124,240,180,0.8)]"
              aria-hidden="true"
            />
          )}
          {unread && <span className="sr-only">Unread</span>}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{notice.body}</p>
      </div>
      <span className="shrink-0 pt-0.5 text-[11px] text-faint-foreground">{notice.time}</span>
    </li>
  );
}

export default function NotificationsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { notices, readIds, unreadCount, markAllRead } = useNotices();

  return (
    <Modal open={open} onClose={onClose} label="Notifications">
      <FlowHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
        onClose={onClose}
      />

      <div className="px-5 pb-2 pt-2">
        <ul className="flex flex-col divide-y divide-white/5">
          {notices.map((n) => (
            <NoticeRow key={n.id} notice={n} unread={!readIds.includes(n.id)} />
          ))}
        </ul>
      </div>

      <FlowFooter>
        <button
          type="button"
          className="onyx-btn-ghost w-full disabled:pointer-events-none disabled:opacity-40"
          disabled={unreadCount === 0}
          onClick={() => {
            markAllRead();
            toast("All caught up", {
              description: "Every notification is now marked as read.",
            });
          }}
        >
          Mark all as read
        </button>
      </FlowFooter>
    </Modal>
  );
}
