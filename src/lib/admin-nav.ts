import { BookOpen, Bot, ClipboardList, Contact, FileText, Gauge, Inbox, LifeBuoy, Landmark, MessageSquareWarning, Package, ShieldCheck, Star, Store, Tags, TrendingUp, Users, WalletCards, type LucideIcon } from "lucide-react";

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

/* ── Pinned + recent, per admin, in localStorage ─────────────────────────── */

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
  return next;
}
export function readRecent(userId: string) { return read(RECENT_KEY(userId)); }
export function pushRecent(userId: string, pageId: string): string[] {
  if (pageId === "overview") return readRecent(userId); // the home page isn't "recent"
  const next = [pageId, ...readRecent(userId).filter((id) => id !== pageId)].slice(0, MAX_RECENT);
  write(RECENT_KEY(userId), next);
  return next;
}

export const PinIcon = Star;
