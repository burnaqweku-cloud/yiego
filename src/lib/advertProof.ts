import { supabase } from "@/integrations/supabase/client";
import { promoTouch } from "@/lib/promotionAnalytics";

/* Proof for a stranger who arrived from an advert: how many orders we have delivered and the last few that went out.
   Every figure comes from the real records (phase1.public_proof); nothing here is typed in by hand. A number is shown
   with its middle hidden, the way a receipt shows it. */

export interface ProofDelivery { network: string; gb: number; phone: string; minutes: number }
export interface Proof { delivered: number; today: number; week: number; since: string; recent: ProofDelivery[] }

interface RpcClient { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> }
const db = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");

/** Whoever came through an advert's link: on arrival (the link says so) and on every later visit (the browser remembers). */
export function cameFromAdvert(search: string): boolean {
  try { if (new URLSearchParams(search).has("promo")) return true; } catch { /* odd address */ }
  return promoTouch() !== null;
}

const count = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; };

/** Only a reading we can stand behind is shown: no count, no block. */
export function readProof(raw: unknown): Proof | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const delivered = count(r.delivered);
  if (delivered < 1) return null;
  const recent = (Array.isArray(r.recent) ? r.recent : []).flatMap((row): ProofDelivery[] => {
    if (!row || typeof row !== "object") return [];
    const d = row as Record<string, unknown>;
    const network = typeof d.network === "string" ? d.network.trim() : ""; const phone = typeof d.phone === "string" ? d.phone.trim() : "";
    const gb = Number(d.gb); const minutes = Number(d.minutes);
    return network && phone && Number.isFinite(gb) && gb > 0 && Number.isFinite(minutes) && minutes >= 0 ? [{ network, gb, phone, minutes: Math.round(minutes) }] : [];
  }).slice(0, 8);
  return { delivered, today: count(r.today), week: count(r.week), since: typeof r.since === "string" ? r.since : "", recent };
}

export async function loadProof(): Promise<Proof | null> {
  try { const { data, error } = await db().rpc<unknown>("public_proof"); return error ? null : readProof(data); } catch { return null; }
}

export const proofCount = (n: number) => n.toLocaleString("en-GH");

/** "since August", with the year once it is no longer this year. */
export function sinceLabel(since: string, now = new Date()): string {
  const d = new Date(since);
  if (!since || Number.isNaN(d.getTime())) return "";
  const month = d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return d.getUTCFullYear() === now.getUTCFullYear() ? `since ${month}` : `since ${month} ${d.getUTCFullYear()}`;
}

/** Today's count once the day has enough to mean something; before that, the week's. */
export function recentCount(p: Pick<Proof, "today" | "week">): { n: number; label: string; when: string } | null {
  if (p.today >= 20) return { n: p.today, label: "delivered", when: "Today" };
  if (p.week >= 20) return { n: p.week, label: "delivered", when: "This week" };
  return null;
}

export function agoLabel(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.round(minutes / 60);
  return `${h} hr${h === 1 ? "" : "s"} ago`;
}

/** The short mark on a delivery row: people know their network by its colour before its name. */
export function networkMark(network: string): { text: string; tone: "mtn" | "telecel" | "at" | "other" } {
  const n = network.toLowerCase();
  if (n.includes("mtn")) return { text: "MTN", tone: "mtn" };
  if (n.includes("telecel") || n.includes("vodafone")) return { text: "TEL", tone: "telecel" };
  if (n.includes("airtel") || n.includes("tigo") || n === "at") return { text: "AT", tone: "at" };
  return { text: network.slice(0, 3).toUpperCase(), tone: "other" };
}
