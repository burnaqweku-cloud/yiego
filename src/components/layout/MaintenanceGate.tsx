import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { ArrowRight, Clock3, Eye, Loader2, RefreshCw, ShieldCheck, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth-context";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Button } from "@/components/ui/button";
import { loadMaintenance } from "@/lib/maintenance";
import { DEFAULT_MAINTENANCE, maintenanceApplies, maintenanceBlocksRequest, type MaintenanceSettings } from "@/lib/maintenancePolicy";
import { isStoreHost } from "@/lib/storeHost";

const MaintenanceContext = createContext({ blocked: false, message: DEFAULT_MAINTENANCE.blocked_message });
export const useMaintenance = () => useContext(MaintenanceContext);

export function MaintenanceNotice({ settings, onClose, preview = false, brand = "DataYego" }: { settings: MaintenanceSettings; onClose: () => void; preview?: boolean; brand?: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <section role="dialog" aria-modal="true" aria-labelledby="maintenance-title" aria-describedby="maintenance-reason" className={`${preview ? "min-h-[520px] rounded-lg border border-border" : "fixed inset-0 z-[250] min-h-dvh"} overflow-y-auto bg-background text-foreground`} onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); } }}>
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 py-8 sm:px-10 sm:py-12">
      <div className="flex items-center justify-between gap-4"><span className="min-w-0 break-words font-display text-xl font-semibold">{brand}</span><Button ref={closeRef} variant="quiet" size="icon" aria-label="Close maintenance notice and browse" onClick={onClose}><X /></Button></div>
      <div className="my-auto py-14 sm:py-20">
        <Wrench size={48} strokeWidth={1.3} className="mb-8 text-amber" />
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber"><span className="h-2 w-2 rounded-full bg-amber" />Maintenance in progress</p>
        <h1 id="maintenance-title" className="break-words font-display text-3xl font-semibold leading-tight sm:text-5xl">{settings.title}</h1>
        <p id="maintenance-reason" className="mt-6 whitespace-pre-wrap break-words text-base leading-7 text-muted-foreground">{settings.reason}</p>
        {settings.eta && <p className="mt-6 flex items-start gap-2 text-sm text-amber"><Clock3 size={18} className="mt-0.5 shrink-0" /><span className="break-words">{settings.eta}</span></p>}
        <div className="mt-9 space-y-3 border-y border-border py-6 text-sm leading-6"><p className="flex items-start gap-3"><Eye size={19} className="mt-0.5 shrink-0 text-amber" />Your account details and order tracking remain available.</p><p className="flex items-start gap-3 text-muted-foreground"><ShieldCheck size={19} className="mt-0.5 shrink-0" />New purchases, top-ups and account changes are temporarily paused.</p></div>
        <Button variant="ghost" className="mt-8 h-auto min-h-12 w-full whitespace-normal py-3 text-base sm:w-auto" onClick={onClose}>Continue browsing<ArrowRight /></Button>
      </div>
      <p className="text-xs text-muted-foreground">Thank you for your patience.</p>
    </div>
  </section>;
}

