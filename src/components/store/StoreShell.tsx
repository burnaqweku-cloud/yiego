import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storeBase } from "@/lib/storeHost";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { Bell, Facebook, Instagram, Menu, MessageCircle, Package, Phone, PhoneForwarded, Search, Send, ShieldCheck, Store, X, Info, HelpCircle, Clock, UserRound, Users } from "lucide-react";
import { useAuth } from "@/store/auth-context";
import StoreSupport from "@/components/store/StoreSupport";
import StorePopup from "@/components/store/StorePopup";
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
const TEMPLATE_FONTS: Record<string, string> = { market: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;900&display=swap", studio: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" };

/* The agent's storefront frame: their header with a menu, their pages, their footer.
   Nothing of DataYego's on the page. Pages inside read the store via useStore(). */
export interface StoreBranding { template: "classic" | "market" | "studio"; accent_color: string | null; banner_url: string | null; about_text: string | null; hours_text: string | null; store_notice: string | null; contact_phone: string | null; socials: Record<string, string>; featured_product_ids: string[]; faq: Array<{ q: string; a: string }>; delivered_count: number }
export interface StoreData extends StoreBranding { network?: { fee: number; pitch: string | null } | null; custom_domain_for_network?: string | null; support?: { whatsapp_url: string | null; chat_on: boolean }; promos?: Record<string, { was: number; ends_at: string }>; id: string; slug: string; store_name: string; tagline: string | null; logo_url: string | null; whatsapp: string | null; status: "active" | "closed"; prices: Record<string, number> }
const StoreContext = createContext<StoreData | null>(null);
export const useStore = () => { const c = useContext(StoreContext); if (!c) throw new Error("useStore outside StoreShell"); return c; };
export const waLink = (s: StoreData) => s.whatsapp ? `https://wa.me/233${s.whatsapp.replace(/\D/g, "").replace(/^0/, "")}` : null;

