import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { Facebook, Instagram, Menu, MessageCircle, Package, Phone, PhoneForwarded, Search, Send, ShieldCheck, Store, X, Info, HelpCircle, Clock, UserRound } from "lucide-react";
import { useAuth } from "@/store/auth-context";
import { supabase } from "@/integrations/supabase/client";
import "./templates.css";

/* Agent accent (#rrggbb) -> HSL parts for the template CSS variables. */
function accentVars(hex: string | null): Record<string, string> {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return {};
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2; let h = 0, sat = 0;
  if (max !== min) { const d = max - min; sat = l > 0.5 ? d / (2 - max - min) : d / (max + min); h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { "--st-accent-h": h.toFixed(0), "--st-accent-s": `${(sat * 100).toFixed(0)}%`, "--st-accent-l": `${(l * 100).toFixed(0)}%` };
}
const TEMPLATE_FONTS: Record<string, string> = { market: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;900&display=swap", ledger: "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" };

/* The agent's storefront frame: their header with a menu, their pages, their footer.
   Nothing of DataYego's on the page. Pages inside read the store via useStore(). */
export interface StoreBranding { template: "classic" | "market" | "ledger"; accent_color: string | null; banner_url: string | null; about_text: string | null; hours_text: string | null; store_notice: string | null; contact_phone: string | null; socials: Record<string, string>; featured_product_ids: string[]; faq: Array<{ q: string; a: string }>; delivered_count: number }
export interface StoreData extends StoreBranding { id: string; slug: string; store_name: string; tagline: string | null; logo_url: string | null; whatsapp: string | null; status: "active" | "closed"; prices: Record<string, number> }
const StoreContext = createContext<StoreData | null>(null);
export const useStore = () => { const c = useContext(StoreContext); if (!c) throw new Error("useStore outside StoreShell"); return c; };
export const waLink = (s: StoreData) => s.whatsapp ? `https://wa.me/233${s.whatsapp.replace(/\D/g, "").replace(/^0/, "")}` : null;

export default function StoreShell({ children }: { children?: ReactNode }) {
  const { slug = "" } = useParams();
  const [menu, setMenu] = useState(false);
  const { isAuthenticated } = useAuth();
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
  const template = store?.template ?? "classic";
  useEffect(() => {
    const href = TEMPLATE_FONTS[template]; if (!href) return;
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
  }, [template]);
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
      <div className={`tpl-${template}`} style={accentVars(store.accent_color) as React.CSSProperties}>
      <div className="onyx-canvas flex min-h-dvh flex-col">
        <header className="st-head sticky top-0 z-30 border-b border-white/[0.06] bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <button type="button" onClick={() => setMenu(true)} aria-label="Menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] text-foreground"><Menu size={18} /></button>
            <Link to={`/s/${store.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
              {store.logo_url ? <img src={store.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-[15px] font-semibold text-primary-glow">{initial}</span>}
              <span className="min-w-0"><span className="block truncate text-[15.5px] font-semibold text-foreground">{store.store_name}</span>{store.tagline && <span className="block truncate text-[11.5px] text-muted-foreground">{store.tagline}</span>}</span>
            </Link>
            <Link to={`/s/${store.slug}/${isAuthenticated ? "account" : "sign-in"}`} aria-label={isAuthenticated ? "Your account" : "Sign in"} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] text-foreground"><UserRound size={17} /></Link>
            {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]"><MessageCircle size={18} /></a>}
          </div>
          {store.store_notice && <div className="border-t border-white/[0.06] bg-primary/[0.08] px-4 py-2 text-center text-[12.5px] text-foreground"><span className="mx-auto block max-w-2xl">{store.store_notice}</span></div>}
        </header>
        {menu && (
          <div className="fixed inset-0 z-50" onClick={() => setMenu(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <aside className="st-drawer absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col bg-background p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2.5">{store.logo_url ? <img src={store.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-[14px] font-semibold text-primary-glow">{initial}</span>}<p className="truncate text-[15px] font-semibold text-foreground">{store.store_name}</p></div><button type="button" onClick={() => setMenu(false)} aria-label="Close menu" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] text-muted-foreground"><X size={16} /></button></div>
              <nav className="mt-5 flex flex-1 flex-col gap-0.5 overflow-y-auto">
                {([
                  { to: `/s/${store.slug}`, label: "Bundles", icon: Package, end: true },
                  { to: `/s/${store.slug}/track`, label: "Track order", icon: Search },
                  { to: `/s/${store.slug}/check-mtn`, label: "Check MTN number", icon: PhoneForwarded },
                  { to: `/s/${store.slug}/about`, label: "About", icon: Info },
                  { to: `/s/${store.slug}/contact`, label: "Contact", icon: Phone },
                  { to: `/s/${store.slug}/faq`, label: "FAQ", icon: HelpCircle },
                  { to: `/s/${store.slug}/${isAuthenticated ? "account" : "sign-in"}`, label: isAuthenticated ? "Your account" : "Sign in / Create account", icon: UserRound },
                ] as Array<{ to: string; label: string; icon: typeof Package; end?: boolean }>).map((n) => {
                  const active = n.end ? location.pathname === n.to : location.pathname.startsWith(n.to);
                  return <Link key={n.to} to={n.to} onClick={() => setMenu(false)} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] ${active ? "bg-primary/15 text-primary-glow" : "text-foreground hover:bg-white/[0.04]"}`}><n.icon size={17} />{n.label}</Link>;
                })}
              </nav>
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-[13.5px] font-semibold text-[#062b16]"><MessageCircle size={16} />WhatsApp {store.store_name}</a>}
              {store.hours_text && <p className="mt-3 flex items-center gap-1.5 px-1 text-[11.5px] text-faint-foreground"><Clock size={12} />{store.hours_text}</p>}
            </aside>
          </div>
        )}
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-14 pt-5">{children ?? <Outlet />}</main>
        <footer className="st-foot border-t border-white/[0.06] px-4 py-6 text-center text-[11.5px] text-faint-foreground">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-2">
            <p className="text-[12.5px] font-semibold text-foreground">{store.store_name}</p>
            {store.hours_text && <p>{store.hours_text}</p>}
            <div className="flex items-center gap-3">
              {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="text-faint-foreground hover:text-foreground"><MessageCircle size={16} /></a>}
              {store.socials?.facebook && <a href={store.socials.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="text-faint-foreground hover:text-foreground"><Facebook size={16} /></a>}
              {store.socials?.instagram && <a href={store.socials.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="text-faint-foreground hover:text-foreground"><Instagram size={16} /></a>}
              {store.socials?.tiktok && <a href={store.socials.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok" className="text-[11px] font-semibold text-faint-foreground hover:text-foreground">TikTok</a>}
              {store.socials?.telegram && <a href={store.socials.telegram} target="_blank" rel="noreferrer" aria-label="Telegram" className="text-faint-foreground hover:text-foreground"><Send size={16} /></a>}
            </div>
            <p>© {new Date().getFullYear()} {store.store_name}</p>
          </div>
        </footer>
      </div>
      </div>
    </StoreContext.Provider>
  );
}
