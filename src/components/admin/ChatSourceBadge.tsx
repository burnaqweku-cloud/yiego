import { Globe, LayoutDashboard, Store } from "lucide-react";

/* Which assistant a chat belongs to. Three assistants, three places the chats are read:
   Website (datayego.com visitors), Dashboard (agents asking their Store assistant), Storefront
   (an agent's customers asking the Chat assistant on that agent's store). */
const KINDS = {
  website: { label: "Website", icon: Globe, cls: "border-sky-400/30 bg-sky-400/[0.1] text-sky-300" },
  dashboard: { label: "Dashboard", icon: LayoutDashboard, cls: "border-violet-400/30 bg-violet-400/[0.1] text-violet-300" },
  storefront: { label: "Storefront", icon: Store, cls: "border-amber/30 bg-amber/[0.1] text-amber" },
} as const;

export type ChatSource = keyof typeof KINDS;

export default function ChatSourceBadge({ kind, store }: { kind: ChatSource; store?: string | null }) {
  const k = KINDS[kind]; const Icon = k.icon;
  return <span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${k.cls}`}><Icon size={10} className="shrink-0" /><span className="truncate">{k.label}{store ? ` · ${store}` : ""}</span></span>;
}
