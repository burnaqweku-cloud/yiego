import { useEffect, useRef, useState } from "react";
import { AppWindow, Image as ImageIcon, Inbox, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { p1, useAgent } from "@/components/agent/AgentShell";
import Section from "@/components/agent/Section";
import ManagedList from "@/components/agent/ManagedList";

/* Pop-ups on the agent's store and the form submissions they collect. Create, edit, schedule, target pages, see shows/clicks. */
interface Popup { id: string; title: string; body: string | null; image_url: string | null; button_label: string | null; action: "join" | "link" | "form" | "message"; action_url: string | null; frequency: "once" | "daily" | "always"; is_active: boolean; starts_at: string | null; ends_at: string | null; delay_seconds: number; pages: string[]; shows: number; clicks: number; created_at: string }
interface Sub { id: string; name: string | null; phone: string | null; email: string | null; message: string | null; created_at: string; popup_id?: string | null }
type Form = { id?: string; title: string; body: string; button_label: string; action: Popup["action"]; action_url: string; frequency: Popup["frequency"]; image_url: string; starts_at: string; ends_at: string; delay_seconds: number; pages: string[] };
const blank: Form = { title: "", body: "", button_label: "Open", action: "link", action_url: "", frequency: "once", image_url: "", starts_at: "", ends_at: "", delay_seconds: 2, pages: ["all"] };
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

export default function AgentPopups() {
  const { agent, networkOpen } = useAgent();
  const [popups, setPopups] = useState<Popup[]>([]); const [subs, setSubs] = useState<Sub[]>([]);
  const [f, setF] = useState<Form>(blank); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async () => { const [p, s] = await Promise.all([p1().from("store_popups").select("*").order("created_at", { ascending: false }), p1().from("store_form_submissions").select("*").order("created_at", { ascending: false }).limit(500)]); setPopups(p.data ?? []); setSubs(s.data ?? []); };
  useEffect(() => { void load(); }, []);
  const startEdit = (p: Popup) => { setF({ id: p.id, title: p.title, body: p.body ?? "", button_label: p.button_label ?? "", action: p.action, action_url: p.action_url ?? "", frequency: p.frequency, image_url: p.image_url ?? "", starts_at: toLocal(p.starts_at), ends_at: toLocal(p.ends_at), delay_seconds: p.delay_seconds ?? 2, pages: p.pages?.length ? p.pages : ["all"] }); setEditing(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return toast.error("Image under 2 MB please.");
    const path = `${agent.id}/popup-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("store-media").upload(path, file, { upsert: true, contentType: file.type });
    if (error) return toast.error("Upload failed.");
    setF((x) => ({ ...x, image_url: supabase.storage.from("store-media").getPublicUrl(path).data.publicUrl }));
  };
  const save = async () => {
    if (!f.title.trim()) return toast.error("Give the pop-up a title.");
    if (f.action === "link" && !/^https?:\/\//.test(f.action_url.trim())) return toast.error("Enter a full link starting with https://");
    if (f.starts_at && f.ends_at && new Date(f.ends_at) <= new Date(f.starts_at)) return toast.error("End must be after start.");
    setBusy(true);
    const row = { agent_id: agent.id, title: f.title.trim().slice(0, 60), body: f.body.trim().slice(0, 240) || null, button_label: f.button_label.trim().slice(0, 30) || null, action: f.action, action_url: f.action === "link" ? f.action_url.trim() : null, frequency: f.frequency, image_url: f.image_url || null, starts_at: toIso(f.starts_at), ends_at: toIso(f.ends_at), delay_seconds: Math.min(60, Math.max(0, Math.round(f.delay_seconds))), pages: f.pages.length ? f.pages : ["all"], updated_at: new Date().toISOString() };
    const { error } = f.id ? await p1().from("store_popups").update(row).eq("id", f.id) : await p1().from("store_popups").insert(row);
    setBusy(false);
    if (error) return toast.error(error.message.includes("policy") ? "You can't save pop-ups on this account." : error.message);
    toast.success(f.id ? "Pop-up updated." : "Pop-up is live. Only the newest active one shows on each page."); setF(blank); setEditing(false); void load();
  };
  const toggle = async (p: Popup) => { await p1().from("store_popups").update({ is_active: !p.is_active }).eq("id", p.id); void load(); };
  const remove = async (p: Popup) => { if (!window.confirm(`Delete "${p.title}"?`)) return; await p1().from("store_popups").delete().eq("id", p.id); void load(); };
  const togglePage = (pg: string) => setF((x) => { if (pg === "all") return { ...x, pages: ["all"] }; const set = new Set(x.pages.filter((p) => p !== "all")); if (set.has(pg)) set.delete(pg); else set.add(pg); return { ...x, pages: set.size ? [...set] : ["all"] }; });
  const state = (p: Popup) => !p.is_active ? "off" : p.ends_at && new Date(p.ends_at) < new Date() ? "ended" : p.starts_at && new Date(p.starts_at) > new Date() ? "scheduled" : "live";
  const d = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

  return (
    <div className="space-y-6">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Pop-ups & forms</p><h1 className="font-display text-[24px] font-semibold text-foreground">Catch visitors on your website</h1><p className="mt-1 text-[13px] text-muted-foreground">A pop-up with a button: open a link or WhatsApp, collect details in a form{networkOpen ? ", sign people up as your agents" : ""}, or just show a message. Schedule it, pick the pages, see how many saw and tapped it.</p></div>

      <Section page="popups" id="new-pop-up" title={editing ? "Edit pop-up" : "New pop-up"} icon={<AppWindow size={15} />} bodyClassName="space-y-3" defaultOpen>
        <div><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value.slice(0, 60) })} placeholder="Title, e.g. Weekend deal on MTN 5GB" className="onyx-field w-full" /><p className="mt-1 text-right text-[11px] text-faint-foreground">{f.title.length}/60</p></div>
        <div><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value.slice(0, 240) })} rows={3} placeholder="A sentence or two." className="onyx-field w-full resize-y" /><p className="mt-1 text-right text-[11px] text-faint-foreground">{f.body.length}/240</p></div>
        <div className="flex items-center gap-3">{f.image_url ? <img src={f.image_url} alt="" className="h-16 w-24 rounded-xl object-cover" /> : <span className="flex h-16 w-24 items-center justify-center rounded-xl bg-white/[0.04] text-faint-foreground"><ImageIcon size={18} /></span>}<div className="flex gap-2"><button type="button" onClick={() => fileRef.current?.click()} className="rounded-full border border-white/[0.12] px-3 py-1.5 text-[12.5px] text-foreground">{f.image_url ? "Change image" : "Add image"}</button>{f.image_url && <button type="button" onClick={() => setF({ ...f, image_url: "" })} className="text-[12.5px] text-faint-foreground">Remove</button>}</div><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Button does</span><select value={f.action} onChange={(e) => { const a = e.target.value as Popup["action"]; setF({ ...f, action: a, button_label: a === "join" ? "Join as an agent" : a === "form" ? "Send my details" : a === "link" ? "Open" : "Got it" }); }} className="onyx-field w-full">{networkOpen && <option value="join">Sign up as my agent</option>}<option value="form">Fill a form (name, phone, email, message)</option><option value="link">Open a link / WhatsApp</option><option value="message">Just a message</option></select></label>
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Button label</span><input value={f.button_label} onChange={(e) => setF({ ...f, button_label: e.target.value.slice(0, 30) })} className="onyx-field w-full" /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Show</span><select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Popup["frequency"] })} className="onyx-field w-full"><option value="once">Once per visitor</option><option value="daily">Once a day</option><option value="always">Every visit</option></select></label>
        </div>
        {f.action === "link" && <input value={f.action_url} onChange={(e) => setF({ ...f, action_url: e.target.value })} placeholder="https://… or https://wa.me/233…" className="onyx-field w-full" />}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Start (optional)</span><input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} className="onyx-field w-full" /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">End (optional)</span><input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} className="onyx-field w-full" /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Delay before it shows</span><select value={f.delay_seconds} onChange={(e) => setF({ ...f, delay_seconds: Number(e.target.value) })} className="onyx-field w-full">{[0, 2, 5, 10, 20, 30].map((n) => <option key={n} value={n}>{n === 0 ? "Immediately" : `${n} seconds`}</option>)}</select></label>
        </div>
        <div><span className="mb-1 block text-[12px] font-semibold text-foreground">Pages</span><div className="flex flex-wrap gap-2">{[["all", "Whole store"], ["home", "Home"], ["bundles", "Bundles"], ["other", "Other pages"]].map(([id, label]) => <button key={id} type="button" onClick={() => togglePage(id)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${f.pages.includes(id) ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{label}</button>)}</div></div>
        <div className="flex items-center justify-end gap-2">{editing && <button type="button" onClick={() => { setF(blank); setEditing(false); }} className="rounded-full border border-white/[0.12] px-4 py-2 text-[13px] text-foreground">Cancel</button>}<button type="button" disabled={busy} onClick={() => void save()} className="onyx-btn-primary px-4 py-2 text-[13px] disabled:opacity-60">{busy ? "Saving…" : editing ? "Save changes" : "Put it on my store"}</button></div>
      </Section>

      <Section page="popups" id="your-pop-ups" title="Your pop-ups" badge={popups.length ? `${popups.filter((p) => state(p) === "live").length} live` : undefined} defaultOpen>
        <ManagedList items={popups} filters={[{ id: "all", label: "All" }, { id: "live", label: "Live" }, { id: "scheduled", label: "Scheduled" }, { id: "ended", label: "Ended" }, { id: "off", label: "Off" }]} filterOf={state} searchText={(p) => `${p.title} ${p.body ?? ""}`} empty="No pop-ups yet. Create one above; it shows to visitors within seconds."
          render={(p) => (
            <div className="flex items-start gap-3 py-3">
              {p.image_url && <img src={p.image_url} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground"><span className={`truncate ${state(p) === "off" ? "text-faint-foreground line-through" : ""}`}>{p.title}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${state(p) === "live" ? "bg-primary/15 text-primary-glow" : state(p) === "scheduled" ? "bg-amber/15 text-amber" : "bg-white/[0.06] text-muted-foreground"}`}>{state(p)}</span></p>
                {p.body && <p className="line-clamp-2 text-[12px] text-muted-foreground">{p.body}</p>}
                <p className="mt-0.5 text-[11px] text-faint-foreground">{p.button_label} → {p.action === "join" ? "sign up as agent" : p.action === "form" ? "form" : p.action === "link" ? (p.action_url ?? "").replace(/^https?:\/\//, "") : "close"} · {p.frequency} · {p.pages.includes("all") ? "whole store" : p.pages.join(", ")}{p.starts_at ? ` · from ${d(p.starts_at)}` : ""}{p.ends_at ? ` · until ${d(p.ends_at)}` : ""}</p>
                <p className="mt-0.5 text-[11px] text-faint-foreground">{p.shows.toLocaleString()} shown · {p.clicks.toLocaleString()} tapped{p.shows ? ` · ${Math.round((p.clicks / p.shows) * 100)}%` : ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => startEdit(p)} aria-label="Edit" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                <button type="button" onClick={() => void toggle(p)} className="rounded-full border border-white/[0.12] px-2.5 py-1 text-[11.5px] text-foreground">{p.is_active ? "Turn off" : "Turn on"}</button>
                <button type="button" onClick={() => void remove(p)} aria-label="Delete" className="flex h-8 w-8 items-center justify-center rounded-full text-faint-foreground hover:text-danger"><Trash2 size={14} /></button>
              </div>
            </div>
          )} countLabel={(n) => `${n} pop-up${n === 1 ? "" : "s"}`} />
      </Section>

      <Section page="popups" id="form-submissions" title="Form submissions" icon={<Inbox size={15} />} badge={subs.length ? String(subs.length) : undefined}>
        <ManagedList items={subs} searchText={(s) => `${s.name ?? ""} ${s.phone ?? ""} ${s.email ?? ""} ${s.message ?? ""}`} empty="Nothing yet. Submissions from your form pop-up land here."
          render={(s) => <div className="py-2.5"><p className="text-[13.5px] font-semibold text-foreground">{s.name || "No name"} <span className="text-[11px] font-normal text-faint-foreground">· {new Date(s.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></p><p className="text-[12px] text-muted-foreground">{[s.phone, s.email].filter(Boolean).join(" · ")}{s.phone && <a href={`https://wa.me/233${s.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-primary-glow">WhatsApp</a>}</p>{s.message && <p className="mt-0.5 text-[12.5px] text-foreground">{s.message}</p>}</div>}
          countLabel={(n) => `${n} submission${n === 1 ? "" : "s"}`} />
      </Section>
    </div>
  );
}
