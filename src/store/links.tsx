import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Live payment-links store — creating a link on the Payments page (or from
 * the developer card) adds it here; persisted like the wallet.
 */

export type LinkStatus = "Active" | "Paid" | "Off";

export interface PayLink {
  id: string;
  title: string;
  slug: string;
  /** Price of the link in GHS */
  amount: number;
  /** How many people have paid it */
  paid: number;
  status: LinkStatus;
}

const STORAGE_KEY = "yiego_links_v1";

const SEED: PayLink[] = [
  { id: "pl1", title: "Design retainer", slug: "dz4k", paid: 3, amount: 2500, status: "Active" },
  { id: "pl2", title: "Event ticket — VIP", slug: "vip7", paid: 41, amount: 150, status: "Active" },
  { id: "pl3", title: "1:1 Consultation", slug: "cnsl", paid: 12, amount: 400, status: "Active" },
  { id: "pl4", title: "Monthly subscription", slug: "subm", paid: 28, amount: 60, status: "Active" },
  { id: "pl5", title: "Donation", slug: "give", paid: 64, amount: 500, status: "Paid" },
];

interface LinksValue {
  links: PayLink[];
  addLink: (title: string, amount: number) => PayLink;
  toggleLink: (id: string) => void;
}

const LinksContext = createContext<LinksValue | null>(null);

function load(): PayLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PayLink[];
      if (Array.isArray(parsed) && parsed.every((l) => l && typeof l.slug === "string")) {
        return parsed;
      }
    }
  } catch {
    /* corrupt state — reseed */
  }
  return SEED;
}

function makeSlug(existing: PayLink[]): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (let attempt = 0; attempt < 50; attempt++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!existing.some((l) => l.slug === s)) return s;
  }
  return `l${Date.now().toString(36).slice(-4)}`;
}

export function LinksProvider({ children }: { children: ReactNode }) {
  const [links, setLinks] = useState<PayLink[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    } catch {
      /* non-fatal */
    }
  }, [links]);

  const addLink = (title: string, amount: number): PayLink => {
    const link: PayLink = {
      id: `pl${Date.now().toString(36)}`,
      title,
      slug: makeSlug(links),
      amount,
      paid: 0,
      status: "Active",
    };
    setLinks((ls) => [link, ...ls]);
    return link;
  };

  const toggleLink = (id: string) => {
    setLinks((ls) =>
      ls.map((l) =>
        l.id === id ? { ...l, status: l.status === "Off" ? "Active" : "Off" } : l,
      ),
    );
  };

  return (
    <LinksContext.Provider value={{ links, addLink, toggleLink }}>{children}</LinksContext.Provider>
  );
}

export function useLinks(): LinksValue {
  const ctx = useContext(LinksContext);
  if (!ctx) throw new Error("useLinks must be used within a LinksProvider");
  return ctx;
}

export function linkUrl(l: PayLink): string {
  return `link.yiego.com/${l.slug}`;
}