export default function StoreShell({ children, hostSlug }: { children?: ReactNode; hostSlug?: string }) {
  const params = useParams();
  const slug = hostSlug ?? params.slug ?? "";
  const [menu, setMenu] = useState(false);
  const { isAuthenticated } = useAuth();
  // Store announcements (the agent's own), with a per-device "seen" marker.
  const [anns, setAnns] = useState<Array<{ id: string; title: string; body: string; created_at: string }>>([]);
  const [annOpen, setAnnOpen] = useState(false);
  const seenKey = `yg-store-ann-seen:${slug}`;
  const unread = anns.filter((a) => !(localStorage.getItem(seenKey) ?? "").split(",").includes(a.id)).length;
  useEffect(() => {
    if (!slug) return;
    const p1 = (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }> } }).schema("phase1");
    void p1.rpc("store_announcements_for", { p_slug: slug }).then((r) => setAnns((r.data as typeof anns) ?? []));
    void p1.rpc("store_visit", { p_slug: slug });
  }, [slug]);
  const markSeen = () => { localStorage.setItem(seenKey, anns.map((a) => a.id).join(",")); setAnnOpen(true); };
  const [store, setStore] = useState<StoreData | null | undefined>(undefined);
  const navigate = useNavigate(); const location = useLocation();
  // An agent who changed their link: send visitors on the old one to the new one.
  useEffect(() => {
    if (store && store.slug !== slug && !hostSlug) navigate(location.pathname.replace(`${storeBase(slug)}`, `${storeBase(store.slug)}`) + location.search, { replace: true });
  }, [store, slug, navigate, location.pathname, location.search]);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("agent_store", { p_slug: slug, p_preview: true }).then((r: { data: StoreData | null }) => setStore(r.data ?? null));
  }, [slug]);
  // A store with its own domain lives there: datayego.com/s/<slug>/… (receipts, old links, shares) jumps to it, same page.
  useEffect(() => {
    if (hostSlug || !slug) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("store_canonical_host", { p_slug: slug }).then((r: { data: string | null }) => {
      const host = r.data; if (!host || host === window.location.hostname) return;
      const rest = window.location.pathname.replace(new RegExp(`^${storeBase(slug).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "");
      window.location.replace(`https://${host}${rest || "/"}${window.location.search}${window.location.hash}`);
    });
  }, [slug, hostSlug]);
  const initial = useMemo(() => store?.store_name?.trim().slice(0, 1).toUpperCase() ?? "S", [store]);
  const template = store?.template ?? "classic";
  useEffect(() => {
    const href = TEMPLATE_FONTS[template]; if (!href) return;
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
  }, [template]);
  // The buy sheet and other modals portal to <body>, outside this tree. Put the template
  // on the body too so they take the store's fonts, colours and shapes.
  useEffect(() => {
    if (!store) return;
    const cls = `tpl-${store.template ?? "classic"}`; const vars = accentVars(store.accent_color);
    document.body.classList.add(cls, "st-body"); if (store.accent_color) document.body.classList.add("has-accent"); Object.entries(vars).forEach(([k, v]) => document.body.style.setProperty(k, v));
    return () => { document.body.classList.remove(cls, "st-body", "has-accent"); Object.keys(vars).forEach((k) => document.body.style.removeProperty(k)); };
  }, [store]);
  if (store === undefined) return <div className="min-h-dvh bg-[#0b1512]" />;
  if (store === null) return <div className="flex min-h-dvh items-center justify-center bg-[#0b1512] px-6 text-center"><div><Store size={30} className="mx-auto text-white/40" /><p className="mt-3 text-[17px] font-semibold text-white">This store isn't open</p><p className="mt-1 text-[13px] text-white/60">It may be paused, or the link may be wrong.</p></div></div>;
  const wa = store.support?.whatsapp_url ?? waLink(store);
  if (store.status === "closed") return (
    <div className="onyx-canvas flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      {store.logo_url ? <img src={store.logo_url} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-[24px] font-bold text-primary-glow">{initial}</span>}
      <h1 className="mt-4 text-[20px] font-semibold text-foreground">{store.store_name}</h1>
      <p className="mt-2 max-w-xs text-[13.5px] text-muted-foreground">Data plans aren't available right now. {wa ? `Message ${store.store_name} on WhatsApp and they'll help you out.` : "Please check back soon."}</p>
      {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-[13.5px] font-semibold text-[#062b16]"><MessageCircle size={16} />WhatsApp {store.store_name}</a>}
      <p className="mt-8 flex items-center gap-1 text-[11px] text-faint-foreground"><ShieldCheck size={11} />Payments secured by DataYego</p>
    </div>
  );
  const studio = template === "studio";
  const NAV = [
    { to: `${storeBase(store.slug)}` || "/", label: "Home", icon: Store, end: true },
    { to: `${storeBase(store.slug)}/bundles`, label: "Bundles", icon: Package },
    { to: `${storeBase(store.slug)}/track`, label: "Track order", icon: Search },
    { to: `${storeBase(store.slug)}/check-mtn`, label: "Check MTN number", icon: PhoneForwarded },
    { to: `${storeBase(store.slug)}/about`, label: "About", icon: Info },
    { to: `${storeBase(store.slug)}/contact`, label: "Contact", icon: Phone },
    { to: `${storeBase(store.slug)}/faq`, label: "FAQ", icon: HelpCircle },
    ...(store.network ? [{ to: `${storeBase(store.slug)}/join`, label: "Become an agent", icon: Users }] : []),
    { to: `${storeBase(store.slug)}/${isAuthenticated ? "account" : "sign-in"}`, label: isAuthenticated ? "Your account" : "Sign in / Create account", icon: UserRound },
  ] as Array<{ to: string; label: string; icon: typeof Package; end?: boolean }>;
  const isHome = location.pathname.replace(/\/$/, "") === (storeBase(store.slug) || "");
  return (
    <StoreContext.Provider value={store}>
      <div className={`tpl-${template} ${store.accent_color ? "has-accent" : ""}`} style={accentVars(store.accent_color) as React.CSSProperties}>
      <div className="onyx-canvas flex min-h-dvh flex-col">
        <header className="st-head sticky top-0 z-30 border-b border-white/[0.06] bg-background/85 backdrop-blur">
          {studio ? (
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3 sm:px-8">
              <Link to={`${storeBase(store.slug)}` || "/"} className="flex min-w-0 items-center gap-2.5">
                {store.logo_url ? <img src={store.logo_url} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground">{initial}</span>}
                <span className="truncate text-[16px] font-bold text-foreground">{store.store_name}</span>
              </Link>
              <nav className="st-nav ml-6 hidden items-center gap-1 md:flex">
                {NAV.filter((n) => n.label !== "Home" && n.label !== "Sign in / Create account" && n.label !== "Your account").map((n) => <Link key={n.to} to={n.to} className={(n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)) ? "on" : ""}>{n.label}</Link>)}
              </nav>
              <div className="ml-auto flex items-center gap-2">
                {anns.length > 0 && <button type="button" onClick={markSeen} aria-label="Store news" className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.1] text-foreground"><Bell size={17} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread}</span>}</button>}
                <Link to={`${storeBase(store.slug)}/${isAuthenticated ? "account" : "sign-in"}`} className="hidden h-9 items-center rounded-xl px-3 text-[14px] font-medium text-muted-foreground md:flex">{isAuthenticated ? "Account" : "Sign in"}</Link>
                <Link to={`${storeBase(store.slug)}/bundles`} className="st-btn fill !px-4 !py-2 !text-[14px]">Buy data</Link>
                <button type="button" onClick={() => setMenu(true)} aria-label="Menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] text-foreground md:hidden"><Menu size={18} /></button>
              </div>
            </div>
          ) : (
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <button type="button" onClick={() => setMenu(true)} aria-label="Menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] text-foreground"><Menu size={18} /></button>
            <Link to={`${storeBase(store.slug)}` || "/"} className="flex min-w-0 flex-1 items-center gap-3">
              {store.logo_url ? <img src={store.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-[15px] font-semibold text-primary-glow">{initial}</span>}
              <span className="min-w-0"><span className="block truncate text-[15.5px] font-semibold text-foreground">{store.store_name}</span>{store.tagline && <span className="block truncate text-[11.5px] text-muted-foreground">{store.tagline}</span>}</span>
            </Link>
            {anns.length > 0 && <button type="button" onClick={markSeen} aria-label="Store news" className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] text-foreground"><Bell size={17} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread}</span>}</button>}
            <Link to={`${storeBase(store.slug)}/${isAuthenticated ? "account" : "sign-in"}`} aria-label={isAuthenticated ? "Your account" : "Sign in"} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] text-foreground"><UserRound size={17} /></Link>
            {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]"><MessageCircle size={18} /></a>}
          </div>
          )}
          {store.store_notice && !studio && <div className="border-t border-white/[0.06] bg-primary/[0.08] px-4 py-2 text-center text-[12.5px] text-foreground"><span className="mx-auto block max-w-2xl">{store.store_notice}</span></div>}
        </header>
        {annOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setAnnOpen(false)}>
            <div className="mx-auto w-full max-w-5xl px-4 pt-[68px] sm:px-8" onClick={(e) => e.stopPropagation()}>
              <div className="st-news onyx-panel ml-auto w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3"><p className="text-[14px] font-semibold text-foreground">Updates from {store.store_name}</p><button type="button" onClick={() => setAnnOpen(false)} aria-label="Close" className="text-muted-foreground"><X size={16} /></button></div>
                <ul className="max-h-[60vh] divide-y divide-white/[0.06] overflow-y-auto">{anns.map((a) => <li key={a.id} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><p className="text-[13.5px] font-semibold text-foreground">{a.title}</p><span className="shrink-0 text-[11px] text-faint-foreground">{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></div><p className="mt-1 whitespace-pre-line text-[13px] leading-5 text-muted-foreground">{a.body}</p></li>)}</ul>
              </div>
            </div>
          </div>
        )}
        {menu && (
          <div className="fixed inset-0 z-50" onClick={() => setMenu(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <aside className="st-drawer absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col bg-background p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2.5">{store.logo_url ? <img src={store.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-[14px] font-semibold text-primary-glow">{initial}</span>}<p className="truncate text-[15px] font-semibold text-foreground">{store.store_name}</p></div><button type="button" onClick={() => setMenu(false)} aria-label="Close menu" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] text-muted-foreground"><X size={16} /></button></div>
              <nav className="mt-5 flex flex-1 flex-col gap-0.5 overflow-y-auto">
                {NAV.map((n) => {
                  const active = n.end ? location.pathname === n.to : location.pathname.startsWith(n.to);
                  return <Link key={n.to} to={n.to} onClick={() => setMenu(false)} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] ${active ? "bg-primary/15 text-primary-glow" : "text-foreground hover:bg-white/[0.04]"}`}><n.icon size={17} />{n.label}</Link>;
                })}
              </nav>
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-[13.5px] font-semibold text-[#062b16]"><MessageCircle size={16} />WhatsApp {store.store_name}</a>}
              {store.hours_text && <p className="mt-3 flex items-center gap-1.5 px-1 text-[11.5px] text-faint-foreground"><Clock size={12} />{store.hours_text}</p>}
            </aside>
          </div>
        )}
        <main className={studio && isHome ? "w-full flex-1" : "mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-5"}>{children ?? <Outlet />}</main>
        <StoreSupport />
        <StorePopup />
        {studio ? (
        <footer className="st-foot px-5 py-12 sm:px-8">
          <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <p className="brand">{store.store_name}</p>
              <p className="mt-2 max-w-[36ch] text-[13.5px] leading-relaxed">{store.tagline ?? "MTN, Telecel and AirtelTigo data bundles, delivered to any number in Ghana."}</p>
              {store.hours_text && <p className="mt-3 inline-flex items-center gap-1.5 text-[13px]"><Clock size={13} />{store.hours_text}</p>}
            </div>
            <div><h4>Shop</h4><ul className="space-y-2 text-[14px]"><li><Link to={`${storeBase(store.slug)}/bundles`}>All bundles</Link></li><li><Link to={`${storeBase(store.slug)}/bundles?network=mtn`}>MTN</Link></li><li><Link to={`${storeBase(store.slug)}/bundles?network=telecel`}>Telecel</Link></li><li><Link to={`${storeBase(store.slug)}/bundles?network=at`}>AirtelTigo</Link></li></ul></div>
            <div><h4>Help</h4><ul className="space-y-2 text-[14px]"><li><Link to={`${storeBase(store.slug)}/track`}>Track an order</Link></li><li><Link to={`${storeBase(store.slug)}/check-mtn`}>Check an MTN number</Link></li><li><Link to={`${storeBase(store.slug)}/faq`}>FAQ</Link></li><li><Link to={`${storeBase(store.slug)}/${isAuthenticated ? "account" : "sign-in"}`}>{isAuthenticated ? "Your account" : "Sign in"}</Link></li></ul></div>
            <div><h4>Contact</h4><ul className="space-y-2 text-[14px]">{wa && <li><a href={wa} target="_blank" rel="noreferrer">WhatsApp</a></li>}{store.contact_phone && <li><a href={`tel:${store.contact_phone}`}>{store.contact_phone}</a></li>}<li><Link to={`${storeBase(store.slug)}/about`}>About us</Link></li>{store.network && <li><Link to={`${storeBase(store.slug)}/join`}>Become an agent</Link></li>}</ul>
              <div className="mt-4 flex items-center gap-3">{store.socials?.facebook && <a href={store.socials.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook size={17} /></a>}{store.socials?.instagram && <a href={store.socials.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={17} /></a>}{store.socials?.tiktok && <a href={store.socials.tiktok} target="_blank" rel="noreferrer" className="text-[12px] font-semibold">TikTok</a>}{store.socials?.telegram && <a href={store.socials.telegram} target="_blank" rel="noreferrer" aria-label="Telegram"><Send size={17} /></a>}</div>
            </div>
          </div>
          <p className="mx-auto mt-10 max-w-5xl border-t border-[#ffffff1f] pt-5 text-[12.5px]">© {new Date().getFullYear()} {store.store_name}</p>
        </footer>
        ) : (
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
        )}
      </div>
      </div>
    </StoreContext.Provider>
  );
}
