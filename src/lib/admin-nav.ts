import { supabase } from "@/integrations/supabase/client";
import { BadgePercent, BookOpen, Bot, CreditCard, Megaphone, Rocket, UserCheck, ClipboardList, Contact, FileText, Gauge, Inbox, LifeBuoy, Landmark, MessageSquareWarning, Package, ShieldCheck, Star, Store, Tags, TrendingUp, Users, WalletCards, type LucideIcon } from "lucide-react";

/** One admin page. `keywords` are what "Find a page" matches on besides the label. */
export interface AdminPage {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  keywords?: string[];
  end?: boolean;
}

export interface AdminGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  pages: AdminPage[];
}

export const ADMIN_GROUPS: AdminGroup[] = [
  { id: "overview", label: "Overview", icon: Gauge, pages: [
    { id: "overview", label: "Overview", to: "/admin", icon: Gauge, end: true, keywords: ["home", "dashboard", "today"] },
  ] },
  { id: "operations", label: "Operations", icon: ClipboardList, pages: [
    { id: "orders", label: "Orders", to: "/admin/orders", icon: ClipboardList, keywords: ["order", "refund", "retry", "failed", "delivered", "processing", "verification", "mtn"] },
    { id: "reviews", label: "Review queue", to: "/admin/reviews", icon: ShieldCheck, keywords: ["needs review", "failed", "stuck"] },
    { id: "disputes", label: "Disputes", to: "/admin/disputes", icon: MessageSquareWarning, keywords: ["complaint", "chargeback"] },
  ] },
  { id: "money", label: "Money", icon: Landmark, pages: [
    { id: "finance", label: "Finance", to: "/admin/finance", icon: TrendingUp, keywords: ["money put in", "top-ups", "funding", "revenue", "profit", "margin", "sales", "reconciliation"] },
    { id: "wallet", label: "Wallet activity", to: "/admin/wallet", icon: WalletCards, keywords: ["deposit", "top up", "balance"] },
    { id: "suppliers", label: "Suppliers", to: "/admin/suppliers", icon: Store, keywords: ["datamart", "databundleshub", "dbh", "float", "supplier balance"] },
  ] },
  { id: "catalog", label: "Catalog", icon: Package, pages: [
    { id: "pricing", label: "Data pricing", to: "/admin/sales/pricing", icon: Tags, keywords: ["price", "bundle", "product", "gb"] },
  ] },
  { id: "users", label: "Users", icon: Users, pages: [
    { id: "users", label: "All users", to: "/admin/users", icon: Users, keywords: ["customer", "account", "admin", "email"] },
  ] },
  { id: "agents", label: "Agents", icon: Store, pages: [
    { id: "agents", label: "Overview", to: "/admin/agents", icon: Store, keywords: ["agent", "agents"] },
    { id: "agent-applications", label: "Applications", to: "/admin/agents/applications", icon: UserCheck, keywords: ["apply", "approve", "decline", "application"] },
    { id: "agent-list", label: "All agents", to: "/admin/agents/list", icon: Users, keywords: ["store", "slug", "active", "paused"] },
    { id: "agent-subscriptions", label: "Subscriptions", to: "/admin/agents/subscriptions", icon: CreditCard, keywords: ["subscription", "paid until", "expiring", "renewal", "monthly"] },
    { id: "agent-payouts", label: "Payments", to: "/admin/agents/payouts", icon: WalletCards, keywords: ["payout", "payment", "withdraw", "momo", "earnings", "pay agent"] },
    { id: "agent-plan", label: "Plan & promos", to: "/admin/agents/plan", icon: BadgePercent, keywords: ["promo", "discount", "fee", "price", "plan"] },
    { id: "agent-launch", label: "Launch", to: "/admin/agents/launch", icon: Rocket, keywords: ["launch", "switch", "go live", "email test"] },
  ] },
  { id: "announcements", label: "Announcements", icon: Megaphone, pages: [
    { id: "announcements", label: "Announcements", to: "/admin/announcements", icon: Megaphone, keywords: ["notification", "announce", "update", "notice", "bell", "broadcast"] },
  ] },
  { id: "support", label: "Support", icon: LifeBuoy, pages: [
    { id: "support-inbox", label: "Support inbox", to: "/admin/support-inbox", icon: Inbox, keywords: ["message", "ticket", "whatsapp"] },
    { id: "ai-support", label: "AI assistant", to: "/admin/ai-support", icon: Bot, keywords: ["chatbot", "assistant"] },
    { id: "ai-knowledge", label: "Knowledge base", to: "/admin/ai-knowledge", icon: BookOpen, keywords: ["faq", "articles", "help"] },
  ] },
  { id: "site", label: "Site", icon: FileText, pages: [
    { id: "contact", label: "Contact information", to: "/admin/contacts/information", icon: Contact, keywords: ["phone", "email", "address", "whatsapp"] },
    { id: "legal", label: "Legal documents", to: "/admin/legal", icon: FileText, keywords: ["terms", "privacy", "policy"] },
  ] },
];

