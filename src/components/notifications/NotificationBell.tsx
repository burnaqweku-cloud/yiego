import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, ChevronRight, ExternalLink, Pin } from "lucide-react";
import { KIND_LABEL, loadAnnouncements, markRead, type Announcement } from "@/lib/announcements";

/* Bell with unread count; opens a panel listing announcements. Used in the
   public nav (customers) and the agent app header (agents). */
export default function NotificationBell({ className = "" }: { className?: string }) {
  const [items, setItems] = useState<Announcement[]>([]); const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const load = () => void loadAnnouncements().then(setItems);
  useEffect(() => { load(); const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!open) { setSelected(null); return; } const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc); }, [open]);
  // Keep the panel fully on screen: it hangs from the bell's right edge, but on
  // phones the bell sits left of the menu button, so shift it to fit 12px margins.
  const [pos, setPos] = useState<{ width: number; right: number }>({ width: 360, right: 0 });
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect(); if (!r) return;
      const vw = document.documentElement.clientWidth; const width = Math.min(360, vw - 24);
      const left = Math.min(Math.max(r.right - width, 12), vw - 12 - width);
      setPos({ width, right: r.right - (left + width) });
    };
    place(); window.addEventListener("resize", place); return () => window.removeEventListener("resize", place);
  }, [open]);
  const unread = items.filter((a) => !a.read).length;
  const openItem = async (a: Announcement) => { if (!a.read) { await markRead(a.id); setItems((l) => l.map((x) => x.id === a.id ? { ...x, read: true } : x)); } };
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((o) => !o)} className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] text-muted-foreground hover:bg-white/[0.05]">
        <Bell size={17} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-[#04120c]">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div style={{ width: pos.width, right: pos.right }} className="absolute z-50 mt-2 overflow-hidden rounded-2xl border border-white/[0.1] bg-background shadow-2xl">
          {selected ? (
            <div>
              <button type="button" onClick={() => setSelected(null)} className="flex w-full items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 text-[13px] font-semibold text-foreground"><ArrowLeft size={15} />Notifications</button>
              <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
                <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em]"><span className={selected.kind === "warning" ? "text-danger" : selected.kind === "price" ? "text-amber" : "text-primary-glow"}>{KIND_LABEL[selected.kind]}</span>{selected.is_pinned && <Pin size={10} className="text-faint-foreground" />}<span className="ml-auto font-normal normal-case tracking-normal text-faint-foreground">{new Date(selected.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></div>
                <p className="mt-1 text-[15px] font-semibold text-foreground">{selected.title}</p>
                <p className="mt-1.5 whitespace-pre-line text-[13px] leading-5 text-muted-foreground">{selected.body}</p>
                {selected.link_url && <a href={selected.link_url} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary-glow">{selected.link_label ?? "Open"}<ExternalLink size={12} /></a>}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5"><p className="text-[13px] font-semibold text-foreground">Notifications</p>{unread > 0 && <span className="text-[11px] text-primary-glow">{unread} new</span>}</div>
              <ul className="max-h-[60vh] divide-y divide-white/[0.06] overflow-y-auto">
                {items.length === 0 && <li className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">Nothing new.</li>}
                {items.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => { setSelected(a); void openItem(a); }} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${a.read ? "" : "bg-primary/[0.06]"}`}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${a.read ? "bg-transparent" : "bg-primary"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]"><span className={a.kind === "warning" ? "text-danger" : a.kind === "price" ? "text-amber" : "text-primary-glow"}>{KIND_LABEL[a.kind]}</span>{a.is_pinned && <Pin size={10} className="text-faint-foreground" />}<span className="ml-auto font-normal normal-case tracking-normal text-faint-foreground">{new Date(a.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></span>
                        <span className={`block truncate text-[13px] ${a.read ? "text-foreground" : "font-semibold text-foreground"}`}>{a.title}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{a.body.split("\n")[0]}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-faint-foreground" />
                    </button>
                  </li>))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Thin strip for guests: the newest unread announcement, dismissible. */
export function AnnouncementStrip() {
  const [item, setItem] = useState<Announcement | null>(null);
  useEffect(() => { void loadAnnouncements().then((l) => setItem(l.find((a) => !a.read) ?? null)); }, []);
  if (!item) return null;
  return (
    <div className={`mk-wrap mt-2`}>
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-2.5 text-[12.5px] ${item.kind === "warning" ? "border-danger/30 bg-danger/10" : item.kind === "price" ? "border-amber/30 bg-amber/10" : "border-primary/30 bg-primary/10"}`}>
        <div className="min-w-0 flex-1"><b className="text-foreground">{item.title}</b> <span className="text-muted-foreground">{item.body}</span>{item.link_url && <a href={item.link_url} className="ml-1 font-medium text-primary-glow">{item.link_label ?? "Open"} →</a>}</div>
        <button type="button" aria-label="Dismiss" onClick={() => { void markRead(item.id); setItem(null); }} className="text-faint-foreground">✕</button>
      </div>
    </div>
  );
}
