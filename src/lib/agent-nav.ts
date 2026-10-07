import { AppWindow, BarChart3, Gift, Globe, Home, LifeBuoy, Megaphone, MessagesSquare, Network, Package, PhoneForwarded, Settings, ShoppingBag, Tags, UserCog, Users, Wallet, type LucideIcon } from "lucide-react";

/* The agent dashboard menu, two tiers like the admin's: a group you tap opens its pages.
   A page is a route; when the route has a `view`, the page component shows only the
   sections listed for that view (see <Section />), so one long page becomes several screens. */
export interface AgentNavPage { id: string; label: string; to: string; end?: boolean; badge?: boolean; sections?: string[] }
export interface AgentNavGroup { id: string; label: string; icon: LucideIcon; parentOnly?: boolean; pages: AgentNavPage[] }

export const AGENT_GROUPS: AgentNavGroup[] = [
  { id: "home", label: "Home", icon: Home, pages: [{ id: "home", label: "Home", to: "/agent", end: true }] },
  { id: "sell", label: "Sell", icon: ShoppingBag, pages: [
    { id: "buy", label: "Buy data", to: "/agent/buy" },
    { id: "prices", label: "Prices", to: "/agent/prices" },
  ] },
  { id: "store", label: "My store", icon: Settings, pages: [
    { id: "store-details", label: "Store details", to: "/agent/store/details", sections: ["details", "payout", "alerts"] },
    { id: "store-look", label: "Template & look", to: "/agent/store/look", sections: ["template", "look"] },
    { id: "store-about", label: "About & contact", to: "/agent/store/about", sections: ["about"] },
    { id: "store-featured", label: "Featured bundles", to: "/agent/store/featured", sections: ["featured"] },
    { id: "store-faq", label: "FAQ", to: "/agent/store/faq", sections: ["faq"] },
    { id: "domain-addresses", label: "Store address", to: "/agent/domain/addresses", sections: ["free-address"] },
  ] },
  { id: "domain", label: "Domain", icon: Globe, pages: [
    { id: "domain-buy", label: "Buy a domain", to: "/agent/domain/buy", sections: ["buy-a-domain-through-us", "domains-bought-through-us", "perks"] },
    { id: "domain-connect", label: "Connect an existing domain", to: "/agent/domain/connect", sections: ["your-own-domain", "perks", "email-domain"] },
  ] },
  { id: "customers", label: "Customers", icon: Users, pages: [
    { id: "support", label: "Support inbox", to: "/agent/support", badge: true },
    { id: "orders", label: "Orders", to: "/agent/orders" },
    { id: "customers", label: "Customers", to: "/agent/customers" },
    { id: "check-mtn", label: "Check MTN numbers", to: "/agent/check-mtn" },
  ] },
  { id: "money", label: "Money", icon: Wallet, pages: [{ id: "earnings", label: "Earnings & payouts", to: "/agent/earnings" }] },
  { id: "grow", label: "Marketing", icon: Megaphone, pages: [
    { id: "announcements", label: "Announcements", to: "/agent/marketing/announcements", sections: ["announcement"] },
    { id: "promos", label: "Promos", to: "/agent/marketing/promos", sections: ["promo"] },
    { id: "status", label: "Status maker", to: "/agent/status" },
    { id: "analytics", label: "Analytics", to: "/agent/analytics" },
    { id: "popups", label: "Pop-ups", to: "/agent/popups/popups", sections: ["new-pop-up", "your-pop-ups"] },
    { id: "forms", label: "Form submissions", to: "/agent/popups/forms", sections: ["form-submissions"] },
  ] },
  { id: "agents", label: "Your agents", icon: Network, parentOnly: true, pages: [
    { id: "applications", label: "Applications", to: "/agent/network/applications", sections: ["applications"] },
    { id: "agents-all", label: "All agents", to: "/agent/network/agents", sections: ["agents"] },
    { id: "programme", label: "Programme & invite link", to: "/agent/network/programme", sections: ["programme"] },
    { id: "questions", label: "Application form", to: "/agent/network/form", sections: ["questions"] },
    { id: "coupons", label: "Coupons", to: "/agent/network/coupons", sections: ["coupons-on-your-fee"] },
    { id: "agent-messages", label: "Message your agents", to: "/agent/network/messages", sections: ["message-your-agents"] },
  ] },
  { id: "team", label: "Team & support", icon: UserCog, pages: [
    { id: "assistant", label: "Store assistant", to: "/agent/assistant" },
    { id: "support-settings", label: "Support buttons", to: "/agent/team/support", sections: ["buttons-on-your-store"] },
    { id: "staff", label: "Staff", to: "/agent/team/staff", sections: ["team"] },
  ] },
  { id: "more", label: "More", icon: LifeBuoy, pages: [
    { id: "ask", label: "Ask DataYego", to: "/agent/ask" },
    { id: "invite", label: "Invite & earn", to: "/account" },
    { id: "help", label: "Help Center", to: "/agent/help" },
  ] },
];

export const STAFF_GROUPS: AgentNavGroup[] = [
  { id: "customers", label: "Customers", icon: Users, pages: [
    { id: "support", label: "Support inbox", to: "/agent/support", badge: true, end: true },
    { id: "orders", label: "Orders", to: "/agent/orders" },
    { id: "customers", label: "Customers", to: "/agent/customers" },
    { id: "check-mtn", label: "Check MTN numbers", to: "/agent/check-mtn" },
  ] },
  { id: "more", label: "More", icon: LifeBuoy, pages: [{ id: "ask", label: "Ask DataYego", to: "/agent/ask" }, { id: "help", label: "Help Center", to: "/agent/help" }] },
];

/* Which sections a route shows. Keyed by pathname; undefined means "all, collapsible". */
export function sectionsForPath(pathname: string): string[] | undefined {
  for (const g of AGENT_GROUPS) for (const p of g.pages) if (p.sections && pathname.replace(/\/$/, "") === p.to) return p.sections;
  return undefined;
}
export function groupForPath(pathname: string, groups: AgentNavGroup[]): AgentNavGroup | undefined {
  return groups.find((g) => g.pages.some((p) => (p.end ? pathname === p.to : pathname.startsWith(p.to)) || (g.id !== "home" && pathname.startsWith(p.to.split("/").slice(0, 3).join("/")))));
}
/* Old single-page routes keep working: send them to their first view. */
export const LEGACY_REDIRECTS: Record<string, string> = { "/agent/store": "/agent/store/details", "/agent/domain": "/agent/domain/buy", "/agent/marketing": "/agent/marketing/announcements", "/agent/popups": "/agent/popups/popups", "/agent/network": "/agent/network/applications", "/agent/team": "/agent/team/support" };
