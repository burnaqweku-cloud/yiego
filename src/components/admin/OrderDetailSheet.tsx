import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import Modal from "@/components/ui/modal";
import CopyRef from "@/components/admin/CopyRef";
import { Button } from "@/components/ui/button";

/* Admin order details: a fixed header with the essentials, three tabs
   (Details / Actions / Timeline) so nothing needs a long scroll, and
   compact label-value rows grouped by topic. */

export interface DetailRow { label: string; value: ReactNode; tone?: "good" | "warn" | "bad" | "muted" }
export interface DetailGroup { title: string; rows: DetailRow[] }
export interface TimelineItem { id: string; title: string; at: string; message?: string | null }

type Tab = "details" | "actions" | "timeline";

const toneText = (t?: DetailRow["tone"]) => t === "good" ? "text-primary-glow" : t === "warn" ? "text-amber" : t === "bad" ? "text-danger" : t === "muted" ? "text-muted-foreground" : "text-foreground";

export default function OrderDetailSheet({ open, onClose, reference, subtitle, amount, chips, groups, actions, timeline }: {
  open: boolean; onClose: () => void; reference: string; subtitle: string; amount: string;
  chips: Array<{ label: string; tone: "good" | "warn" | "bad" | "muted" }>;
  groups: DetailGroup[]; actions: ReactNode; timeline: TimelineItem[];
}) {
  const [tab, setTab] = useState<Tab>("details");
  useEffect(() => { if (open) setTab("details"); }, [open, reference]);
  const chipClass = (t: string) => t === "good" ? "bg-primary/15 text-primary-glow" : t === "warn" ? "bg-amber/15 text-amber" : t === "bad" ? "bg-danger/12 text-danger" : "bg-muted text-muted-foreground";

  return (
    <Modal open={open} onClose={onClose} label={`${reference} details`}>
      <div className="flex max-h-[88vh] flex-col">
        <header className="shrink-0 border-b border-border px-5 pb-0 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold text-foreground"><CopyRef value={reference} className="text-inherit" /></h2>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <p className="pt-1 font-display text-lg font-semibold text-foreground">{amount}</p>
              <Button variant="quiet" size="icon" onClick={onClose} aria-label="Close details"><X /></Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((c) => <span key={c.label} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${chipClass(c.tone)}`}>{c.label}</span>)}</div>
          <nav className="mt-4 flex gap-1" role="tablist">
            {(["details", "actions", "timeline"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
                className={`relative px-3 pb-2.5 pt-1 text-[13px] font-semibold capitalize transition-colors ${tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t}{t === "timeline" && timeline.length > 0 ? <span className="ml-1 text-[11px] text-faint-foreground">{timeline.length}</span> : null}
                {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {tab === "details" && (
            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.title}>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">{g.title}</h3>
                  <dl className="divide-y divide-border rounded-2xl border border-border bg-card/60">
                    {g.rows.map((r) => (
                      <div key={r.label} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                        <dt className="shrink-0 text-[12.5px] text-muted-foreground">{r.label}</dt>
                        <dd className={`min-w-0 break-words text-right text-[13px] font-medium ${toneText(r.tone)}`}>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
          {tab === "actions" && <div className="space-y-4">{actions}</div>}
          {tab === "timeline" && (timeline.length === 0
            ? <p className="py-10 text-center text-sm text-muted-foreground">No status events recorded yet.</p>
            : <ol className="relative ml-1.5 border-l border-border">
                {timeline.map((e, i) => (
                  <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                    <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-primary" : "bg-border"}`} />
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] font-semibold text-foreground">{e.title}</p>
                      <p className="shrink-0 text-[11px] text-faint-foreground">{e.at}</p>
                    </div>
                    {e.message && <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{e.message}</p>}
                  </li>
                ))}
              </ol>)}
        </div>
      </div>
    </Modal>
  );
}

/* A titled card used inside the Actions tab. */
export function ActionCard({ title, note, tone, children }: { title: string; note?: string; tone?: "warn"; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border p-4 ${tone === "warn" ? "border-amber/30 bg-amber/[0.06]" : "border-border bg-card/60"}`}>
      <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
      {note && <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
