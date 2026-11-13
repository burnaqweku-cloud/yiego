import { supabase } from "@/integrations/supabase/client";
import { promoTouch } from "@/lib/promotionAnalytics";

/* Proof for a stranger who arrived from an advert: the orders that have just gone out. Every row comes from the real
   records (phase1.public_proof); nothing here is typed in by hand, and a number is shown with its middle hidden, the
   way a MoMo message shows it.
   No totals on purpose (owner, 13 Nov 2026): a young shop's count reads as "new, small" to someone used to bigger
   names, and we do not show a figure that is not true. Orders leaving right now say "busy and real" without a total. */

export interface ProofDelivery { network: string; gb: number; phone: string; minutes: number }

/** Older than this and a delivery no longer says "right now". */
export const FRESH_MINUTES = 60;
/** One delivery on its own looks like a quiet shop: show the board from two. */
export const MIN_ROWS = 2;
export const MAX_ROWS = 8;

interface RpcClient { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> }
const db = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");

/** Whoever came through an advert's link: on arrival (the link says so) and on every later visit (the browser remembers). */
export function cameFromAdvert(search: string): boolean {
  try { if (new URLSearchParams(search).has("promo")) return true; } catch { /* odd address */ }
  return promoTouch() !== null;
}

/** Only rows we can stand behind, newest first; too few and there is no board at all. */
export function readProof(raw: unknown): ProofDelivery[] | null {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { recent?: unknown }).recent) ? (raw as { recent: unknown[] }).recent : [];
  const rows = list.flatMap((row): ProofDelivery[] => {
    if (!row || typeof row !== "object") return [];
    const d = row as Record<string, unknown>;
    const network = typeof d.network === "string" ? d.network.trim() : ""; const phone = typeof d.phone === "string" ? d.phone.trim() : "";
    const gb = Number(d.gb); const minutes = Number(d.minutes);
    return network && phone && Number.isFinite(gb) && gb > 0 && Number.isFinite(minutes) && minutes >= 0 && minutes <= FRESH_MINUTES ? [{ network, gb, phone, minutes: Math.round(minutes) }] : [];
  }).sort((a, b) => a.minutes - b.minutes).slice(0, MAX_ROWS);
  return rows.length >= MIN_ROWS ? rows : null;
}

export async function loadProof(): Promise<ProofDelivery[] | null> {
  try { const { data, error } = await db().rpc<unknown>("public_proof"); return error ? null : readProof(data); } catch { return null; }
}

/** The rows on show this turn: a window that walks down the list and starts again, so the board keeps moving. */
export function boardRows(rows: ProofDelivery[], turn: number, size = 3): ProofDelivery[] {
  if (rows.length <= size) return rows;
  const start = ((turn % rows.length) + rows.length) % rows.length;
  return Array.from({ length: size }, (_, i) => rows[(start + i) % rows.length]);
}

export function agoLabel(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return "1 hr ago";
}

/** The short mark on a delivery row: people know their network by its colour before its name. */
export function networkMark(network: string): { text: string; tone: "mtn" | "telecel" | "at" | "other" } {
  const n = network.toLowerCase();
  if (n.includes("mtn")) return { text: "MTN", tone: "mtn" };
  if (n.includes("telecel") || n.includes("vodafone")) return { text: "TEL", tone: "telecel" };
  if (n.includes("airtel") || n.includes("tigo") || n === "at") return { text: "AT", tone: "at" };
  return { text: network.slice(0, 3).toUpperCase(), tone: "other" };
}
