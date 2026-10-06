import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Lock, Store, Wallet, X } from "lucide-react";
import { agentsStatus, myAgentStatus, planQuote, previewRequested, rememberPreview, type PlanQuote } from "@/lib/agents";
import { loadPhase1Networks, loadPhase1Products } from "@/lib/phase1-api";

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
   - Appears on every public page after the delay set in Admin -> Agents -> Plan (popup_delay_seconds).
   - Never for anyone who is already an agent (paid or not) or has an application waiting.
   - Once per visit: it shows once, and closing it only hides it for the rest of that visit.
     A new visit (site opened again, or back after 30 minutes away) shows it again.
   - Every number is live: public vs agent price from data_products, plans from agent_plan_quote. */

const SHOWN_KEY = "yg-agent-popup-shown";
/** Away from the site this long counts as a new visit. */
const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;
const shownThisVisit = () => { try { return sessionStorage.getItem(SHOWN_KEY) === "1"; } catch { return false; } };
const markShown = (v: boolean) => { try { if (v) sessionStorage.setItem(SHOWN_KEY, "1"); else sessionStorage.removeItem(SHOWN_KEY); } catch { /* ignore */ } };

/** Bundles in the comparison, in this order. */
const SHOWCASE: { network: string; label: string; gb: number }[] = [
  { network: "mtn", label: "MTN 10GB", gb: 10 },
  { network: "mtn", label: "MTN 20GB", gb: 20 },
  { network: "airteltigo", label: "AirtelTigo 10GB", gb: 10 },
];
/** Sales a month used in the profit example. */
const EXAMPLE_SALES = 40;
/** Selling price used in the profit example (MTN 10GB). */
const EXAMPLE_SELL = 48;

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
  const [due, setDue] = useState(false);
  const [closed, setClosed] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [payoutMin, setPayoutMin] = useState(20);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;
    let hiddenAt = 0;
    rememberPreview();
    const arm = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (shownThisVisit()) return;
      const { launched, plan } = await agentsStatus();
      if (!mounted || !(launched || previewRequested())) return;
      const me = await myAgentStatus();
      if (me?.is_agent || me?.application?.status === "pending") return;
      const [r, q] = await Promise.all([loadRows(), planQuote()]);
      if (!mounted) return;
      setRows(r);
      setQuote(q);
      if (plan?.payout_minimum) setPayoutMin(Number(plan.payout_minimum));
      timer = setTimeout(() => { if (mounted && !shownThisVisit()) { markShown(true); setClosed(false); setDue(true); } }, Math.max(1, plan?.popup_delay_seconds ?? 5) * 1000);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= NEW_VISIT_AFTER_MS) { markShown(false); setDue(false); void arm(); }
      hiddenAt = 0;
    };
    void arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { mounted = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const open = due && !closed && rows !== null;
  const dismiss = useCallback(() => { setClosed(true); }, []);

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
  const lead = rows?.find((r) => r.label === "MTN 10GB") ?? null;
  const keep = lead ? EXAMPLE_SELL - lead.agent : 0;
  const monthly = Number(quote?.pay_now ?? quote?.monthly ?? 0);
  const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5" role="presentation">
      <div className="yg-agent-pop-scrim absolute inset-0 bg-black/60 backdrop-blur-[4px]" onClick={dismiss} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-pop-title"
        aria-describedby="agent-pop-desc"
        className="yg-agent-pop-panel relative flex max-h-[90dvh] w-full max-w-[360px] flex-col overflow-hidden rounded-[28px] bg-card text-foreground shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] ring-1 ring-border"
      >
        <button type="button" aria-label="Close" onClick={dismiss} className={`absolute right-3.5 top-3.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40 ${ring}`}>
          <X size={17} />
        </button>

        <div className="overflow-y-auto overscroll-contain">
          <div className="yg-agent-pop-hero relative px-5 pb-5 pt-6 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/90 text-[#0b7a52] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)]"><Store size={28} aria-hidden="true" /></span>
            <div className="mx-auto mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-[12px] text-white/90">
              <Lock size={11} aria-hidden="true" />
              <span className="truncate"><span className="font-semibold text-white">yourname</span>.datayego.com</span>
            </div>
          </div>

          <div className="px-5 pb-5 pt-4">
            <h2 id="agent-pop-title" className="text-center font-display text-[22px] font-semibold leading-tight tracking-[-0.02em]">Earn by selling data</h2>
            <p id="agent-pop-desc" className="mt-1 text-center text-[13.5px] text-muted-foreground">Your own store, agent prices, your profit.</p>

            {rows && rows.length > 0 && (
              <div className="mt-4 rounded-2xl border border-border bg-background/50 px-3.5 py-1.5">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">Agent prices today, in GH₵</caption>
                  <thead className="sr-only"><tr><th>Bundle</th><th>Public price</th><th>Agent price</th><th>You save</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label} className="border-t border-border/60 first:border-t-0">
                        <td className="py-2 font-medium">{r.label}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground"><s>{m2(r.pub)}</s></td>
                        <td className="py-2 pl-2.5 text-right font-semibold tabular-nums">{m2(r.agent)}</td>
                        <td className="py-2 pl-2.5 text-right"><span className="whitespace-nowrap rounded-full bg-primary/[0.12] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary-glow">-{m2(r.pub - r.agent)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {lead && keep > 0 && (
              <p className="mt-3 rounded-2xl bg-primary/[0.09] px-3.5 py-3 text-center text-[13px] leading-snug text-foreground">
                Sell {lead.label} at <b>{m2(EXAMPLE_SELL)}</b> and keep <b>{m2(keep)}</b>.<br />
                {EXAMPLE_SALES} sales a month is <b className="text-primary-glow">GH₵ {m2(keep * EXAMPLE_SALES)}</b> profit.
              </p>
            )}

            <ul className="mt-4 space-y-2.5 text-[13px]">
              <li className="flex items-center gap-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><Store size={14} aria-hidden="true" /></span>Your own store link, your own prices</li>
              <li className="flex items-center gap-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><Wallet size={14} aria-hidden="true" /></span>Profit added to your balance on every sale</li>
              <li className="flex items-center gap-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><Banknote size={14} aria-hidden="true" /></span>Withdraw to MoMo from GH₵ {m2(payoutMin)}</li>
            </ul>

            <Link to="/agents" data-autofocus onClick={() => setClosed(true)} className={`onyx-btn-primary mt-5 w-full ${ring}`}>Apply</Link>
            {monthly > 0 && <p className="mt-2 text-center text-[12px] text-muted-foreground">From GH₵ {m2(monthly)} a month{quote?.promo?.percent_off ? `, ${quote.promo.percent_off}% off now` : ""}</p>}
            <button type="button" onClick={dismiss} className={`mt-1 w-full rounded-xl py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground ${ring}`}>Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}
