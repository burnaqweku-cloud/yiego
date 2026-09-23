import type { Agent } from "@/components/agent/AgentShell";

/* One place that answers "where is this agent in their subscription?".
   active  → paid, days left
   grace   → paid_until passed, still inside the grace day(s); store still open
   lapsed  → grace over; dashboard open, store closed, agent prices locked
   unpaid  → approved but never paid */
export type SubState = "active" | "grace" | "lapsed" | "unpaid" | "suspended";
export interface SubInfo { state: SubState; daysLeft: number; paidUntil: Date | null; closesOn: Date | null }

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function subscriptionOf(agent: Pick<Agent, "status" | "paid_until">, graceDays = 1): SubInfo {
  if (agent.status === "suspended") return { state: "suspended", daysLeft: 0, paidUntil: null, closesOn: null };
  if (agent.status === "awaiting_payment" || !agent.paid_until) return { state: "unpaid", daysLeft: 0, paidUntil: null, closesOn: null };
  const paidUntil = startOfDay(new Date(agent.paid_until));
  const today = startOfDay(new Date());
  const daysLeft = Math.round((+paidUntil - +today) / DAY);
  const closesOn = new Date(+paidUntil + graceDays * DAY);
  if (agent.status === "lapsed" || agent.status === "paused") return { state: "lapsed", daysLeft, paidUntil, closesOn };
  if (daysLeft >= 0) return { state: "active", daysLeft, paidUntil, closesOn };
  if (-daysLeft <= graceDays) return { state: "grace", daysLeft, paidUntil, closesOn };
  return { state: "lapsed", daysLeft, paidUntil, closesOn };
}

export const longDate = (d: Date | null) => d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "";
