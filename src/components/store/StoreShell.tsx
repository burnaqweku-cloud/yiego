import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { MessageCircle, ShieldCheck, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* The agent's storefront frame: their header, their footer, nothing of ours
   beyond "payments secured by DataYego". Pages inside read the store via useStore(). */
export interface StoreData { id: string; slug: string; store_name: string; tagline: string | null; logo_url: string | null; whatsapp: string | null; status: "active" | "closed"; prices: Record<string, number> }
const StoreContext = createContext<StoreData | null>(null);
export const useStore = () => { const c = useContext(StoreContext); if (!c) throw new Error("useStore outside StoreShell"); return c; };
export const waLink = (s: StoreData) => s.whatsapp ? `https://wa.me/233${s.whatsapp.replace(/\D/g, "").replace(/^0/, "")}` : null;

export default function StoreShell({ children }: { children?: ReactNode }) {
  const { slug = "" } = useParams();
  const [store, setStore] = useState<StoreData | null | undefined>(undefined);
  const navigate = useNavigate(); const location = useLocation();
  // An agent who changed their link: send visitors on the old one to the new one.
  useEffect(() => {
    if (store && store.slug !== slug) navigate(location.pathname.replace(`/s/${slug}`, `/s/${store.slug}`) + location.search, { replace: true });
  }, [store, slug, navigate, location.pathname, location.search]);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("agent_store", { p_slug: slug, p_preview: true }).then((r: { data: StoreData | null }) => setStore(r.data ?? null));
  }, [slug]);
  const initial = useMemo(() => store?.store_name?.trim().slice(0, 1).toUpperCase() ?? "S", [store]);
  if (store === undefined) return <div className="min-h-dvh bg-[#0b1512]" />;
  if (store === null) return <div className="flex min-h-dvh items-center justify-center bg-[#0b1512] px-6 text-center"><div><Store size={30} className="mx-auto text-white/40" /><p className="mt-3 text-[17px] font-semibold text-white">This store isn't open</p><p className="mt-1 text-[13px] text-white/60">It may be paused, or the link may be wrong.</p></div></div>;
  const wa = waLink(store);
  if (store.status === "closed") return (
    <div className="onyx-canvas flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      {store.logo_url ? <img src={store.logo_url} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-[24px] font-bold text-primary-glow">{initial}</span>}
      <h1 className="mt-4 text-[20px] font-semibold text-foreground">{store.store_name}</h1>
      <p className="mt-2 max-w-xs text-[13.5px] text-muted-foreground">Data plans aren't available right now. {wa ? `Message ${store.store_name} on WhatsApp and they'll help you out.` : "Please check back soon."}</p>
      {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-[13.5px] font-semibold text-[#062b16]"><MessageCircle size={16} />WhatsApp {store.store_name}</a>}
      <p className="mt-8 flex items-center gap-1 text-[11px] text-faint-foreground"><ShieldCheck size={11} />Payments secured by DataYego</p>
    </div>
  );
  return (
    <StoreContext.Provider value={store}>
      <div className="onyx-canvas flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <Link to={`/s/${store.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
              {store.logo_url ? <img src={store.logo_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-[16px] font-bold text-primary-glow">{initial}</span>}
              <span className="min-w-0"><span className="block truncate text-[16px] font-semibold text-foreground">{store.store_name}</span><span className="block truncate text-[11.5px] text-muted-foreground">{store.tagline ?? "Data bundles, delivered fast"}</span></span>
            </Link>
            {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]"><MessageCircle size={18} /></a>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-14 pt-5">{children ?? <Outlet />}</main>
        <footer className="border-t border-white/[0.06] px-4 py-6 text-center text-[11.5px] text-faint-foreground">
          <p>© {new Date().getFullYear()} {store.store_name}</p>
          <p className="mt-1 flex items-center justify-center gap-1"><ShieldCheck size={11} />Payments secured by DataYego</p>
        </footer>
      </div>
    </StoreContext.Provider>
  );
}
