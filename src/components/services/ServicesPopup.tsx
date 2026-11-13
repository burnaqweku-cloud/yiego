import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { loadServices, type ServiceProduct } from "@/lib/services";
import { POPUP_DELAY_MS, cedis, isPopupPage, markPopupSeen, notePopupShown, noteNothingOnSale, popupThisVisit, scopeOf, servicesPopupOwed } from "@/lib/servicesNews";
import { storeBase } from "@/lib/storeHost";
import { useFlows } from "@/store/flows";

/* "We now sell result checkers and MTN AFA registration": a pop-up with the live prices and one button to Services.
   - Once per device on each site (the main site, or one agent's store). Tapping the button or closing it both count.
   - Only on the home page and the bundle list, a few seconds after arriving; never over the buy sheet, and never
     for a visitor who came from an advert's promo link (they see it on a later visit).
   - Never in the same visit as another pop-up (lib/servicesNews keeps the peace), and it retires itself on POPUP_UNTIL.
   - In a store it speaks as the store: the store's name, the store's own prices, no DataYego wording. */
export default function ServicesPopup({ store }: { store?: { slug: string; name: string } }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { flowOpen } = useFlows();
  const scope = scopeOf(store?.slug);
  const base = store ? storeBase(store.slug) : "";
  const rest = (base && (pathname === base || pathname.startsWith(`${base}/`)) ? pathname.slice(base.length) : pathname) || "/";
  const onPage = isPopupPage(rest, Boolean(store));
  const [products, setProducts] = useState<ServiceProduct[] | null>(null);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const busy = useRef(flowOpen);
  busy.current = flowOpen;

  useEffect(() => {
    if (!onPage || !servicesPopupOwed(scope, rest, search)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void loadServices(store?.slug).then((list) => {
      if (!alive) return;
      // Only what can be bought right now: a checker that is out of stock is not news.
      const onSale = list.filter((p) => p.kind === "afa" || p.in_stock);
      if (!onSale.length) { noteNothingOnSale(scope); return; }
      setProducts(onSale);
      timer = setTimeout(() => {
        // Someone already choosing a bundle is left alone, and so is a visit another pop-up reached first: next time.
        if (!alive || busy.current || popupThisVisit(scope) === "other") return;
        notePopupShown(scope, "services");
        markPopupSeen(scope);
        setOpen(true);
      }, POPUP_DELAY_MS);
    }, () => undefined);
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // `search` is read once on arrival (the promo tag); it must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPage, scope, rest, store?.slug]);

  const dismiss = useCallback(() => setOpen(false), []);
  const go = () => { setOpen(false); navigate(`${base}/services`); };

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); dismiss(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); returnTo?.focus?.(); };
  }, [open, dismiss]);

  if (!open || !products) return null;
  const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-5" role="presentation">
      <div className="absolute inset-0 bg-black/60" onClick={dismiss} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="svc-pop-title" aria-describedby="svc-pop-desc"
        className="yg-svc-pop relative w-full max-w-[400px] rounded-t-[28px] bg-card px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-5 text-foreground shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] ring-1 ring-border sm:rounded-[28px] sm:pb-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-primary/[0.14] px-2.5 py-1 text-[12px] font-semibold text-primary-glow">New</span>
          <button type="button" aria-label="Close" onClick={dismiss} className={`-mr-1.5 grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground ${ring}`}><X size={18} /></button>
        </div>
        <h2 id="svc-pop-title" className="mt-3 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em]">Result checkers and MTN AFA registration</h2>
        <p id="svc-pop-desc" className="mt-1.5 text-[14px] leading-6 text-muted-foreground">{store ? `Now available at ${store.name}.` : "Now on DataYego, next to your data."}</p>
        <ul className="mt-4 divide-y divide-border/70 rounded-2xl border border-border bg-background/50 px-4">
          {products.map((p) => (
            <li key={p.code} className="flex items-baseline justify-between gap-4 py-3 text-[14.5px]">
              <span className="min-w-0 font-medium">{p.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{cedis(p.price)}</span>
            </li>
          ))}
        </ul>
        <button type="button" data-autofocus onClick={go} className={`onyx-btn-primary mt-5 w-full py-3.5 text-[15px] ${ring}`}>Open Services</button>
        <button type="button" onClick={dismiss} className={`mt-1 w-full rounded-xl py-2.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground ${ring}`}>Not now</button>
      </div>
    </div>
  );
}
