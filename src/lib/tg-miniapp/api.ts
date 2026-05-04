// Mini App API client.
// Handles initData → session JWT exchange, JWT caching, and
// auto-refresh on 401. All Mini App backend calls go through here.

import { getTg } from "./sdk";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const FUNCTIONS_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface SessionState {
  token: string;
  exp: number; // epoch seconds
  chat_id: number;
  user_id: string | null;
  user: { first_name: string | null; last_name: string | null; username: string | null };
  start_param: string | null;
}

let session: SessionState | null = null;
let inflight: Promise<SessionState> | null = null;

function getInitData(): string {
  const tg = getTg();
  const data = tg?.initData ?? "";
  if (!data) throw new Error("Telegram initData unavailable");
  return data;
}

async function fetchSession(): Promise<SessionState> {
  const initData = getInitData();
  const res = await fetch(`${FUNCTIONS_BASE}/tg-miniapp-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ initData }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Session error (${res.status})`);
  }
  const exp = Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 300) - 15;
  return {
    token: data.token,
    exp,
    chat_id: data.chat_id,
    user_id: data.user_id ?? null,
    user: data.user ?? { first_name: null, last_name: null, username: null },
    start_param: data.start_param ?? null,
  };
}

export async function getSession(force = false): Promise<SessionState> {
  if (!force && session && session.exp > Math.floor(Date.now() / 1000)) return session;
  if (inflight) return inflight;
  inflight = fetchSession()
    .then((s) => {
      session = s;
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export interface MiniAppFetchOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export async function miniAppFetch<T = any>(fnName: string, opts: MiniAppFetchOpts = {}): Promise<T> {
  const { method = "GET", body, query } = opts;
  const qs = query
    ? "?" +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = `${FUNCTIONS_BASE}/${fnName}${qs}`;
  const doCall = async (token: string) => {
    return fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };

  let s = await getSession();
  let res = await doCall(s.token);
  if (res.status === 401) {
    s = await getSession(true);
    res = await doCall(s.token);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data as T;
}

/** Direct verifier call used by the diagnostic page (no JWT needed). */
export async function verifyInitDataRaw(): Promise<any> {
  const initData = getInitData();
  const res = await fetch(`${FUNCTIONS_BASE}/tg-miniapp-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ initData }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Verify failed (${res.status})`);
  return data;
}

export function getCachedSession(): SessionState | null {
  return session;
}
