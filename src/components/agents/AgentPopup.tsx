import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Banknote, Lock, Store, Wallet, X } from "lucide-react";
import { agentsStatus, myAgentStatus, planQuote, previewRequested, rememberPreview, type PlanQuote } from "@/lib/agents";
import { loadPhase1Networks, loadPhase1Products } from "@/lib/phase1-api";
import { useFlows } from "@/store/flows";

/** Small strip for signed-in agents who still need to pay: shown wherever the popup is mounted. */
export function AgentNudge() {
  const [state, setState] = useState<"awaiting_payment" | "paused" | null>(null);
  useEffect(() => { void agentsStatus().then(async ({ launched }) => { if (!(launched || previewRequested())) return; const me = await myAgentStatus(); if (me?.is_agent && (me.agent_status === "awaiting_payment" || me.agent_status === "paused")) setState(me.agent_status); }); }, []);
  if (!state) return null;
  return (
    <div className="mk-wrap mt-3"><Link to="/agent" className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-[13px] text-foreground"><span><b>{state === "paused" ? "Your agent store is paused." : "Your agent application is approved."}</b> {state === "paused" ? "Pay this month's fee to reopen it." : "Pay the monthly fee to open your store."}</span><span className="shrink-0 font-semibold text-primary-glow">Pay now →</span></Link></div>
  );
}

/* "Become an agent" invitation on the public site.
   - Appears after the delay set in Admin -> Agents -> Plan (popup_delay_seconds).
   - Never on pages where someone is buying, paying, tracking or signing in,
     never while the buy sheet is open, never for agents with an active subscription.
   - Close or "Not now" hides it for 3 days.
   - Every number is live: public vs agent price from data_products, plans from agent_plan_quote. */

const DISMISS_KEY = "yg-agent-popup-dismissed";
const DISMISS_MS = 3 * 24 * 3600 * 1000;
const QUIET_PATHS = ["/agents", "/help", "/giveaway", "/g", "/track-order", "/payment", "/auth", "/reset-password", "/wallet", "/orders", "/account", "/shop", "/support", "/r"];
const isQuiet = (path: string) => QUIET_PATHS.some((q) => path === q || path.startsWith(`${q}/`));

/** Bundles in the comparison, in this order. */
const SHOWCASE: { network: string; label: string; gb: number }[] = [
  { network: "mtn", label: "MTN 10GB", gb: 10 },
  { network: "mtn", label: "MTN 20GB", gb: 20 },
  { network: "airteltigo", label: "AirtelTigo 10GB", gb: 10 },
];
/** Sales a month used in the profit example. */
const EXAMPLE_SALES = 40;

interface Row { label: string; pub: number; agent: number }
const m2 = (n: number) => n.toFixed(2);

async function loadRows(): Promise<Row[]> {
  const [{ data: products }, { data: networks }] = await Promise.all([loadPhase1Products(), loadPhase1Networks()]);
  const codeOf = new Map(networks.map((n) => [n.id, n.code]));
  const rows: Row[] = [];
  for (const s of SHOWCASE) {
    const p = products.find((x) => codeOf.get(x.network_id) === s.network && Number(x.capacity_gb) === s.gb && !x.is_paused);
    const pub = Number(p?.customer_price);
    const agent = Number(p?.agent_price);
    if (p && pub > 0 && agent > 0 && agent < pub) rows.push({ label: s.label, pub, agent });
  }
  return rows;
}

