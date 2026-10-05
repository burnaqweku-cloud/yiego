import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { p1, useAgent } from "@/components/agent/AgentShell";
import { DEFAULT_FAQ } from "@/pages/store/StoreFaq";
import Section from "@/components/agent/Section";
import { LayoutTemplate, Palette, Info, Star, HelpCircle } from "lucide-react";

/* Everything an agent controls about how their store looks and reads. Saves through
   agent_update_branding, which only ever touches the agent's own row. */
const inputCls = "onyx-field w-full";
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">{label}</span>{children}{hint && <span className="mt-1 block text-[11.5px] text-faint-foreground">{hint}</span>}</label>;
const SOCIALS: Array<[string, string, string]> = [["facebook", "Facebook", "https://facebook.com/yourpage"], ["instagram", "Instagram", "https://instagram.com/yourname"], ["tiktok", "TikTok", "https://tiktok.com/@yourname"], ["telegram", "Telegram", "https://t.me/yourname"]];

export default function StoreBrandingEditor() {
  const { agent, products, reload } = useAgent();
  const [f, setF] = useState({ accent_color: agent.accent_color ?? "", about_text: agent.about_text ?? "", hours_text: agent.hours_text ?? "", store_notice: agent.store_notice ?? "", contact_phone: agent.contact_phone ?? "", socials: { ...(agent.socials ?? {}) } as Record<string, string>, featured: [...(agent.featured_product_ids ?? [])], faq: (agent.faq?.length ? agent.faq : DEFAULT_FAQ(agent.store_name)).map((x) => ({ ...x })) });
  const [logo, setLogo] = useState(agent.logo_url ?? ""); const [banner, setBanner] = useState(agent.banner_url ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setLogo(agent.logo_url ?? ""); setBanner(agent.banner_url ?? ""); }, [agent.logo_url, agent.banner_url]);
  const active = useMemo(() => products.filter((p) => !p.is_paused), [products]);

  const upload = async (kind: "logo" | "banner", file: File) => {
    if (file.size > 3 * 1024 * 1024) return toast.error("Image must be under 3 MB.");
    setBusy(kind);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${agent.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-media").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { setBusy(null); return toast.error("Upload failed: " + error.message); }
    const url = supabase.storage.from("store-media").getPublicUrl(path).data.publicUrl;
    const { error: e2 } = await p1().rpc("agent_update_branding", { p: kind === "logo" ? { logo_url: url } : { banner_url: url } });
    setBusy(null);
    if (e2) return toast.error(e2.message.replace(/_/g, " "));
    if (kind === "logo") setLogo(url); else setBanner(url);
    toast.success(kind === "logo" ? "Logo updated." : "Banner updated."); void reload();
  };
  const clear = async (kind: "logo" | "banner") => {
    const { error } = await p1().rpc("agent_update_branding", { p: kind === "logo" ? { logo_url: "" } : { banner_url: "" } });
    if (error) return toast.error(error.message.replace(/_/g, " "));
    if (kind === "logo") setLogo(""); else setBanner(""); void reload();
  };
  const save = async () => {
    setBusy("save");
    const { error } = await p1().rpc("agent_update_branding", { p: { accent_color: f.accent_color, about_text: f.about_text, hours_text: f.hours_text, store_notice: f.store_notice, contact_phone: f.contact_phone, socials: f.socials, featured_product_ids: f.featured, faq: f.faq.filter((x) => x.q.trim()) } });
    setBusy(null);
    if (error) return toast.error(error.message.replace(/_/g, " "));
    toast.success("Store updated."); void reload();
  };
  const SaveBtn = () => <div className="mt-4 flex justify-end"><button type="button" disabled={busy === "save"} onClick={() => void save()} className="onyx-btn-primary px-5 py-2.5 text-[13.5px] disabled:opacity-60">{busy === "save" ? "Saving…" : "Save"}</button></div>;
  const toggleFeatured = (id: string) => setF((s) => ({ ...s, featured: s.featured.includes(id) ? s.featured.filter((x) => x !== id) : s.featured.length >= 6 ? s.featured : [...s.featured, id] }));

  const [template, setTemplate] = useState<string>(agent.template ?? "classic");
  const pickTemplate = async (t: string) => {
    setTemplate(t);
    const { error } = await p1().rpc("agent_update_branding", { p: { template: t } });
    if (error) { toast.error(error.message.replace(/_/g, " ")); setTemplate(agent.template ?? "classic"); return; }
    toast.success(`Store switched to ${t === "market" ? "Market" : t === "studio" ? "Studio" : "Classic"}.`); void reload();
  };
  return (
    <div className="space-y-3">
      <Section page="store" id="template" title="Template" icon={<LayoutTemplate size={15} />} badge={template === "market" ? "Market" : template === "studio" ? "Studio" : "Classic"} subtitle="Three different designs. Switch any time; your bundles, prices and pages stay the same.">
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            { id: "classic", name: "Classic", blurb: "Dark, green, card grid. The look you have today.", preview: <div className="h-24 rounded-xl bg-[#0b1512] p-2"><div className="h-3 w-1/2 rounded bg-[#22c387]/70" /><div className="mt-2 grid grid-cols-3 gap-1"><div className="h-9 rounded bg-white/10" /><div className="h-9 rounded bg-white/10" /><div className="h-9 rounded bg-white/10" /></div></div> },
            { id: "market", name: "Market", blurb: "A painted kiosk signboard with sticker prices. Loud and friendly.", preview: <div className="h-24 rounded-xl bg-[#fff8ec] p-2"><div className="h-8 rounded-md bg-[#1d2460] shadow-[3px_3px_0_#ff5a3c]" /><div className="mt-2 flex items-center gap-1 rounded-md border-2 border-[#1d2460] bg-white p-1"><div className="h-5 w-7 -rotate-2 rounded bg-[#ffd23f]" /><div className="h-2 flex-1 rounded bg-[#1d2460]/20" /><div className="h-3 w-8 rounded bg-[#ff5a3c]" /></div></div> },
            { id: "studio", name: "Studio", blurb: "A clean white company website: top navigation, big headline, Buy button, price list, footer.", preview: <div className="h-24 rounded-xl border border-[#e5e9f0] bg-white p-2"><div className="flex items-center justify-between"><div className="h-2 w-10 rounded bg-[#0f172a]" /><div className="flex gap-1"><div className="h-2 w-6 rounded bg-[#cbd5e1]" /><div className="h-2 w-6 rounded bg-[#cbd5e1]" /><div className="h-3 w-9 rounded bg-[#2563eb]" /></div></div><div className="mt-3 h-3 w-3/4 rounded bg-[#0f172a]" /><div className="mt-1 h-3 w-1/2 rounded bg-[#0f172a]" /><div className="mt-2 flex gap-1"><div className="h-4 w-12 rounded bg-[#2563eb]" /><div className="h-4 w-12 rounded border border-[#e5e9f0]" /></div></div> },
          ] as Array<{ id: string; name: string; blurb: string; preview: React.ReactNode }>).map((t) => (
            <button key={t.id} type="button" onClick={() => void pickTemplate(t.id)} className={`rounded-2xl border p-2 text-left transition ${template === t.id ? "border-primary-glow/50 ring-1 ring-primary-glow/30" : "border-white/[0.08] hover:border-white/[0.2]"}`}>
              {t.preview}
              <p className="mt-2 flex items-center justify-between px-1 text-[13px] font-semibold text-foreground">{t.name}{template === t.id && <span className="text-[11px] font-medium text-primary-glow">In use</span>}</p>
              <p className="px-1 pb-1 text-[11.5px] leading-4 text-faint-foreground">{t.blurb}</p>
            </button>
          ))}
        </div>
      </Section>
      <Section page="store" id="look" title="Look" icon={<Palette size={15} />} subtitle="Logo, banner, accent colour and the notice line.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="mb-1 text-[12px] font-semibold text-foreground">Logo</p><div className="flex items-center gap-3">{logo ? <img src={logo} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-[20px] font-semibold text-primary-glow">{agent.store_name.slice(0, 1)}</span>}<label className="cursor-pointer rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-[12.5px] text-foreground"><ImagePlus size={14} className="mr-1 inline" />{busy === "logo" ? "Uploading…" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload("logo", file); e.target.value = ""; }} /></label>{logo && <button type="button" onClick={() => void clear("logo")} className="text-faint-foreground" aria-label="Remove logo"><Trash2 size={15} /></button>}</div><p className="mt-1 text-[11.5px] text-faint-foreground">Square, at least 256×256.</p></div>
          <div><p className="mb-1 text-[12px] font-semibold text-foreground">Banner</p>{banner ? <img src={banner} alt="" className="h-24 w-full rounded-xl object-cover" /> : <div className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-white/[0.12] text-[12px] text-faint-foreground">No banner yet</div>}<div className="mt-2 flex items-center gap-2"><label className="cursor-pointer rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-[12.5px] text-foreground"><ImagePlus size={14} className="mr-1 inline" />{busy === "banner" ? "Uploading…" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload("banner", file); e.target.value = ""; }} /></label>{banner && <button type="button" onClick={() => void clear("banner")} className="text-faint-foreground" aria-label="Remove banner"><Trash2 size={15} /></button>}</div><p className="mt-1 text-[11.5px] text-faint-foreground">Wide, about 1200×400.</p></div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Accent colour" hint="Buttons and highlights on your store."><div className="flex items-center gap-2"><input type="color" value={f.accent_color || "#22c387"} onChange={(e) => setF({ ...f, accent_color: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-white/[0.1] bg-transparent" /><input value={f.accent_color} onChange={(e) => setF({ ...f, accent_color: e.target.value })} placeholder="#22c387" className={inputCls} /></div></Field>
          <Field label="Store notice" hint="One line shown at the top of every page. Leave empty to hide."><input value={f.store_notice} onChange={(e) => setF({ ...f, store_notice: e.target.value })} maxLength={200} placeholder="e.g. MTN orders may take longer today" className={inputCls} /></Field>
        </div>
        <SaveBtn />
      </Section>
      <Section page="store" id="about" title="About & contact" icon={<Info size={15} />} subtitle="Your story, opening hours, phone and social links.">
        <div className="space-y-4">
          <Field label="About your store" hint="Shown on your About page."><textarea value={f.about_text} onChange={(e) => setF({ ...f, about_text: e.target.value })} rows={5} maxLength={1200} placeholder={`Tell customers who you are, where you are, and why they should buy from ${agent.store_name}.`} className={`${inputCls} resize-y`} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opening hours" hint="e.g. Mon–Sat 7am–10pm"><input value={f.hours_text} onChange={(e) => setF({ ...f, hours_text: e.target.value })} maxLength={160} className={inputCls} /></Field>
            <Field label="Phone for calls" hint="Optional, if different from WhatsApp."><input value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} inputMode="tel" className={inputCls} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">{SOCIALS.map(([k, label, ph]) => <Field key={k} label={label}><input value={f.socials[k] ?? ""} onChange={(e) => setF({ ...f, socials: { ...f.socials, [k]: e.target.value } })} placeholder={ph} className={inputCls} /></Field>)}</div>
        </div>
        <SaveBtn />
      </Section>
      <Section page="store" id="featured" title="Featured bundles" icon={<Star size={15} />} badge={f.featured.length ? `${f.featured.length} picked` : undefined} subtitle="Pick up to 6 to show first on your store.">
        <div className="flex flex-wrap gap-2">{active.map((p) => { const on = f.featured.includes(p.id); return <button key={p.id} type="button" onClick={() => toggleFeatured(p.id)} className={`rounded-full border px-3 py-1.5 text-[12.5px] ${on ? "border-primary-glow/40 bg-primary/15 text-primary-glow" : "border-white/[0.1] text-muted-foreground"}`}>{p.name.replace(" Data — ", " ")}</button>; })}</div>
        <SaveBtn />
      </Section>
      <Section page="store" id="faq" title="FAQ" icon={<HelpCircle size={15} />} badge={`${f.faq.filter((x) => x.q.trim()).length} questions`} subtitle="Edit the standard questions or add your own. Up to 12.">
        <div className="space-y-3">{f.faq.map((x, i) => <div key={i} className="rounded-xl border border-white/[0.07] p-3"><input value={x.q} onChange={(e) => setF({ ...f, faq: f.faq.map((y, j) => j === i ? { ...y, q: e.target.value } : y) })} maxLength={160} placeholder="Question" className={`${inputCls} font-semibold`} /><textarea value={x.a} onChange={(e) => setF({ ...f, faq: f.faq.map((y, j) => j === i ? { ...y, a: e.target.value } : y) })} rows={2} maxLength={600} placeholder="Answer" className={`${inputCls} mt-2 resize-y`} /><button type="button" onClick={() => setF({ ...f, faq: f.faq.filter((_, j) => j !== i) })} className="mt-1 text-[12px] text-faint-foreground">Remove</button></div>)}
          {f.faq.length < 12 && <button type="button" onClick={() => setF({ ...f, faq: [...f.faq, { q: "", a: "" }] })} className="text-[13px] font-semibold text-primary-glow">+ Add a question</button>}</div>
        <SaveBtn />
      </Section>
    </div>
  );
}
