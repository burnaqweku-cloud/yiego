/* The Back button on the agent sign-up pay screen ("One step left", owner 21 Nov 2026). Reached by tapping something
   on the site (the Agent tab, "Pay now", "My store"): Back returns to that page. Shown straight after signing in, or
   opened fresh with nothing of ours before it: Back goes to the home page.
   `idx` is React Router's own count of pages this visit (history.state.idx, 0 = the first page). */
export type BackMove = "previous" | "home";

export function agentBackMove(idx: unknown, fromLogin: boolean): BackMove {
  const n = typeof idx === "number" && Number.isFinite(idx) ? idx : 0;
  return n > 0 && !fromLogin ? "previous" : "home";
}

/** Set before leaving for a customer page: the home page sends a signed-in agent straight back to the dashboard
    unless this is set (pages/Home), which would put the person right back on the pay screen. */
export const AGENT_BROWSE_KEY = "yg-agent-browse";
export function allowBrowsing(): void {
  try { sessionStorage.setItem(AGENT_BROWSE_KEY, "1"); } catch { /* private mode: the redirect may happen, nothing worse */ }
}
