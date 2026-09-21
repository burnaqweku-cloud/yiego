import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, Store, Zap } from "lucide-react";
import Seo from "@/components/seo/Seo";
import BuyDataFlow, { type AgentStoreContext, type BuyPreselect } from "@/components/flows/BuyDataFlow";
import { NETWORKS } from "@/data/bundles";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";

/* An agent's storefront: their name, their prices, our checkout and delivery. */
interface StoreData { id: string; slug: string; store_name: string; tagline: string | null; logo_url: string | null; prices: Record<string, number> }

export default function AgentStore() {
  const { slug = "" } = useParams();
  const [store, setStore] = useState<StoreData | null | undefined>(undefined);
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [open, setOpen] = useState(false);
  const [preselect, setPreselect] = useState<BuyPreselect | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("agent_store", { p_slug: slug, p_preview: true }).then((r: { data: StoreData | null }) => setStore(r.data ?? null));
    void loadPhase1Products().then((r) => setProducts(r.data ?? []));
  }, [slug]);

  const agent: AgentStoreContext | null = useMemo(() => store ? { slug: store.slug, name: store.store_name, prices: store.prices } : null, [store]);
  const byNetwork = useMemo(() => NETWORKS.map((n) => { const prefix = n.id === "mtn" ? "mtn" : n.id === "telecel" ? "tel" : "at"; return { n, items: products.filter((p) => p.app_product_code?.startsWith(prefix) && !p.is_paused).map((p) => ({ p, price: Number(store?.prices?.[p.id] ?? p.customer_price) })) }; }), [products, store]);

  if (store === undefined) return null;
  if (store === null) return <div className="mk-wrap py-16 text-center"><Store size={28} className="mx-auto text-faint-foreground" /><p className="mt-3 text-[16px] font-semibold text-foreground">This store isn't open</p><p className="mt-1 text-[13px] text-muted-foreground">It may be paused, or the link may be wrong.</p></div>;

  return (
    <div className="mk-wrap py-6 sm:py-10">
      <Seo path={`/s/${store.slug}`} title={`${store.store_name} · DataYego`} description={store.tagline ?? `Buy MTN, Telecel and AirtelTigo data from ${store.store_name}.`} />
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-3">
          {store.logo_url ? <img src={store.logo_url} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-[18px] font-semibold text-primary-glow">{store.store_name.slice(0, 1)}</span>}
          <div className="min-w-0"><h1 className="truncate font-display text-[22px] font-semibold text-foreground">{store.store_name}</h1><p className="text-[12.5px] text-muted-foreground">{store.tagline ?? "Data bundles, delivered fast"}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11.5px] text-faint-foreground"><span className="inline-flex items-center gap-1"><Zap size={12} className="text-primary-glow" />Instant delivery</span><span className="inline-flex items-center gap-1"><ShieldCheck size={12} className="text-primary-glow" />Paid securely through DataYego</span></div>

        <div className="mt-5 space-y-4">
          {byNetwork.map(({ n, items }) => items.length > 0 && (
            <section key={n.id} className="onyx-panel rounded-2xl p-3">
              <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{n.name}</h2>
              <ul className="mt-1 divide-y divide-white/[0.06]">
                {items.map(({ p, price }) => (
                  <li key={p.id}><button type="button" onClick={() => { setPreselect({ kind: "bundle", networkId: n.id, productCode: p.app_product_code ?? p.id }); setOpen(true); }} className="flex w-full items-center justify-between px-1 py-2.5 text-left hover:bg-white/[0.02]">
                    <span className="text-[14px] font-medium text-foreground">{p.name.replace(/^.*?—\s*/, "")}</span>
                    <span className="flex items-center gap-2"><span className="text-[14px] font-semibold text-foreground">{formatGHS(price)}</span><span className="onyx-btn-primary px-3 py-1 text-[12px]">Buy</span></span>
                  </button></li>))}
              </ul>
            </section>))}
        </div>
        <p className="mt-6 text-center text-[11px] text-faint-foreground">Powered by DataYego · orders start with AG-</p>
      </div>
      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => undefined} agent={agent} />
    </div>
  );
}
