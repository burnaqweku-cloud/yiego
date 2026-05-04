/**
 * Global Activation Stats — shared deterministic counters
 *
 * Rules:
 * - All users see the SAME value at the same point in time.
 * - Values are derived from a shared date seed — no per-session randomness.
 * - Values NEVER decrease on refresh (monotonic, persisted in localStorage).
 * - Active agents base = 165 (as of now), grows 10–20 per day.
 * - Today's orders range: 4,500 – 7,800 per day, resets at midnight Ghana time.
 */

/** Deterministic pseudo-random [0,1) from integer seed */
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

/** Ghana date string (Africa/Accra = UTC+0, no DST) */
function getGhanaDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
}

/** Minutes since midnight in Ghana time */
function getGhanaMinutesSinceMidnight(): number {
  const str = new Date().toLocaleString('en-US', {
    timeZone: 'Africa/Accra',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts a date key string like "2026-02-18" into a stable integer seed.
 * Uses a simple positional hash that avoids leading-zero issues.
 */
function dateKeyToSeed(dateKey: string): number {
  return dateKey.split('-').reduce((acc, part, i) => acc + parseInt(part) * (i + 1) * 31, 0);
}

// ─── Today's Platform Orders ──────────────────────────────────────────────────

/**
 * Returns a monotonically increasing orders count for today.
 * Range progresses from ~300–600 at midnight to 4,500–7,800 by 23:59.
 * Identical for all users at the same minute. Persisted in localStorage.
 */
export function getGlobalDailyOrders(): number {
  const dateKey = getGhanaDateKey();
  const storageKey = `ds_global_orders_${dateKey}`;
  const seed = dateKeyToSeed(dateKey);

  // Daily start/end targets — seeded by date so consistent for everyone
  const startVal = 300 + Math.floor(seededRandom(seed * 3) * 301);       // 300–600
  const endVal = 4500 + Math.floor(seededRandom(seed * 7 + 2) * 3301);   // 4500–7800

  const minutes = getGhanaMinutesSinceMidnight();
  const totalMinutes = 1440;
  const rawProgress = minutes / totalMinutes;

  // Ease: slow ramp at midnight/late night, faster during day
  const easedProgress = (Math.sin((rawProgress - 0.5) * Math.PI) + 1) / 2;

  // Base value at this minute
  const base = startVal + Math.floor((endVal - startVal) * easedProgress);

  // Small upward-only jitter per 5-minute bucket (same for everyone in the same bucket)
  const bucket = Math.floor(minutes / 5);
  const jitter = Math.floor(seededRandom(seed * 13 + bucket) * 41); // 0–40

  const computed = base + jitter;

  // Monotonic: never drop below last stored value
  const lastStored = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const finalValue = Math.max(computed, lastStored);

  localStorage.setItem(storageKey, String(finalValue));
  return finalValue;
}

// ─── Active Agents ────────────────────────────────────────────────────────────

/** Known baseline date for agent count (reference point). */
const AGENT_BASE_DATE = '2026-02-18';
const AGENT_BASE_COUNT = 165;
const DAILY_GROWTH_MIN = 10;
const DAILY_GROWTH_MAX = 20;

/**
 * Returns a monotonically increasing active agent count.
 * Grows 10–20 per day since AGENT_BASE_DATE. Identical for all users.
 */
export function getGlobalActiveAgents(): number {
  const dateKey = getGhanaDateKey();
  const storageKey = `ds_global_agents_${dateKey}`;

  // Compute days since base date
  const baseMs = new Date(AGENT_BASE_DATE).getTime();
  const todayMs = new Date(dateKey).getTime();
  const daysDelta = Math.max(0, Math.floor((todayMs - baseMs) / 86400000));

  // Accumulate daily growth deterministically (seeded by day index)
  let agentCount = AGENT_BASE_COUNT;
  for (let d = 0; d < daysDelta; d++) {
    const daySeed = dateKeyToSeed(AGENT_BASE_DATE) + d * 17;
    agentCount += DAILY_GROWTH_MIN + Math.floor(seededRandom(daySeed) * (DAILY_GROWTH_MAX - DAILY_GROWTH_MIN + 1));
  }

  // Intra-day: add partial progress toward today's increment
  const todaySeed = dateKeyToSeed(dateKey);
  const todayGrowth = DAILY_GROWTH_MIN + Math.floor(seededRandom(todaySeed * 5) * (DAILY_GROWTH_MAX - DAILY_GROWTH_MIN + 1));
  const minutes = getGhanaMinutesSinceMidnight();
  const intraDay = Math.floor(todayGrowth * (minutes / 1440));
  const computed = agentCount + intraDay;

  // Monotonic
  const lastStored = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const finalValue = Math.max(computed, lastStored);

  localStorage.setItem(storageKey, String(finalValue));
  return finalValue;
}