export default function MaintenanceGate({ children, hostSlug }: { children: ReactNode; hostSlug?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, needsMfa, loading: adminLoading } = useAdminAccess();
  const location = useLocation();
  const storeSlug = location.pathname.match(/^\/s\/([^/]+)/)?.[1] ?? hostSlug;
  const storefront = Boolean(storeSlug) || isStoreHost();
  const [brand, setBrand] = useState<{ slug?: string; name: string }>({ name: "" });
  useEffect(() => {
    if (!storeSlug) return;
    let live = true;
    // Public store lookup covers both parent and sub-agent stores, before the notice paints.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("agent_store", { p_slug: storeSlug, p_preview: true }).then(({ data }: { data: { store_name?: string } | null }) => { if (live) setBrand({ slug: storeSlug, name: data?.store_name ?? "Your store" }); }, () => { if (live) setBrand({ slug: storeSlug, name: "Your store" }); });
    return () => { live = false; };
  }, [storeSlug]);
  const noticeBrand = storefront ? brand.slug === storeSlug ? brand.name || "Your store" : "Your store" : "DataYego";
  const [settings, setSettings] = useState(DEFAULT_MAINTENANCE);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const failures = useRef(0);
  const loadedOnce = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try { const next = await loadMaintenance(); failures.current = 0; loadedOnce.current = true; setSettings(next); setError(false); setReady(true); if (!next.enabled) setDismissed(null); }
    catch {
      // A phone waking up often drops the first request. Keep the last confirmed state and
      // retry quietly; only show the paused banner after repeated failures or with no prior reading.
      failures.current += 1;
      if (!loadedOnce.current || failures.current >= 3) { setError(true); setReady(true); }
      else window.setTimeout(() => void refresh(), 2000 * failures.current);
    }
    finally { busy.current = false; }
  }, []);
  useEffect(() => {
    setMounted(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus); window.addEventListener("yego:maintenance-refresh", refresh);
    const channel = supabase.channel("global-maintenance").on("postgres_changes", { event: "*", schema: "phase1", table: "site_settings", filter: "key=eq.agent_plan" }, () => void refresh()).subscribe();
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); window.removeEventListener("yego:maintenance-refresh", refresh); void supabase.removeChannel(channel); };
  }, [refresh]);
  const verifiedAdmin = !adminLoading && isAdmin && !needsMfa;
  const blocked = !verifiedAdmin && (!ready || error || maintenanceApplies(settings.enabled, isAdmin, needsMfa));
  const show = ready && !error && !authLoading && (!user || !adminLoading) && blocked && settings.enabled && dismissed !== settings.revision;
  const message = error ? "We couldn’t confirm service availability. Please try again shortly." : settings.blocked_message;
  const notify = useCallback(() => { toast.error(message, { id: "maintenance-blocked" }); }, [message]);

  // Fetch protection covers controls outside the main shop and sheets already open when maintenance starts.
  // The server remains the money authority; this is a user-experience safeguard, not authorization.
  useEffect(() => {
    if (!blocked) return;
    const original = window.fetch;
    const guarded: typeof window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      let body: unknown = init?.body;
      if (input instanceof Request && body == null && !["GET", "HEAD"].includes(input.method)) { try { body = await input.clone().text(); } catch { /* unreadable write stays blocked */ } }
      const isOwnService = new URL(url, window.location.origin).origin === new URL(import.meta.env.VITE_SUPABASE_URL).origin;
      if (isOwnService && maintenanceBlocksRequest(url, init?.method ?? (input instanceof Request ? input.method : "GET"), body)) {
        notify();
        return new Response(JSON.stringify({ error: message, code: "maintenance_active" }), { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "60" } });
      }
      return original(input, init);
    };
    window.fetch = guarded;
    return () => { if (window.fetch === guarded) window.fetch = original; };
  }, [blocked, message, notify]);

  useEffect(() => {
    if (!show) return;
    const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    contentRef.current?.setAttribute("inert", "");
    return () => { document.body.style.overflow = old; contentRef.current?.removeAttribute("inert"); };
  }, [show]);

  // Non-destructive navigation, filters, tracking and sign-in remain usable. All requests that can
  // change business records are independently guarded above, including keyboard-submitted forms.
  const capture = (e: React.MouseEvent) => {
    if (!blocked) return;
    const target = e.target instanceof Element ? e.target.closest("button,a,[role=button]") : null;
    if (!target) return;
    const text = `${target.textContent ?? ""} ${target.getAttribute("aria-label") ?? ""}`.trim().toLowerCase();
    const href = target.getAttribute("href") ?? "";
    const destructive = /\b(buy|purchase|pay now|pay with|continue payment|add money|top.?up|withdraw|renew|activate|save changes|submit application|cancel order|update number|send message)\b/.test(text) || /\/(agent\/buy|s\/[^/]+\/join)(\?|$)/.test(href);
    if (destructive) { e.preventDefault(); e.stopPropagation(); notify(); }
  };

  const initialCheck = mounted && !ready && !location.pathname.startsWith("/admin") && !/^\/auth|\/sign-in$/.test(location.pathname);
  return <MaintenanceContext.Provider value={{ blocked, message }}>
    {initialCheck ? <div className="grid min-h-dvh place-items-center bg-background"><Loader2 size={24} className="animate-spin text-amber" aria-label="Checking service availability" /></div> : <>
      {blocked && ready && <div className="relative z-[90] flex flex-wrap items-center justify-center gap-2 border-b border-amber/30 bg-amber-soft px-4 py-2 text-center text-xs text-foreground" role="status"><Wrench size={14} className="text-amber" /><span>{error ? "Service availability could not be checked. Purchases are paused." : "Maintenance in progress · Browsing and order tracking only"}</span><Button variant="quiet" size="sm" onClick={() => error ? void refresh() : setDismissed(null)}>{error ? <RefreshCw /> : <Eye />}{error ? "Check again" : "View notice"}</Button></div>}
      <div ref={contentRef} onClickCapture={capture}>{children}</div>
    </>}
    {show && createPortal(<MaintenanceNotice settings={settings} brand={noticeBrand} onClose={() => setDismissed(settings.revision)} />, document.body)}
  </MaintenanceContext.Provider>;
}