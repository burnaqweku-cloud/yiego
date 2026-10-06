import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/components/store/StoreShell";
import { storeBase } from "@/lib/storeHost";
import { useAuth } from "@/store/auth-context";

/* The store owner's pop-up.
   - once: one time per device; daily: once a day; always: once per visit (not on every page).
   - Never on sign-in, sign-up, account, tracking or payment pages, nor on the page its own button leads to.
   - After someone taps the button, it doesn't come back during that visit.
   - A pop-up that leads to sign-up / sign-in is not shown to customers who are already signed in.
   - A button that points to this store opens in the same tab; other websites open in a new tab. */
const QUIET = ["/sign-in", "/sign-up", "/account", "/track", "/success"];
const seenThisVisit = (id: string) => { try { return sessionStorage.getItem(`yg-popup-seen:${id}`) === "1"; } catch { return false; } };
const markSeen = (id: string) => { try { sessionStorage.setItem(`yg-popup-seen:${id}`, "1"); } catch { /* ignore */ } };
interface Popup { id: string; title: string; body: string | null; image_url: string | null; button_label: string | null; action: "join" | "link" | "form" | "message"; action_url: string | null; frequency: "once" | "daily" | "always"; delay_seconds?: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
/** "/sign-up" style path inside this store if the link points to this store, else null. */
function inStorePath(url: string | null, slug: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, window.location.href);
    const here = window.location.host.toLowerCase();
    const host = u.host.toLowerCase();
    const sub = `${slug}.datayego.com`;
    let path = u.pathname;
    const mainSite = (host === "datayego.com" || host === "www.datayego.com") && (path === `/s/${slug}` || path.startsWith(`/s/${slug}/`));
    if (host === here || host === sub || host === `www.${sub}` || mainSite) {
      const m = path.match(/^\/s\/[^/]+(\/.*)?$/);
      if (m) path = m[1] ?? "/";
      return (path.replace(/\/$/, "") || "/") + u.search + u.hash;
    }
  } catch { /* not a URL */ }
  return null;
}
export default function StorePopup() {
  const store = useStore(); const navigate = useNavigate(); const { pathname } = useLocation(); const { isAuthenticated } = useAuth();
  const base = storeBase(store.slug); const page = pathname.replace(/\/$/, "") === (base || "") ? "home" : pathname.startsWith(`${base}/bundles`) ? "bundles" : "other";
  const [p, setP] = useState<Popup | null>(null); const [form, setForm] = useState(false); const [f, setF] = useState({ name: "", phone: "", email: "", message: "" }); const [busy, setBusy] = useState(false);
  const rest = (pathname.startsWith(`${base}/`) || pathname === base ? pathname.slice(base.length) : pathname).replace(/\/$/, "") || "/";
  const quiet = QUIET.some((q) => rest === q || rest.startsWith(`${q}/`));
  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | null = null;
    if (quiet) { setP(null); return; }
    void p1().rpc("store_popup_for", { p_slug: store.slug, p_page: page }).then((r: { data: Popup | null }) => {
      const pop = r.data; if (!pop || !alive) return;
      if (seenThisVisit(pop.id)) return;
      const key = `yg-popup:${pop.id}`; const last = Number(localStorage.getItem(key) ?? 0);
      if (pop.frequency === "once" && last) return;
      if (pop.frequency === "daily" && Date.now() - last < 86_400_000) return;
      const target = pop.action === "link" ? inStorePath(pop.action_url, store.slug) : pop.action === "join" ? "/join" : null;
      const targetPath = target ? target.split(/[?#]/)[0] : null;
      if (targetPath && targetPath === rest) return;
      if (isAuthenticated && targetPath && /^\/(sign-up|sign-in)$/.test(targetPath)) return;
      t = setTimeout(() => {
        if (!alive) return;
        setP(pop); markSeen(pop.id); localStorage.setItem(key, String(Date.now()));
        void p1().rpc("store_popup_hit", { p_id: pop.id, p_kind: "show" }).then(() => undefined);
      }, Math.max(0, Number(pop.delay_seconds ?? 2)) * 1000);
    });
    return () => { alive = false; if (t) clearTimeout(t); };
  }, [store.slug, page, quiet, rest, isAuthenticated]);
  if (!p) return null;
  const act = () => {
    void p1().rpc("store_popup_hit", { p_id: p.id, p_kind: "click" }).then(() => undefined);
    markSeen(p.id);
    if (p.action === "join") { setP(null); navigate(`${storeBase(store.slug)}/join`); }
    else if (p.action === "link" && p.action_url) {
      const inside = inStorePath(p.action_url, store.slug);
      setP(null);
      if (inside) navigate(`${base}${inside === "/" ? "" : inside}` || "/");
      else window.open(p.action_url, "_blank", "noopener");
    }
    else if (p.action === "form") setForm(true);
    else setP(null);
  };
  const submit = async () => {
    if (!f.name.trim() || !/^0\d{9}$/.test(f.phone.replace(/\D/g, ""))) return toast.error("Your name and a valid phone number.");
    setBusy(true); const { error } = await p1().rpc("store_form_submit", { p_slug: store.slug, p_popup: p.id, p_name: f.name, p_phone: f.phone.replace(/\D/g, ""), p_email: f.email || null, p_message: f.message || null }); setBusy(false);
    if (error) return toast.error("Couldn't send. Try again.");
    toast.success(`Sent to ${store.store_name}.`); setP(null);
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setP(null)}>
      <div className="onyx-panel w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><h3 className="font-display text-[20px] font-semibold text-foreground">{p.title}</h3><button type="button" onClick={() => setP(null)} aria-label="Close" className="text-muted-foreground"><X size={18} /></button></div>
        {p.image_url && <img src={p.image_url} alt="" className="mt-3 h-36 w-full rounded-2xl object-cover" />}
        {p.body && <p className="mt-2 whitespace-pre-line text-[14px] leading-6 text-muted-foreground">{p.body}</p>}
        {!form ? <button type="button" onClick={act} className="onyx-btn-primary mt-4 w-full py-3 text-[14px]">{p.button_label || "Continue"}</button> : (
          <div className="mt-4 space-y-2">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Your name" className="onyx-field w-full" />
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" placeholder="Phone number" className="onyx-field w-full" />
            <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" placeholder="Email (optional)" className="onyx-field w-full" />
            <textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={2} placeholder="Message (optional)" className="onyx-field w-full resize-y" />
            <button type="button" disabled={busy} onClick={() => void submit()} className="onyx-btn-primary w-full py-3 text-[14px] disabled:opacity-60">{busy ? "Sending…" : p.button_label || "Send"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
