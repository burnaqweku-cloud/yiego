/* When the "Get the app" strip in the agent dashboard is shown.
   Closing it puts it away for a day; it comes back the next day. An agent who has closed it five times has told us
   they do not want the app, so it stops for good on that phone. (Whether the phone can have the app at all, and
   whether it already has it, is decided by useAppOffer: this file is only about "not now".) */

const KEY = "yg-agent-appbar";
export const REST_MS = 24 * 3600 * 1000;
export const MAX_CLOSES = 5;

interface Memory { closes: number; until: number }

function read(): Memory {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Memory> | null;
    const closes = Number(m?.closes); const until = Number(m?.until);
    return { closes: Number.isFinite(closes) && closes > 0 ? Math.floor(closes) : 0, until: Number.isFinite(until) && until > 0 ? until : 0 };
  } catch { return { closes: 0, until: 0 }; }
}

/** Resting for the day, or closed often enough to stop. */
export function agentAppBarResting(now = Date.now()): boolean {
  const m = read();
  return m.closes >= MAX_CLOSES || now < m.until;
}

/** The agent tapped the X: away for a day, and one more "no" counted. */
export function closeAgentAppBar(now = Date.now()): void {
  try { localStorage.setItem(KEY, JSON.stringify({ closes: read().closes + 1, until: now + REST_MS })); } catch { /* storage unavailable: it only hides for this visit */ }
}
