import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Switch from "@/components/admin/Switch";
import { loadPromotionAdmin, promotionBasePrice, savePromotion, type PromotionAdmin } from "@/lib/promotions";
import { formatGHS } from "@/lib/format";
import { useLocation } from "react-router-dom";
import PromotionAdLinks from "@/components/admin/PromotionAdLinks";
import PromotionPerformance from "@/components/admin/PromotionPerformance";

const titles: Record<string, string> = { overview: "Overview & conversions", pricing: "Bundle prices", settings: "Settings", sources: "Sources & campaigns", daily: "Daily results", bundles: "Bundle results", links: "Ad links" };
export default function AdminPromotions() {
  const section = useLocation().pathname.split("/")[3] ?? "overview";
  const editing = section === "pricing" || section === "settings";
  const [data, setData] = useState<PromotionAdmin | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [netFilter, setNetFilter] = useState("all");
  const load = async () => {
    const r = await loadPromotionAdmin(); setFailed(Boolean(r.error)); setData(r.data);
    setPrices(Object.fromEntries((r.data?.offers ?? []).map(o => [o.product_id, String(o.price)])));
  };
  useEffect(() => { if (editing) void load(); }, [editing]);
  const save = async () => {
    if (!data || busy) return;
    if (!data.title.trim()) return toast.error("Enter a promotion title.");
    if (data.active && !data.offers.some(o => o.enabled)) return toast.error("Enable at least one bundle before activating.");
    const offers = data.offers.map(o => ({ product_id: o.product_id, enabled: o.enabled, price: promotionBasePrice(prices[o.product_id]) }));
    if (offers.some(o => o.price === null)) return toast.error("Enter valid prices with no more than two decimal places.");
    setBusy(true);
    const r = await savePromotion(data.title, data.blurb, data.active, offers.map(o => ({ ...o, price: o.price ?? 0 })));
    setBusy(false);
    if (r.error) {
      const m = String((r.error as { message?: string }).message ?? "");
      const why = m.includes("admin_mfa_required") ? "Your admin verification has expired. Sign in again with your authenticator code."
        : m.includes("invalid_offer_price") ? "One of the prices is invalid, or that bundle is no longer on sale."
        : m.includes("enable_a_bundle") ? "Enable at least one bundle before activating."
        : m.includes("invalid_promotion") ? "Check the title and message length."
        : "Couldn’t save right now. Please try again.";
      return toast.error(why);
    }
    toast.success("Promotion saved."); void load();
  };
  if (!editing) return <div className="space-y-6">
    <AdminPageHeader title={`Promotions · ${titles[section] ?? titles.overview}`} description="First-purchase promotions" />
    {section === "links" ? <PromotionAdLinks /> : <PromotionPerformance view={section === "sources" || section === "daily" || section === "bundles" ? section : "overview"} />}
  </div>;
  return <div className="space-y-6">
    <AdminPageHeader title={`Promotions · ${titles[section]}`} description="First-purchase offers" action={<Button size="sm" disabled={!data || busy} onClick={() => void save()}><Save size={14} />{busy ? "Saving…" : "Save changes"}</Button>} />
    {!data ? failed ? <div><p className="text-sm text-muted-foreground">Couldn’t load promotion settings.</p><Button className="mt-3" variant="soft" onClick={() => void load()}>Try again</Button></div> : <Loader2 className="animate-spin text-primary-glow" aria-label="Loading promotion settings" /> : <>
      {section === "settings" && <section className="space-y-4 border-b border-border pb-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-semibold text-foreground">Promotion active</h2><p className="mt-1 text-xs text-muted-foreground">Changes take effect after saving. Existing orders keep their agreed price.</p></div><Switch label="Promotion active" on={data.active} onChange={active => setData({ ...data, active })} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Page title"><input className={inputCls} maxLength={100} value={data.title} onChange={e => setData({ ...data, title: e.target.value })} /></Field><Field label="Message"><input className={inputCls} maxLength={240} value={data.blurb} onChange={e => setData({ ...data, blurb: e.target.value })} /></Field></div>
      </section>}
      {section === "pricing" && <section><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-foreground">Bundle offers</h2><Field label="Network"><select className={inputCls} value={netFilter} onChange={e => setNetFilter(e.target.value)} aria-label="Filter offers by network"><option value="all">All networks</option><option value="mtn">MTN</option><option value="telecel">Telecel</option><option value="airteltigo">AirtelTigo</option></select></Field></div><div className="mt-3 divide-y divide-border">{data.offers.filter(o => netFilter === "all" || o.network === netFilter).map(o => <div key={o.product_id} className="grid grid-cols-[1fr_100px_40px] items-center gap-3 py-3 sm:grid-cols-[1fr_160px_100px_48px]"><div className="min-w-0"><p className="text-sm font-medium text-foreground">{o.name}</p><p className="mt-1 text-xs text-muted-foreground">{o.validity}{!o.available ? " · Currently unavailable" : ""}</p></div><p className="hidden text-xs text-muted-foreground sm:block">Normal {formatGHS(Number(o.normal_price))}</p><label><span className="mb-1 block text-xs text-muted-foreground">Offer GH₵</span><input className={inputCls} aria-label={`Offer price for ${o.name}`} type="number" min="0.01" max="10000" step="0.01" value={prices[o.product_id] ?? ""} onChange={e => setPrices({ ...prices, [o.product_id]: e.target.value })} /></label><Switch label={`Enable ${o.name}`} on={o.enabled} onChange={enabled => setData({ ...data, offers: data.offers.map(row => row.product_id === o.product_id ? { ...row, enabled } : row) })} /></div>)}</div></section>}
      <p className="text-xs leading-5 text-muted-foreground">Account required. First purchase only, across all promotional bundles. Bundle prices exclude the usual 4% Paystack checkout fee.</p>
    </>}
  </div>;
}