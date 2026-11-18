/* Messages on the agent dashboard (owner, 18 Nov 2026): a card under the balance, part of the page, not a pop-up and
   not a notification. Written in Admin -> Announcements ("Where it shows": dashboard or both); the database decides who
   gets which (phase1.my_dashboard_messages: main agents on a paid plan, never sub-agents, "only agents without their own
   domain" when chosen, minus the ones this account has said "Got it" to). */

export interface DashboardMessage { id: string; title: string; body: string; kind: string; link_url: string | null; link_label: string | null; starts_at: string }

/** Only well-formed messages; anything else in the reply is dropped. */
export function readDashboardMessages(data: unknown): DashboardMessage[] {
  if (!Array.isArray(data)) return [];
  return data.filter((m): m is DashboardMessage => !!m && typeof m === "object"
    && typeof (m as DashboardMessage).id === "string" && typeof (m as DashboardMessage).title === "string" && typeof (m as DashboardMessage).body === "string")
    .map((m) => ({ ...m, kind: typeof m.kind === "string" ? m.kind : "update", link_url: typeof m.link_url === "string" && m.link_url.trim() ? m.link_url.trim() : null,
      link_label: typeof m.link_label === "string" && m.link_label.trim() ? m.link_label.trim() : null, starts_at: typeof m.starts_at === "string" ? m.starts_at : new Date().toISOString() }));
}

/** A link inside the app ("/agent/domain/buy") opens in place; anything else opens in a new tab. */
export const isInAppLink = (url: string | null): boolean => !!url && /^\/(?!\/)/.test(url);

/** "today", "yesterday", or "12 Nov", in Ghana time. */
export function whenLabel(startsAt: string, now: Date = new Date()): string {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
  const at = new Date(startsAt); if (Number.isNaN(at.getTime())) return "";
  if (day(at) === day(now)) return "today";
  if (day(at) === day(new Date(now.getTime() - 86_400_000))) return "yesterday";
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" });
}

/** The button's words: the link text written with the message, or a plain default. */
export const buttonLabel = (m: Pick<DashboardMessage, "link_url" | "link_label">): string | null => m.link_url ? (m.link_label || "Open") : null;