export default function AgentPopup() {
  const { pathname } = useLocation();
  const { busy } = useFlows();
  const [due, setDue] = useState(false);
  const [closed, setClosed] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [payoutMin, setPayoutMin] = useState(20);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;
    rememberPreview();
    void agentsStatus().then(async ({ launched, plan }) => {
      if (!mounted || !(launched || previewRequested())) return;
      if (Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_MS) return;
      const me = await myAgentStatus();
      if (me?.is_agent && me.agent_status === "active") return;
      const [r, q] = await Promise.all([loadRows(), planQuote()]);
      if (!mounted) return;
      setRows(r);
      setQuote(q);
      if (plan?.payout_minimum) setPayoutMin(Number(plan.payout_minimum));
      timer = setTimeout(() => { if (mounted) setDue(true); }, Math.max(1, plan?.popup_delay_seconds ?? 5) * 1000);
    });
    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, []);

  const open = due && !closed && !busy && !isQuiet(pathname) && rows !== null;
  const dismiss = useCallback(() => { setClosed(true); localStorage.setItem(DISMISS_KEY, String(Date.now())); }, []);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); dismiss(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); returnTo?.focus?.(); };
  }, [open, dismiss]);

  if (!open) return null;
  const lead = rows?.find((r) => r.label === "MTN 10GB") ?? rows?.[0];
  const plans = (quote?.plans ?? []).slice().sort((a, b) => a.months - b.months);
  const longest = plans.length ? Math.max(...plans.map((p) => p.months)) : 0;
  const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="yg-agent-pop-scrim absolute inset-0 bg-black/65 backdrop-blur-[3px]" onClick={dismiss} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-pop-title"
        aria-describedby="agent-pop-desc"
        className="yg-agent-pop-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-border bg-card text-foreground shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.6)] sm:max-w-[440px] sm:rounded-[28px] sm:shadow-[0_30px_80px_-24px_rgba(0,0,0,0.7)]"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-foreground/15 sm:hidden" aria-hidden="true" />
        <button type="button" aria-label="Close" onClick={dismiss} className={`absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground ${ring}`}>
          <X size={18} />
        </button>

        <div className="overflow-y-auto overscroll-contain px-6 pb-5 pt-4 sm:px-7 sm:pt-7">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/60 py-1.5 pl-2.5 pr-3.5 text-[13px] text-muted-foreground">
            <Lock size={13} className="shrink-0 text-primary-glow" aria-hidden="true" />
            <span className="truncate"><span className="font-semibold text-foreground">yourname</span>.datayego.com</span>
          </div>

          <h2 id="agent-pop-title" className="mt-4 pr-8 font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[28px]">Run your own data shop</h2>
          <p id="agent-pop-desc" className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Get your own store website, buy data at agent prices and keep the profit on every sale.</p>

          {rows && rows.length > 0 && (
            <section className="mt-5 rounded-2xl border border-border bg-background/50" aria-label="Agent prices today">
              <div className="flex items-baseline justify-between px-4 pb-1 pt-3.5 text-[12.5px] text-muted-foreground">
                <span className="font-semibold text-foreground">Agent prices today</span>
                <span>GH₵</span>
              </div>
              <table className="w-full text-[14px]">
                <thead className="sr-only"><tr><th>Bundle</th><th>Public price</th><th>Agent price</th><th>You save</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-t border-border/70 first:border-t-0">
                      <td className="py-2.5 pl-4 font-medium">{r.label}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground"><s>{m2(r.pub)}</s></td>
                      <td className="py-2.5 pl-3 text-right font-display text-[15px] font-semibold tabular-nums">{m2(r.agent)}</td>
                      <td className="py-2.5 pl-3 pr-4 text-right"><span className="whitespace-nowrap rounded-full bg-primary/[0.12] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-primary-glow">Save {m2(r.pub - r.agent)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lead && (
                <p className="border-t border-border/70 px-4 py-3 text-[13.5px] leading-snug text-muted-foreground">
                  Sell {lead.label} at <span className="font-semibold text-foreground">{m2(lead.pub)}</span> and keep <span className="font-semibold text-foreground">{m2(lead.pub - lead.agent)}</span>. {EXAMPLE_SALES} sales a month is <span className="font-semibold text-primary-glow">GH₵ {m2((lead.pub - lead.agent) * EXAMPLE_SALES)}</span> profit.
                </p>
              )}
            </section>
          )}

          <ul className="mt-5 space-y-3 text-[14.5px] leading-snug">
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-glow"><Store size={18} aria-hidden="true" /></span>
              <span><span className="font-semibold">Your own store website.</span> <span className="text-muted-foreground">Share one link, set your own prices.</span></span>
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-glow"><Wallet size={18} aria-hidden="true" /></span>
              <span><span className="font-semibold">No stock to buy.</span> <span className="text-muted-foreground">Customers pay online and the data is sent for you.</span></span>
            </li>
            <li className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-glow"><Banknote size={18} aria-hidden="true" /></span>
              <span><span className="font-semibold">Cash out to MoMo.</span> <span className="text-muted-foreground">Withdraw your profit from GH₵ {m2(payoutMin)}.</span></span>
            </li>
          </ul>

          {plans.length > 0 && (
            <div className="mt-5">
              <p className="text-[12.5px] font-semibold">Store plans</p>
              <div className={`mt-2 grid gap-2 ${plans.length >= 3 ? "grid-cols-3" : plans.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {plans.map((p) => (
                  <div key={p.months} className={`rounded-2xl border px-3 py-2.5 ${p.months === longest && plans.length > 1 ? "border-primary/45 bg-primary/[0.07]" : "border-border bg-background/50"}`}>
                    <p className="text-[12px] text-muted-foreground">{p.months === 1 ? "1 month" : `${p.months} months`}</p>
                    <p className="mt-0.5 font-display text-[17px] font-semibold leading-tight tabular-nums">{m2(Number(p.pay_now))}</p>
                    <p className={`mt-0.5 text-[11.5px] ${Number(p.saving_pct) > 0 ? "font-semibold text-primary-glow" : "text-muted-foreground"}`}>
                      {Number(p.saving_pct) > 0 ? `Save ${Math.round(Number(p.saving_pct))}%` : `${m2(Number(p.per_month))} a month`}
                    </p>
                  </div>
                ))}
              </div>
              {quote?.promo?.percent_off ? <p className="mt-2 text-[12.5px] font-semibold text-primary-glow">{quote.promo.percent_off}% off right now: {quote.promo.name}</p> : null}
            </div>
          )}

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <Link to="/agents" data-autofocus onClick={() => setClosed(true)} className={`onyx-btn-primary w-full sm:order-2 ${ring}`}>Apply in 2 minutes</Link>
            <Link to="/help/agents" onClick={() => setClosed(true)} className={`flex min-h-[48px] w-full items-center justify-center rounded-[14px] border border-border px-5 text-[14.5px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.04] sm:order-1 ${ring}`}>See how it works</Link>
          </div>
          <button type="button" onClick={dismiss} className={`mt-1.5 w-full rounded-xl py-2.5 text-[14px] text-muted-foreground transition-colors hover:text-foreground ${ring}`}>Not now</button>
        </div>
      </div>
    </div>
  );
}