export const ADMIN_PAGES: AdminPage[] = ADMIN_GROUPS.flatMap((g) => g.pages);

export function pageForPath(pathname: string): AdminPage | undefined {
  if (pathname === "/admin" || pathname === "/admin/") return ADMIN_PAGES[0];
  return ADMIN_PAGES.filter((p) => !p.end).sort((a, b) => b.to.length - a.to.length).find((p) => pathname.startsWith(p.to));
}

export function groupForPath(pathname: string): AdminGroup | undefined {
  const page = pageForPath(pathname);
  return page ? ADMIN_GROUPS.find((g) => g.pages.some((p) => p.id === page.id)) : undefined;
}

export function searchPages(query: string): AdminPage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return ADMIN_PAGES
    .map((page) => {
      const hay = [page.label, ...(page.keywords ?? [])].join(" ").toLowerCase();
      const score = words.reduce((n, w) => n + (page.label.toLowerCase().startsWith(w) ? 3 : hay.includes(w) ? 1 : -10), 0);
      return { page, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.page);
}

/* ── Pinned + recent, per admin ───────────────────────────────────────────
   Kept in localStorage so the sidebar draws instantly, and mirrored to
   phase1.admin_prefs so they follow the admin onto any device. */

const PIN_KEY = (userId: string) => `yg-admin-pins:${userId}`;
const RECENT_KEY = (userId: string) => `yg-admin-recent:${userId}`;
export const MAX_RECENT = 3;

function read(key: string): string[] {
  try { const raw = localStorage.getItem(key); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}
function write(key: string, ids: string[]) { try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage may be unavailable */ } }

export function readPins(userId: string) { return read(PIN_KEY(userId)); }
export function togglePin(userId: string, pageId: string): string[] {
  const current = readPins(userId);
  const next = current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId];
  write(PIN_KEY(userId), next);
  void savePrefs(userId, { pins: next });
  return next;
}
export function readRecent(userId: string) { return read(RECENT_KEY(userId)); }
export function pushRecent(userId: string, pageId: string): string[] {
  if (pageId === "overview") return readRecent(userId); // the home page isn't "recent"
  const next = [pageId, ...readRecent(userId).filter((id) => id !== pageId)].slice(0, MAX_RECENT);
  write(RECENT_KEY(userId), next);
  void savePrefs(userId, { recents: next });
  return next;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prefsTable = () => (supabase as unknown as { schema: (s: string) => { from: (t: string) => any } }).schema("phase1").from("admin_prefs");
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { pins?: string[]; recents?: string[] } = {};
async function savePrefs(userId: string, patch: { pins?: string[]; recents?: string[] }) {
  if (!userId) return;
  pending = { ...pending, ...patch };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    // Always send both lists so a recents update never wipes the pins (or vice versa).
    const body = { user_id: userId, pins: readPins(userId), recents: readRecent(userId), ...pending, updated_at: new Date().toISOString() }; pending = {};
    try { await prefsTable().upsert(body, { onConflict: "user_id" }); } catch { /* local copy still works */ }
  }, 600);
}
/** Pull the account's saved pins/recents; local copy is replaced if the server has anything. */
export async function syncPrefsFromAccount(userId: string): Promise<{ pins: string[]; recents: string[] } | null> {
  if (!userId) return null;
  try {
    const { data } = await prefsTable().select("pins, recents").eq("user_id", userId).maybeSingle();
    if (!data) return null;
    const serverPins = Array.isArray(data.pins) ? data.pins.filter((x: unknown) => typeof x === "string") : [];
    const serverRecents = Array.isArray(data.recents) ? data.recents.filter((x: unknown) => typeof x === "string") : [];
    // The fuller list wins: an empty server list never erases what this device has.
    const pins = serverPins.length ? serverPins : readPins(userId);
    const recents = serverRecents.length ? serverRecents : readRecent(userId);
    write(PIN_KEY(userId), pins); write(RECENT_KEY(userId), recents);
    if (!serverPins.length && pins.length) void savePrefs(userId, { pins });
    return { pins, recents };
  } catch { return null; }
}

export const PinIcon = Star;
