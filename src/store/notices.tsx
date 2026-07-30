import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownToLine, ArrowUpRight, BadgePercent, Megaphone, ShieldCheck } from "lucide-react";
import { useWallet } from "@/store/wallet";
import { formatGHS } from "@/lib/format";

/** In-app notifications — the bell. Real wallet activity generates live
 *  notices on top of a few product notes; read-state persists. */

export interface Notice {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  time: string;
}

const STATIC_NOTICES: Notice[] = [
  {
    id: "n2",
    icon: BadgePercent,
    title: "1% cashback on every purchase",
    body: "Every bill, bundle and top-up earns cashback — redeem it from your Wallet.",
    time: "Yesterday",
  },
  {
    id: "n3",
    icon: ShieldCheck,
    title: "Security check complete",
    body: "Your account passed this month's automatic security review.",
    time: "2d ago",
  },
  {
    id: "n4",
    icon: Megaphone,
    title: "New: eSIM data packs",
    body: "Travelling? Instant eSIMs for West Africa, Europe and beyond are live.",
    time: "3d ago",
  },
];

const STORAGE_KEY = "yiego_notices_v1";

function agoLabel(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface NoticesValue {
  notices: Notice[];
  readIds: string[];
  unreadCount: number;
  markAllRead: () => void;
}

const NoticesContext = createContext<NoticesValue | null>(null);

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.filter((x) => typeof x === "string");
    }
  } catch {
    /* reseed */
  }
  return [];
}

export function NoticesProvider({ children }: { children: ReactNode }) {
  const { transactions } = useWallet();
  const [readIds, setReadIds] = useState<string[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
    } catch {
      /* non-fatal */
    }
  }, [readIds]);

  // Live notices from real wallet movement in the last 48 hours.
  const liveNotices: Notice[] = transactions
    .filter((t) => t.ts && Date.now() - t.ts < 48 * 3600_000)
    .slice(0, 5)
    .map((t) => ({
      id: `tx-${t.id}`,
      icon: t.amount > 0 ? ArrowDownToLine : ArrowUpRight,
      title: t.amount > 0 ? "Money in" : "Payment sent",
      body: `${t.title} · ${formatGHS(Math.abs(t.amount))}`,
      time: agoLabel(t.ts!),
    }));

  const notices = [...liveNotices, ...STATIC_NOTICES];
  const unreadCount = notices.filter((n) => !readIds.includes(n.id)).length;

  return (
    <NoticesContext.Provider
      value={{
        notices,
        readIds,
        unreadCount,
        markAllRead: () => setReadIds(notices.map((n) => n.id)),
      }}
    >
      {children}
    </NoticesContext.Provider>
  );
}

export function useNotices(): NoticesValue {
  const ctx = useContext(NoticesContext);
  if (!ctx) throw new Error("useNotices must be used within a NoticesProvider");
  return ctx;
}
