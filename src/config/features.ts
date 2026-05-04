/**
 * Feature flags for YieGo.
 *
 * Toggle user-facing surfaces without deleting the underlying code.
 * Backend logic, tables, RLS policies, and edge functions are preserved.
 */

/**
 * When false, the entire agent / reseller experience is hidden from normal users:
 *   - bottom nav, sidebar, footer, dashboard cards, promo banners
 *   - direct routes (/agent, /agent/*, /become-an-agent) redirect to /dashboard
 *
 * Admins still retain backend access (admin agent management routes are unaffected).
 * Set to `true` to re-enable the full agent program.
 */
export const AGENT_FEATURE_ENABLED = false;
