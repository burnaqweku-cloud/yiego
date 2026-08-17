import { useEffect, useState } from "react";
import { Clock3, Truck, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ══════════════════════════════════════════════════════════════
   Delivery Progress — how fast bundles are landing right now.

   A status banner and timed rows. The figures come from the
   supplier's live tracker, refreshed server-side every five
   minutes; anything the admin types in Suppliers → Delivery speed
   replaces them word for word. With nothing measured and nothing
   typed, the panel renders nothing at all, because a made-up
   figure is worse than no figure.
   ══════════════════════════════════════════════════════════════ */

interface Row { label: string; value: string; detail: string | null; tone: "fast" | "queue" }
interface Panel { banner: { text: string; tone: "ok" | "slow" } | null; rows: Row[] }

/** `compact` shows the banner alone — for the buy sheet, where the full panel
 *  would crowd the pay button it sits above. */
export default function DeliveryProgress({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const [panel, setPanel] = useState<Panel | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.functions.invoke<Panel>("supplier-delivery-status", { method: "GET" });
      if (cancelled || error || !data) return;
      if (!data.banner && (!data.rows || data.rows.length === 0)) return;
      setPanel(data);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!panel) return null;

  if (compact) {
    if (!panel.banner) return null;
    return (
      <p className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-5 ${
        panel.banner.tone === "slow"
          ? "border-amber/25 bg-amber/[0.08] text-amber"
          : "border-success/25 bg-success/[0.08] text-success"
      } ${className}`}>
        {panel.banner.text}
      </p>
    );
  }

  return (
    <section className={`rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5 ${className}`} aria-label="Delivery progress">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Truck size={16} className="text-primary-glow" aria-hidden="true" />
        Delivery progress
      </h2>

      {panel.banner && (
        <p className={`mt-3 rounded-xl border px-3.5 py-3 text-[13px] leading-5 ${
          panel.banner.tone === "slow"
            ? "border-amber/25 bg-amber/[0.08] text-amber"
            : "border-success/25 bg-success/[0.08] text-success"
        }`}>
          {panel.banner.text}
        </p>
      )}

      {panel.rows.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {panel.rows.map((row) => {
            const Icon = row.tone === "fast" ? Zap : Clock3;
            return (
              <li key={`${row.label}-${row.value}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  <Icon size={14} className={row.tone === "fast" ? "text-success" : "text-primary-glow"} aria-hidden="true" />
                  {row.label} · {row.value}
                </p>
                {row.detail && <p className="mt-1 pl-6 text-[11.5px] leading-4 text-faint-foreground">{row.detail}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
