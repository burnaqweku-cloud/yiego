import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/components/store/StoreShell";
import { storeBase } from "@/lib/storeHost";

/* The store owner's pop-up (parent agents only). Honours once / daily / always per device. */
interface Popup { id: string; title: string; body: string | null; image_url: string | null; button_label: string | null; action: "join" | "link" | "form" | "message"; action_url: string | null; frequency: "once" | "daily" | "always"; delay_seconds?: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
export default function StorePopup() {
  const store = useStore(); const navigate = useNavigate(); const { pathname } = useLocation();
  const base = storeBase(store.slug); const page = pathname.replace(/\/$/, "") === (base || "") ? "home" : pathname.startsWith(`${base}/bundles`) ? "bundles" : "other";
  const [p, setP] = useState<Popup | null>(null); const [form, setForm] = useState(false); const [f, setF] = useState({ name: "", phone: "", email: "", message: "" }); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void p1().rpc("store_popup_for", { p_slug: store.slug, p_page: page }).then((r: { data: Popup | null }) => {
      const pop = r.data; if (!pop || !alive) return;
      const key = `yg-popup:${pop.id}`; const last = Number(localStorage.getItem(key) ?? 0);
      if (pop.frequency === "once" && last) return;
      if (pop.frequency === "daily" && Date.now() - last < 86_400_000) return;
      const t = setTimeout(() => { setP(pop); localStorage.setItem(key, String(Date.now())); void p1().rpc("store_popup_hit", { p_id: pop.id, p_kind: "show" }); }, Math.max(0, Number(pop.delay_seconds ?? 2)) * 1000);
      return () => clearTimeout(t);
    });
    return () => { alive = false; };
  }, [store.slug, page]);
  if (!p) return null;
  const act = () => {
    void p1().rpc("store_popup_hit", { p_id: p.id, p_kind: "click" });
    if (p.action === "join") { setP(null); navigate(`${storeBase(store.slug)}/join`); }
    else if (p.action === "link" && p.action_url) { window.open(p.action_url, "_blank", "noopener"); setP(null); }
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
