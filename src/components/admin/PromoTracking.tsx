import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, ListChecks, Megaphone, RefreshCw, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { Field, inputCls, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid } from "@/components/admin/ui";
import { conversionRate, loadPromoTracking, loadPromoVisitor, type PromoEventKind, type PromoTrackingGroup, type PromoTrackingReport, type PromoTrackingVisitor, type PromoVisitorDetail } from "@/lib/promotionAnalytics";
import { formatGHS } from "@/lib/format";

/* Everything a promo-link visitor does, from the ad click to the money.
   Dates are Ghana days. Figures count what happened inside the chosen day(s). */

type Period = "all" | "today" | "yesterday" | "day" | "range";
type Dimension = "platforms" | "campaigns" | "countries" | "devices" | "days" | "bundles";

const ghanaDate = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
const when = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short" });

const PLATFORM: Record<string, string> = { meta: "Meta (Facebook / Instagram)", tiktok: "TikTok", google: "Google", whatsapp: "WhatsApp", snapchat: "Snapchat", x: "X (Twitter)", telegram: "Telegram", direct: "Direct / unknown", other: "Other site" };
const platformName = (p: string | null | undefined) => PLATFORM[p ?? ""] ?? (p || "Unknown");
let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string | null | undefined) {
  if (!code || code === "Unknown") return "Unknown";
  try { regionNames ??= new Intl.DisplayNames(["en"], { type: "region" }); return regionNames.of(code) ?? code; } catch { return code; }
}
const MTN: Record<string, string> = { approved: "Approved for instant delivery", not_approved: "Not approved yet", unapproved: "Waiting on MTN", invalid: "Invalid number", not_mtn: "Not an MTN number" };
const text = (v: unknown) => (v == null || v === "" ? "" : String(v));
const money = (v: unknown) => (Number.isFinite(Number(v)) && v != null && v !== "" ? formatGHS(Number(v)) : "");

/** One plain sentence per recorded step. */
function describe(kind: PromoEventKind, d: Record<string, unknown>, orderRef: string | null, phone: string | null): string {
  const ref = orderRef ? ` · order ${orderRef}` : "";
  switch (kind) {
    case "landing": return `Arrived from ${platformName(text(d.platform))}${d.click_id ? " (tagged ad click)" : ""}${d.referrer ? ` via ${text(d.referrer)}` : ""}`;
    case "page_view": return `Opened ${text(d.path) || "a page"}`;
    case "flow_opened": return "Opened the buy screen";
    case "network_selected": return `Chose ${text(d.network) || "a network"}`;
    case "bundle_selected": return `Picked ${text(d.bundle) || "a bundle"}${money(d.price) ? ` at ${money(d.price)}` : ""}`;
    case "mtn_check": return `MTN verification: ${MTN[text(d.status)] ?? text(d.status)}`;
    case "checkout_clicked": return `Entered the number${phone ? ` ${phone}` : ""} and tapped continue${d.different_network_prefix ? " (number looks like another network)" : ""}`;
    case "promo_applied": return `Promo price applied${money(d.price) ? `: ${money(d.price)}` : ""}${ref}`;
    case "promo_declined": return "Promo price refused: already used on this phone, number or account";
    case "order_created": return `Order created${money(d.amount) ? ` for ${money(d.amount)}` : ""}${ref}`;
    case "review_shown": return `Reached the pay screen${money(d.amount) ? ` (${money(d.amount)})` : ""}${ref}`;
    case "pay_tapped": return `Tapped pay${d.guest ? " as a guest" : ""}${d.email_given === false ? ", no email given" : ""}`;
    case "payment_started": return `Sent to payment${d.method === "wallet" ? " from wallet" : ""}${money(d.amount) ? ` (${money(d.amount)})` : ""}${ref}`;
    case "unpaid_order_shown": return `Shown an unpaid order to finish or cancel${ref}`;
    case "order_cancelled": return `Cancelled an order${ref}`;
    case "signup_started": return "Started creating an account";
    case "signed_in": return "Signed in to an account";
    case "topup_opened": return "Opened wallet top-up";
    case "topup_started": return `Started a wallet top-up${money(d.amount) ? ` of ${money(d.amount)}` : ""}`;
    case "topup_payment_started": return `Sent to payment for a top-up${money(d.amount) ? ` of ${money(d.amount)}` : ""}`;
    default: return kind;
  }
}

