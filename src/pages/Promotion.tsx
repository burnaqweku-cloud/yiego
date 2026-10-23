import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgePercent, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Seo from "@/components/seo/Seo";
import Wordmark from "@/components/brand/Wordmark";
import { useAuth } from "@/store/auth-context";
import { useFlows } from "@/store/flows";
import { formatGHS } from "@/lib/format";
import { loadPromotion, type Promotion as PromotionData } from "@/lib/promotions";
import UnpaidOrderActions from "@/components/shop/UnpaidOrderActions";

export default function Promotion() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { openBuyData, flowOpen } = useFlows();
  const [promotion, setPromotion] = useState<PromotionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = async () => {
    setLoading(true);
    const { data, error } = await loadPromotion();
    setPromotion(data); setFailed(Boolean(error)); setLoading(false);
  };
  useEffect(() => { if (!authLoading && !flowOpen) void load(); }, [user?.id, authLoading, flowOpen]);
  const usable = promotion?.active && (promotion.eligible || !isAuthenticated);
  return <main className="mx-auto w-full max-w-4xl py-4 sm:py-8">
    <Seo path="/promo" title="First purchase offers · DataYego" description="Buy your first data bundle at a special DataYego price. Sign in or create a free account to purchase." />
    <header className="border-b border-border pb-6">
      <Wordmark className="mb-5 h-8" />
      <p className="flex items-center gap-2 text-sm font-semibold text-primary-glow"><BadgePercent size={18} />First purchase offer</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-foreground sm:text-4xl">{promotion?.title ?? "DataYego first purchase offers"}</h1>
      {promotion?.blurb && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{promotion.blurb}</p>}
    </header>
    {(loading || authLoading) ? <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin text-primary-glow" aria-label="Loading offers" /></div> : failed ? <div className="py-8"><p className="text-muted-foreground">We couldn’t load the offers. Please try again.</p><Button variant="soft" className="mt-4" onClick={() => void load()}>Try again</Button></div> : !promotion?.active ? <div className="py-8"><h2 className="text-xl font-semibold text-foreground">No promotion running right now</h2><Button asChild className="mt-5"><Link to="/shop">Buy data<ArrowRight size={16} /></Link></Button></div> : <>
      {promotion.reason === "already_purchased" && isAuthenticated && <div className="py-6"><p className="font-semibold text-foreground">You’ve already made your first purchase.</p><p className="mt-1 text-sm text-muted-foreground">You can still purchase bundles at our normal shop prices.</p><Button asChild variant="soft" className="mt-4"><Link to="/shop">Go to shop<ArrowRight size={16} /></Link></Button></div>}
      {promotion.pending_reference && isAuthenticated && <div className="py-6"><UnpaidOrderActions reference={promotion.pending_reference} onCancelled={() => void load()} /></div>}
      <section className="grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Promotion bundles">
        {promotion.offers.filter(o => o.enabled).map(o => <article key={o.product_id} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-primary-glow">{o.network === "mtn" ? "MTN" : o.network === "at" ? "AirtelTigo" : "Telecel"}</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">{o.name.replace(/^.*?—\s*/, "")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{o.validity}</p>
          <p className="mt-5 font-display text-3xl font-semibold text-foreground">{formatGHS(Number(o.price))}</p>
          {Number(o.normal_price) > Number(o.price) && <p className="mt-1 text-xs text-muted-foreground">Normally <span className="line-through">{formatGHS(Number(o.normal_price))}</span></p>}
          <div className="mt-5 pt-2">{!o.available ? <Button variant="soft" className="w-full" disabled>Currently unavailable</Button> : !isAuthenticated ? <Button asChild className="w-full"><Link to="/auth?mode=signup&next=%2Fpromo">Create account<ArrowRight size={16} /></Link></Button> : <Button className="w-full" disabled={!usable} onClick={() => openBuyData({ kind: "bundle", networkId: o.network, productCode: o.product_code ?? o.product_id, promotion: { productId: o.product_id, price: Number(o.price) } })}>Purchase<ArrowRight size={16} /></Button>}</div>
        </article>)}
      </section>
      {!isAuthenticated && <p className="text-sm text-muted-foreground">Already have an account? <Link className="font-semibold text-primary-glow underline" to="/auth?next=%2Fpromo">Sign in</Link></p>}
      <p className="mt-5 text-xs leading-5 text-muted-foreground">One promotional purchase per customer, on your first purchase only.</p>
    </>}
  </main>;
}