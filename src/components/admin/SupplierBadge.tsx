import { useEffect, useState } from "react";
import { adminDatabase } from "@/lib/admin-data";

/* One letter per supplier, shown on every order the admin can see, so you know at a glance
   which supplier an order is with: D DataBundlesHub, E EmmaDataKing, I InstantDataGH,
   M DataMartGH. An order the fallback moved shows where it started too: "E→D". Admin only. */
const LETTER: Record<string, { letter: string; cls: string }> = {
  databundleshub: { letter: "D", cls: "border-sky-400/35 bg-sky-400/[0.12] text-sky-300" },
  emmadataking: { letter: "E", cls: "border-emerald-400/35 bg-emerald-400/[0.12] text-emerald-300" },
  instantdatagh: { letter: "I", cls: "border-violet-400/35 bg-violet-400/[0.12] text-violet-300" },
  datamartgh: { letter: "M", cls: "border-amber/35 bg-amber/[0.12] text-amber" },
};
const UNKNOWN = { letter: "?", cls: "border-white/15 bg-white/[0.06] text-muted-foreground" };

export interface SupplierRef { code: string; name: string }
export const supplierLetter = (s: SupplierRef | null | undefined) => (s ? (LETTER[s.code] ?? { ...UNKNOWN, letter: s.name.charAt(0).toUpperCase() }) : null);

export default function SupplierBadge({ supplier, from, className = "" }: { supplier: SupplierRef | null | undefined; from?: (SupplierRef & { why?: string | null; lowBalance?: boolean }) | null; className?: string }) {
  const now = supplierLetter(supplier);
  if (!now) return null;
  const was = from && from.code !== supplier?.code ? supplierLetter(from) : null;
  const reason = from?.why ? ` — ${from.lowBalance ? "low balance at " + from.name : from.why}` : "";
  const title = was ? `Started at ${from!.name}, now with ${supplier!.name} (fallback${reason})` : `With ${supplier!.name}`;
  return (
    <span title={title} aria-label={title} className={`inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full border px-1.5 font-mono text-[10.5px] font-bold leading-none ${now.cls} ${className}`}>
      {was && <><span className="opacity-60">{was.letter}</span><span className="opacity-60">→</span></>}{now.letter}{was && from?.lowBalance && <span className="ml-0.5 text-amber" title={`${from.name} had no float`}>₵</span>}
    </span>
  );
}

/** Orders the fallback moved: order id → the supplier they started at. The fallback event's
 *  `from` is a supplier code or name depending on where it was written, so both are matched. */
export type FallbackOrigin = SupplierRef & { why: string | null; lowBalance: boolean };
export function useFallbackOrigins(tick?: unknown) {
  const [origins, setOrigins] = useState<Record<string, FallbackOrigin>>({});
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adminDatabase() as unknown as { from: (t: string) => any };
    void Promise.all([
      db.from("suppliers").select("code, name"),
      db.from("order_events").select("order_id, metadata").eq("event_type", "supplier.fallback").order("created_at", { ascending: false }).limit(3000),
    ]).then(([s, e]: [{ data: SupplierRef[] | null }, { data: { order_id: string; metadata: { from?: string; why?: string } | null }[] | null }]) => {
      if (!alive) return;
      const suppliers = s.data ?? [];
      const byKey = new Map<string, SupplierRef>();
      for (const sup of suppliers) { byKey.set(sup.code.toLowerCase(), sup); byKey.set(sup.name.toLowerCase(), sup); }
      const map: Record<string, FallbackOrigin> = {};
      for (const ev of e.data ?? []) {
        const from = (ev.metadata?.from ?? "").toLowerCase();
        const sup = byKey.get(from);
        const why = ev.metadata?.why ?? null;
        if (sup && !map[ev.order_id]) map[ev.order_id] = { ...sup, why, lowBalance: /balance|insufficient|no float|low float/i.test(why ?? "") }; // newest event wins
      }
      setOrigins(map);
    });
    return () => { alive = false; };
  }, [tick]);
  return origins;
}