export default function PromoTracking() {
  const [period, setPeriod] = useState<Period>("today");
  const [day, setDay] = useState(ghanaDate());
  const [from, setFrom] = useState(ghanaDate(6)); const [to, setTo] = useState(ghanaDate());
  const [report, setReport] = useState<PromoTrackingReport | null>(null);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [dimension, setDimension] = useState<Dimension>("platforms");
  const [openVisitor, setOpenVisitor] = useState<PromoTrackingVisitor | null>(null);

  const range = useMemo<[string | null, string | null]>(() => period === "all" ? [null, null] : period === "today" ? [ghanaDate(), ghanaDate()] : period === "yesterday" ? [ghanaDate(1), ghanaDate(1)] : period === "day" ? [day, day] : [from, to], [period, day, from, to]);
  const load = useCallback(async () => {
    if (range[0] && range[1] && range[0] > range[1]) { setFailed(true); return; }
    setBusy(true); setFailed(false);
    const result = await loadPromoTracking(range[0], range[1]);
    setReport(result.data); setFailed(Boolean(result.error) || !result.data); setBusy(false);
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const t = report?.totals;
  const pct = (n: number, d: number) => `${conversionRate(n, d).toFixed(1)}%`;
  const funnel = t ? [
    { label: "Landed from the link", n: Number(t.landed) },
    { label: "Opened the buy screen", n: Number(t.opened_buy) },
    { label: "Picked a bundle", n: Number(t.picked) },
    { label: "Entered a number", n: Number(t.entered_number) },
    { label: "Reached the pay screen", n: Number(t.reached_pay) },
    { label: "Started payment", n: Number(t.started_payment) },
    { label: "Paid", n: Number(t.buyers) },
    { label: "Got their data", n: Number(t.got_delivery) },
  ] : [];
  const top = Math.max(1, ...funnel.map((f) => f.n));
  const periodText = period === "all" ? "all time" : range[0] === range[1] && range[0] ? dayLabel(`${range[0]}T12:00:00Z`) : `${range[0]} to ${range[1]}`;

  return <section className="space-y-4">
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><Segmented<Period> value={period} onChange={setPeriod} options={[{ value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "day", label: "Pick a day" }, { value: "range", label: "Date range" }, { value: "all", label: "All time" }]} /></div>
        <Button size="icon" variant="quiet" aria-label="Refresh tracking" title="Refresh" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></Button>
      </div>
      {period === "day" && <Field label="Day · Ghana time"><input className={inputCls} type="date" value={day} max={ghanaDate()} onChange={(e) => e.target.value && setDay(e.target.value)} /></Field>}
      {period === "range" && <div className="grid grid-cols-2 gap-2.5"><Field label="From · Ghana time"><input className={inputCls} type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field><Field label="To · Ghana time"><input className={inputCls} type="date" value={to} min={from} max={ghanaDate()} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field></div>}
    </div>

    {failed ? <p role="alert" className="text-sm text-danger">Couldn’t load the tracking. Check the dates and refresh.</p> : !t || !report ? <p className="text-sm text-muted-foreground">Loading tracking…</p> : <>
      <StatGrid cols={4}>
        <Stat label="Visitors from the link" value={t.landed} note={`${t.sessions} visits · ${periodText}`} icon={Users} loading={busy} />
        <Stat label="Tried to buy" value={t.entered_number} note={`${pct(t.entered_number, t.landed)} of visitors`} loading={busy} />
        <Stat label="Paying customers" value={t.buyers} note={`${pct(t.buyers, t.landed)} of visitors · ${t.existing_buyers} already customers`} tone="good" loading={busy} />
        <Stat label="Paid orders" value={t.orders_paid} note={`${t.delivered} delivered · ${t.refunded} refunded`} loading={busy} />
        <Stat label="Sales" value={formatGHS(Number(t.sales))} note={`${t.promo_orders} at promo price · ${formatGHS(Number(t.discount))} discount given`} loading={busy} />
        <Stat label="Profit on those sales" value={formatGHS(Number(t.profit))} note="Sales minus bundle cost, before payment fees" tone={Number(t.profit) > 0 ? "good" : "default"} loading={busy} />
        <Stat label="Wallet top-ups" value={formatGHS(Number(t.topup_amount))} note={`${t.topups_paid} paid by ${t.topup_payers} people · ${t.topup_started} started`} icon={Wallet} loading={busy} />
        <Stat label="New accounts" value={t.accounts} note={`${t.signup_started} started signing up · ${t.repeat_buyers} bought more than once`} loading={busy} />
      </StatGrid>

      <Panel title="Where people stop" icon={ListChecks} note="Each bar is the number of visitors who reached that step">
        <ol className="space-y-1.5">{funnel.map((f, i) => {
          const prev = i > 0 ? funnel[i - 1].n : f.n;
          const lost = Math.max(0, prev - f.n);
          return <li key={f.label}>
            <div className="flex items-baseline justify-between gap-2 text-[12px]"><span className="text-foreground">{f.label}</span><span className="tabular-nums text-muted-foreground"><b className="font-semibold text-foreground">{f.n}</b> · {pct(f.n, funnel[0].n)}{i > 0 && lost > 0 ? ` · ${lost} left here` : ""}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((f.n / top) * 100)}%` }} /></div>
          </li>;
        })}</ol>
      </Panel>

      <Panel title="MTN verification" icon={ShieldCheck} note="What the check showed when they typed an MTN number">
        <StatGrid cols={4}>
          <Stat label="Numbers checked" value={t.mtn_checked} />
          <Stat label="Approved" value={t.mtn_approved} tone="good" />
          <Stat label="Not approved yet" value={t.mtn_not_approved} tone={Number(t.mtn_not_approved) > 0 ? "warn" : "default"} />
          <Stat label="Waiting on MTN" value={t.mtn_waiting} />
        </StatGrid>
      </Panel>

      <Panel title="Break it down" icon={Megaphone}>
        <Segmented<Dimension> value={dimension} onChange={setDimension} options={[{ value: "platforms", label: "Platform" }, { value: "campaigns", label: "Campaign" }, { value: "countries", label: "Country" }, { value: "devices", label: "Device" }, { value: "days", label: "Day" }, { value: "bundles", label: "Bundle" }]} />
        {dimension === "bundles" ? <Table head={["Bundle", "Picked", "Paid orders", "Sales"]} rows={report.bundles.map((b) => [b.label, b.picked, b.paid_orders, formatGHS(Number(b.sales))])} empty="No bundle activity in this period." />
          : dimension === "days" ? <GroupTable first="Day" rows={report.days.map((d) => ({ ...d, label: dayLabel(`${d.day}T12:00:00Z`) }))} />
          : <GroupTable first={dimension === "platforms" ? "Platform" : dimension === "campaigns" ? "Campaign" : dimension === "countries" ? "Country" : "Device"} rows={report[dimension].map((g) => ({ ...g, label: dimension === "platforms" ? platformName(g.label) : dimension === "countries" ? countryName(g.label) : dimension === "campaigns" && (g.label === "unlabelled" || !g.label) ? "No campaign name" : (g.label ?? "Unknown") }))} />}
      </Panel>

      <Panel title={`People · ${report.visitor_count}`} icon={Globe} note="Newest activity first. Tap one for the full story">
        <Rows empty="Nobody came through the link in this period.">{report.visitors.map((v) => <Row key={v.id} onClick={() => setOpenVisitor(v)}
          primary={<>{platformName(v.platform)} · {countryName(v.country)}{v.city ? `, ${v.city}` : ""}</>}
          secondary={`${when(v.last_at)} · ${v.furthest}${v.device !== "Unknown" ? ` · ${v.device}${v.browser ? `, ${v.browser}` : ""}` : ""}`}
          right={Number(v.sales) > 0 ? formatGHS(Number(v.sales)) : Number(v.topup_amount) > 0 ? formatGHS(Number(v.topup_amount)) : undefined}
          rightNote={Number(v.orders_paid) > 0 ? `${v.orders_paid} order${Number(v.orders_paid) === 1 ? "" : "s"}` : Number(v.topup_amount) > 0 ? "top-up" : v.has_account ? "has account" : undefined}
          tone={Number(v.sales) > 0 ? "good" : "default"} />)}</Rows>
        {report.visitor_count > report.visitors.length && <p className="pt-2 text-[11px] text-faint-foreground">Showing the latest {report.visitors.length} of {report.visitor_count}. Pick a shorter period to see the rest.</p>}
      </Panel>

      <div className="space-y-1.5 text-[11.5px] leading-5 text-muted-foreground">
        <p>Only people who arrived on a link containing <span className="text-foreground">promo=1</span> are counted. Figures show what happened inside the chosen day(s), Ghana time.</p>
        <p>Orders, payments, deliveries and top-ups come from the real records, including guest orders and any later orders by the same account or number for 30 days. Steps before payment are reported by the visitor’s browser.</p>
        <p>Meta and TikTok are recognised from the tag they add to clicks and from their in-app browsers. A person who clicks on one phone and buys on another cannot be joined up.</p>
        <p>{report.detail_since ? `Step-by-step detail began ${when(report.detail_since)}. Visitors before that show only that they landed.` : "Step-by-step detail starts with the next visitor. Earlier visitors show only that they landed."}</p>
      </div>
    </>}
    <VisitorSheet visitor={openVisitor} onClose={() => setOpenVisitor(null)} />
  </section>;
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="py-5 text-center text-[12px] text-faint-foreground">{empty}</p>;
  return <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr>{head.map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border">{r.map((c, j) => <td key={j} className={j === 0 ? "max-w-56 break-words p-2 text-foreground" : "p-2 tabular-nums"}>{c}</td>)}</tr>)}</tbody></table></div>;
}
function GroupTable({ first, rows }: { first: string; rows: (Omit<PromoTrackingGroup, "label"> & { label: string })[] }) {
  return <Table head={[first, "Visitors", "Tried to buy", "Started payment", "Buyers", "Buyer rate", "Orders", "Sales", "Profit", "Top-ups"]} empty="Nothing in this period."
    rows={rows.map((g) => [g.label, g.visitors, g.entered_number, g.started_payment, g.buyers, `${conversionRate(Number(g.buyers), Number(g.visitors)).toFixed(1)}%`, g.orders_paid, formatGHS(Number(g.sales)), formatGHS(Number(g.profit)), formatGHS(Number(g.topup_amount))])} />;
}

/** One visitor’s full story: arrival, every step, and the real orders and top-ups. */
function VisitorSheet({ visitor, onClose }: { visitor: PromoTrackingVisitor | null; onClose: () => void }) {
  const [detail, setDetail] = useState<PromoVisitorDetail | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    setDetail(null); setFailed(false);
    if (!visitor) return;
    let live = true;
    void loadPromoVisitor(visitor.id).then((r) => { if (!live) return; setDetail(r.data); setFailed(Boolean(r.error) || !r.data); });
    return () => { live = false; };
  }, [visitor]);
  const v = detail?.visit;
  // Steps and real records on one line of time.
  const timeline = useMemo(() => {
    if (!detail) return [];
    const items: { at: string; text: string; tone?: "good" | "warn" | "bad" }[] = detail.events.map((e) => ({ at: e.at, text: describe(e.kind, e.data ?? {}, e.order_reference, e.phone) }));
    for (const o of detail.orders) {
      const name = `${o.bundle ?? "Bundle"} to ${o.phone}`;
      if (o.paid_at) items.push({ at: o.paid_at, text: `PAID ${formatGHS(Number(o.amount))} for ${name}${o.provider ? ` by ${o.provider}` : ""}${o.promo_price ? " at the promo price" : ""} · order ${o.reference}`, tone: "good" });
      if (o.delivered_at) items.push({ at: o.delivered_at, text: `Data delivered · order ${o.reference}`, tone: "good" });
      if (o.payment === "refunded") items.push({ at: o.paid_at ?? o.created_at, text: `Later refunded · order ${o.reference}`, tone: "bad" });
    }
    for (const d of detail.topups) if (d.done_at) items.push({ at: d.done_at, text: `WALLET TOP-UP PAID ${formatGHS(Number(d.amount))}`, tone: "good" });
    if (v?.account_created_at) items.push({ at: String(v.account_created_at), text: "Account created", tone: "good" });
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [detail, v]);
  const unpaid = detail?.orders.filter((o) => !o.paid_at) ?? [];
  let lastDay = "";

  return <Modal open={visitor !== null} onClose={onClose} label="Visitor story">
    <div className="w-[min(94vw,520px)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold text-foreground">{visitor ? `${platformName(visitor.platform)} visitor` : ""}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{visitor ? `First came ${when(visitor.created_at)} Ghana time · ${visitor.furthest}` : ""}</p></div>
        <Button size="icon" variant="quiet" aria-label="Close" onClick={onClose}><X size={16} /></Button>
      </div>
      {failed ? <p role="alert" className="mt-4 text-sm text-danger">Couldn’t load this visitor.</p> : !detail || !v ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : <>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[12px]">
          {([["Came from", `${platformName(text(v.platform) || visitor?.platform)}${v.click_id ? " · tagged ad click" : ""}`], ["Campaign", text(v.campaign) === "unlabelled" ? "No campaign name" : text(v.campaign)], ["Referring site", text(v.referrer) || text(v.source)],
            ["Location", [text(v.city), text(v.region), countryName(text(v.country))].filter(Boolean).join(", ")], ["Device", [text(v.device), text(v.os), text(v.browser)].filter(Boolean).join(" · ") || "Unknown"], ["Visits", text(v.sessions)],
            ["Account", v.has_account ? (text(v.account_email) || "Signed in") : "Guest"], ["Landing page", text(v.landing_path) || "/shop"]] as const).map(([k, val]) => <div key={k} className="min-w-0"><dt className="text-faint-foreground">{k}</dt><dd className="break-words text-foreground">{val || "Unknown"}</dd></div>)}
        </dl>
        {(detail.orders.length > 0 || detail.topups.length > 0) && <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill tone="good">{detail.orders.filter((o) => o.paid_at).length} paid order{detail.orders.filter((o) => o.paid_at).length === 1 ? "" : "s"} · {formatGHS(detail.orders.filter((o) => o.payment === "succeeded").reduce((a, o) => a + Number(o.amount), 0))}</Pill>
          {unpaid.length > 0 && <Pill tone="warn">{unpaid.length} started, not paid</Pill>}
          {detail.topups.some((d) => d.done_at) && <Pill tone="good">Top-ups {formatGHS(detail.topups.filter((d) => d.done_at).reduce((a, d) => a + Number(d.amount), 0))}</Pill>}
        </div>}
        <h3 className="mt-4 text-[12.5px] font-semibold text-foreground">What they did</h3>
        {timeline.length === 0 ? <p className="mt-1.5 text-[12px] text-muted-foreground">Only the landing was recorded. This visitor came before step-by-step tracking began, or left straight away.</p>
          : <ol className="mt-1.5 max-h-[46vh] space-y-1 overflow-y-auto pr-1">{timeline.map((item, i) => {
            const d = dayLabel(item.at); const showDay = d !== lastDay; lastDay = d;
            return <li key={i}>{showDay && <p className="pb-0.5 pt-1.5 text-[10.5px] font-medium text-faint-foreground">{d}</p>}
              <div className="flex gap-2.5 text-[12px] leading-5"><span className="w-[58px] shrink-0 tabular-nums text-faint-foreground">{clock(item.at)}</span><span className={item.tone === "good" ? "font-medium text-success" : item.tone === "bad" ? "text-danger" : "text-foreground"}>{item.text}</span></div></li>;
          })}</ol>}
      </>}
    </div>
  </Modal>;
}
