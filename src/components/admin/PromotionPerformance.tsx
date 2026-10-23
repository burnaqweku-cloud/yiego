import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls, Stat, StatGrid, Segmented } from "@/components/admin/ui";
import { conversionRate, loadPromotionReport, promotionAdLink, promotionReportCsv, type PromotionReport, type PromotionBreakdown } from "@/lib/promotionAnalytics";
import { formatGHS } from "@/lib/format";

function ghanaDate(daysAgo = 0) { return new Date(Date.now() - daysAgo * 86400000).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" }); }
export default function PromotionPerformance() {
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(ghanaDate(29)); const [to, setTo] = useState(ghanaDate());
  const [report, setReport] = useState<PromotionReport | null>(null); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [source, setSource] = useState("tiktok"); const [campaign, setCampaign] = useState("first-purchase");
  const link = useMemo(() => promotionAdLink(source, campaign), [source, campaign]);
  const load = async () => {
    if (!from || !to || from > to) { setFailed(true); return; }
    setBusy(true); setFailed(false);
    const result = await loadPromotionReport(from, to);
    setReport(result.data); setFailed(Boolean(result.error)); setBusy(false);
  };
  useEffect(() => { void load(); }, [from, to]);
  const totals = report?.totals;
  const percent = (n: number, d: number) => `${conversionRate(n, d).toFixed(2)}%`;
  const exportReport = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([promotionReportCsv(report)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `promotion-${from}-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-5 border-b border-border pb-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-foreground">Promotion performance</h2><div className="flex gap-2"><Button size="sm" variant="soft" disabled={!report || busy} onClick={exportReport}><Download size={14} />Export</Button><Button size="icon" variant="quiet" aria-label="Refresh performance" title="Refresh performance" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></Button></div></div>
    <div className="grid items-end gap-3 sm:grid-cols-[1fr_160px_160px]"><Segmented value={preset} onChange={v => { setPreset(v); if (v !== "custom") { setFrom(ghanaDate(Number(v)-1)); setTo(ghanaDate()); } }} options={[{value:"1",label:"Today"},{value:"7",label:"7 days"},{value:"30",label:"30 days"},{value:"custom",label:"Custom"}]} /><Field label="From · Ghana time"><input className={inputCls} type="date" value={from} max={to} onChange={e => { setPreset("custom"); setFrom(e.target.value); }} /></Field><Field label="To · Ghana time"><input className={inputCls} type="date" value={to} min={from} max={ghanaDate()} onChange={e => { setPreset("custom"); setTo(e.target.value); }} /></Field></div>
    {failed ? <p role="alert" className="text-sm text-danger">Couldn’t load performance. Check the dates and try refreshing.</p> : !totals ? <p className="text-sm text-muted-foreground">Loading performance…</p> : <>
      <StatGrid cols={4}><Stat label="Unique visitors" value={totals.visitors} note={`${totals.visits} sessions`} loading={busy} /><Stat label="Signup started" value={totals.signup_starts} note={`${percent(totals.signup_starts,totals.visitors)} of visitors`} loading={busy} /><Stat label="Accounts created" value={totals.accounts} note={`${totals.confirmed_accounts} email confirmed`} loading={busy} /><Stat label="Paying customers" value={totals.buyers} note={`${percent(totals.buyers,totals.visitors)} visitor conversion`} tone="good" loading={busy} /></StatGrid>
      <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Visitor → new account</p><p className="mt-1 text-xl font-semibold text-foreground">{percent(totals.accounts,totals.visitors)}</p></div><div><p className="text-xs text-muted-foreground">Signup started → account created</p><p className="mt-1 text-xl font-semibold text-foreground">{percent(totals.accounts,totals.signup_starts)}</p></div><div><p className="text-xs text-muted-foreground">Checkout → paid order</p><p className="mt-1 text-xl font-semibold text-foreground">{percent(totals.paid_orders,totals.checkouts)}</p></div></div>
      <StatGrid cols={4}><Stat label="Checkouts created" value={totals.checkouts} /><Stat label="Paid orders" value={totals.paid_orders} note={`${totals.delivered} delivered · ${totals.refunded} refunded`} /><Stat label="Net bundle sales" value={formatGHS(Number(totals.sales))} note="Excludes refunded orders and payment fees" /><Stat label="Discount given" value={formatGHS(Number(totals.discount))} note={`${totals.pending} awaiting payment · ${totals.cancelled} cancelled`} /></StatGrid>
      <div><h3 className="text-sm font-semibold text-foreground">Traffic sources & campaigns</h3><Breakdown rows={report.sources} /></div>
      <div><h3 className="text-sm font-semibold text-foreground">Daily results</h3><Breakdown rows={report.daily} /></div>
      <div><h3 className="text-sm font-semibold text-foreground">Bundle results</h3><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr>{["Bundle","Checkouts","Paid","Net sales"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead><tbody>{report.bundles.map(row => <tr key={row.label} className="border-b border-border"><td className="p-2 text-foreground">{row.label}</td><td className="p-2">{row.checkouts}</td><td className="p-2">{row.paid_orders}</td><td className="p-2">{formatGHS(Number(row.sales))}</td></tr>)}</tbody></table>{!report.bundles.length && <p className="py-4 text-xs text-muted-foreground">No attributed checkouts in this period.</p>}</div></div>
      <p className="text-xs leading-5 text-muted-foreground">Results follow visitors whose first promotion visit falls within the selected Ghana dates, with conversions up to the end date. Existing sign-ins are not new accounts. Payment and account counts come from real records. Visitors are browser-based estimates; blocked tracking and cleared browser storage affect totals. Order statuses and sessions reflect the latest state.</p>
      <p className="text-xs text-muted-foreground">{report.started_at ? `Tracking began ${new Date(report.started_at).toLocaleString("en-GB",{timeZone:"Africa/Accra"})} Ghana time.` : "Tracking starts with the first visit. Previous visits cannot be reconstructed."}</p>
    </>}
    <div className="space-y-3 border-t border-border pt-4"><h3 className="text-sm font-semibold text-foreground">Social ad link</h3><div className="grid gap-3 sm:grid-cols-2"><Field label="Source"><select className={inputCls} value={source} onChange={e => setSource(e.target.value)}>{["tiktok","facebook","instagram","whatsapp","youtube"].map(s => <option key={s} value={s}>{s === "tiktok" ? "TikTok" : s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></Field><Field label="Campaign name"><input className={inputCls} value={campaign} maxLength={120} onChange={e => setCampaign(e.target.value)} /></Field></div><div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs leading-6 text-muted-foreground">{link}</code><Button size="icon" variant="soft" aria-label="Copy social ad link" title="Copy social ad link" onClick={() => { void navigator.clipboard.writeText(link).then(() => toast.success("Ad link copied.")).catch(() => toast.error("Couldn’t copy the link.")); }}><Copy size={15} /></Button></div></div>
  </section>;
}
function Breakdown({ rows }: { rows: PromotionBreakdown[] }) {
  return <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr>{["Name","Visitors","Signup starts","New accounts","Buyers","Conversion","Checkouts","Paid","Net sales"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.label} className="border-b border-border"><td className="max-w-56 break-words p-2 text-foreground">{row.label}</td><td className="p-2">{row.visitors}</td><td className="p-2">{row.signup_starts}</td><td className="p-2">{row.accounts}</td><td className="p-2">{row.buyers}</td><td className="p-2 text-success">{conversionRate(row.buyers,row.visitors).toFixed(2)}%</td><td className="p-2">{row.checkouts}</td><td className="p-2">{row.paid_orders}</td><td className="p-2">{formatGHS(Number(row.sales))}</td></tr>)}</tbody></table>{!rows.length && <p className="py-4 text-xs text-muted-foreground">No tracked visitors in this period.</p>}</div>;
}