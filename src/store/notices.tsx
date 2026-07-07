import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BadgePercent, Link2, ShieldCheck, Sparkles } from "lucide-react";

/** In-app notifications — the bell. Read-state persists. */

export interface Notice {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  time: string;
}

export const NOTICES: Notice[] = [
  {
    id: "n1",
    icon: Link2,
    title: "You got paid",
    body: "GH₵150.00 came in through your payment link “1:1 Consultation”.",
    time: "2h ago",
  },
  {
    id: "n2",
    icon: BadgePercent,
    title: "5% cashback weekend",
    body: "Every data bundle this weekend earns 5% back in your wallet.",
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
    icon: Sparkles,
    title: "New: eSIM data packs",
    body: "Travelling? Instant eSIMs for West Africa, Europe and beyond are live.",
    time: "3d ago",
  },
];

const STORAGE_KEY = "yiego_notices_v1";

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
  const [readIds, setReadIds] = useState<string[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
    } catch {
      /* non-fatal */
    }
  }, [readIds]);

  const unreadCount = NOTICES.filter((n) => !readIds.includes(n.id)).length;

  return (
    <NoticesContext.Provider
      value={{
        notices: NOTICES,
        readIds,
        unreadCount,
        markAllRead: () => setReadIds(NOTICES.map((n) => n.id)),
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
