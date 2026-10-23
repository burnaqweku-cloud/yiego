import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, inputCls, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Switch from "@/components/admin/Switch";
import { loadPromotionAdmin, promotionBasePrice, savePromotion, type PromotionAdmin } from "@/lib/promotions";
import { formatGHS } from "@/lib/format";
import PromotionPerformance from "@/components/admin/PromotionPerformance";

const url = "https://datayego.com/promo";
export default function AdminPromotions() {
  const [data, setData] = useState<PromotionAdmin | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const load = async () => {
    const r = await loadPromotionAdmin(); setFailed(Boolean(r.error)); setData(r.data);
    setPrices(Object.fromEntries((r.data?.offers ?? []).map(o => [o.product_id, String(o.price)])));
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (!data || busy) return;
    if (!data.title.trim()) return toast.error("Enter a promotion title.");
    if (data.active && !data.offers.some(o => o.enabled)) return toast.error("Enable at least one bundle before activating.");
    const offers = data.offers.map(o => ({ product_id: o.product_id, enabled: o.enabled, price: promotionBasePrice(prices[o.product_id]) }));
    if (offers.some(o => o.price === null)) return toast.error("Enter valid prices with no more than two decimal places.");
    setBusy(true);
    const r = await savePromotion(data.title, data.blurb, data.active, offers.map(o => ({ ...o, price: o.price ?? 0 })));
    setBusy(false);
    if (r.error) return toast.error("Couldn’t save. Check your administrator verification and try again.");
    toast.success("Promotion saved."); void load();
  };
  return <div className="space-y-6">
    <AdminPageHeader title="Promotions" description="First-purchase offers" action={<Button size="sm" disabled={!data || busy} onClick={() => void save()}><Save size={14} />{busy ? "Saving…" : "Save changes"}</Button>} />
    <section className="border-b border-border pb-5">
      <div className="flex flex-wrap items-center gap-2"><code className="break-all text-sm text-foreground">{url}</code><Button size="icon" variant="ghost" aria-label="Copy promotion link" title="Copy promotion link" onClick={() => { void navigator.clipboard.writeText(url).then(() => toast.success("Link copied.")); }}><Copy size={15} /></Button><Button size="icon" variant="ghost" asChild><a href="/promo" target="_blank" rel="noreferrer" aria-label="Open promotion page" title="Open promotion page"><ExternalLink size={15} /></a></Button></div>
    </section>
    <PromotionPerformance />
    {!data ? failed ? <div><p className="text-sm text-muted-foreground">Couldn’t load promotion settings.</p><Button className="mt-3" variant="soft" onClick={() => void load()}>Try again</Button></div> : <Loader2 className="animate-spin text-primary-glow" aria-label="Loading promotion settings" /> : <>
      <StatGrid cols={4}><Stat label="Paid promotion orders" value={data.paid_orders} /><Stat label="Awaiting payment" value={data.pending_orders} /><Stat label="Sales" value={formatGHS(Number(data.sales))} /><Stat label="Discount given" value={formatGHS(Number(data.discount))} /></StatGrid>
      <section className="space-y-4 border-b border-border pb-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-semibold text-foreground">Promotion active</h2><p className="mt-1 text-xs text-muted-foreground">Changes take effect after saving. Existing orders keep their agreed price.</p></div><Switch label="Promotion active" on={data.active} onChange={active => setData({ ...data, active })} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Page title"><input className={inputCls} maxLength={100} value={data.title} onChange={e => setData({ ...data, title: e.target.value })} /></Field><Field label="Message"><input className={inputCls} maxLength={240} value={data.blurb} onChange={e => setData({ ...data, blurb: e.target.value })} /></Field></div>
      </section>
      <section><h2 className="text-sm font-semibold text-foreground">Bundle offers</h2><div className="mt-3 divide-y divide-border">{data.offers.map(o => <div key={o.product_id} className="grid grid-cols-[1fr_100px_40px] items-center gap-3 py-3 sm:grid-cols-[1fr_160px_100px_48px]"><div className="min-w-0"><p className="text-sm font-medium text-foreground">{o.name}</p><p className="mt-1 text-xs text-muted-foreground">{o.validity}{!o.available ? " · Currently unavailable" : ""}</p></div><p className="hidden text-xs text-muted-foreground sm:block">Normal {formatGHS(Number(o.normal_price))}</p><label><span className="mb-1 block text-xs text-muted-foreground">Offer GH₵</span><input className={inputCls} aria-label={`Offer price for ${o.name}`} type="number" min="0.01" max="10000" step="0.01" value={prices[o.product_id] ?? ""} onChange={e => setPrices({ ...prices, [o.product_id]: e.target.value })} /></label><Switch label={`Enable ${o.name}`} on={o.enabled} onChange={enabled => setData({ ...data, offers: data.offers.map(row => row.product_id === o.product_id ? { ...row, enabled } : row) })} /></div>)}</div></section>
      <p className="text-xs leading-5 text-muted-foreground">Account required. First purchase only, across all promotional bundles. Bundle prices exclude the usual 4% Paystack checkout fee.</p>
    </>}
  </div>;
}