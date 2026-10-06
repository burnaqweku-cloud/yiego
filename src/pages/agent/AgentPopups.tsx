import { useEffect, useState } from "react";
import { AppWindow, Inbox } from "lucide-react";
import { toast } from "sonner";
import { p1, useAgent } from "@/components/agent/AgentShell";
import Section from "@/components/agent/Section";

/* Parent-only: a pop-up on their store and the form submissions it collects. */
interface Popup { id: string; title: string; body: string | null; image_url: string | null; button_label: string | null; action: "join" | "link" | "form" | "message"; action_url: string | null; frequency: "once" | "daily" | "always"; is_active: boolean }
interface Sub { id: string; name: string | null; phone: string | null; email: string | null; message: string | null; created_at: string }
export default function AgentPopups() {
  const { agent, networkOpen } = useAgent();
  const [popups, setPopups] = useState<Popup[]>([]); const [subs, setSubs] = useState<Sub[]>([]);
  const [f, setF] = useState({ title: "", body: "", button_label: "Learn more", action: "link" as Popup["action"], action_url: "", frequency: "once" as Popup["frequency"] });
  const load = async () => { const [p, s] = await Promise.all([p1().from("store_popups").select("*").order("created_at", { ascending: false }), p1().from("store_form_submissions").select("*").order("created_at", { ascending: false }).limit(200)]); setPopups(p.data ?? []); setSubs(s.data ?? []); };
  useEffect(() => { void load(); }, []);
  const create = async () => {
    if (!f.title.trim()) return toast.error("Give the pop-up a title.");
    if (f.action === "link" && !/^https?:\/\//.test(f.action_url.trim())) return toast.error("Enter a full link starting with https://");
    const { error } = await p1().from("store_popups").insert({ agent_id: agent.id, title: f.title.trim(), body: f.body.trim() || null, button_label: f.button_label.trim() || null, action: f.action, action_url: f.action === "link" ? f.action_url.trim() : null, frequency: f.frequency });
    if (error) return toast.error(error.message.includes("policy") ? "Only agents who recruit agents can add pop-ups." : error.message);
    toast.success("Pop-up is live on your store. Only the newest active pop-up shows."); setF({ ...f, title: "", body: "" }); void load();
  };
  const toggle = async (p: Popup) => { await p1().from("store_popups").update({ is_active: !p.is_active }).eq("id", p.id); void load(); };
  const remove = async (p: Popup) => { if (!window.confirm("Delete this pop-up?")) return; await p1().from("store_popups").delete().eq("id", p.id); void load(); };
  return (
    <div className="space-y-6">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Pop-ups & forms</p><h1 className="font-display text-[24px] font-semibold text-foreground">Catch visitors on your website</h1><p className="mt-1 text-[13px] text-muted-foreground">A pop-up with a button. The button can sign people up as your agents, collect their details in a form, open a link, or just show a message.</p></div>
      <Section page="popups" id="new-pop-up" title="New pop-up" icon={<AppWindow size={15} />} bodyClassName="space-y-3" defaultOpen>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} placeholder="Title, e.g. Earn money selling data" className="onyx-field w-full" />
        <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={3} maxLength={400} placeholder="A sentence or two." className="onyx-field w-full resize-y" />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Button does</span><select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value as Popup["action"], button_label: e.target.value === "join" ? "Join as an agent" : e.target.value === "form" ? "Send my details" : e.target.value === "link" ? "Open" : "Got it" })} className="onyx-field w-full">{networkOpen && <option value="join">Sign up as my agent</option>}<option value="form">Fill a form (name, phone, email, message)</option><option value="link">Open a link / WhatsApp</option><option value="message">Just a message</option></select></label>
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Button label</span><input value={f.button_label} onChange={(e) => setF({ ...f, button_label: e.target.value })} maxLength={30} className="onyx-field w-full" /></label>
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Show</span><select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Popup["frequency"] })} className="onyx-field w-full"><option value="once">Once per visitor</option><option value="daily">Once a day</option><option value="always">Every visit</option></select></label>
        </div>
        {f.action === "link" && <input value={f.action_url} onChange={(e) => setF({ ...f, action_url: e.target.value })} placeholder="https://… or https://wa.me/233…" className="onyx-field w-full" />}
        {f.action === "join" && !agent.network_on && <p className="text-[12px] text-amber">Your agent programme is off; turn it on under Your agents or the button will have nowhere to go.</p>}
        <div className="flex justify-end"><button type="button" onClick={() => void create()} className="onyx-btn-primary px-4 py-2 text-[13px]">Put it on my store</button></div>
      </Section>
      {popups.length > 0 && <Section page="popups" id="your-pop-ups" title="Your pop-ups"><ul className="mt-2 divide-y divide-white/[0.06]">{popups.map((p) => <li key={p.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className={`text-[13.5px] font-semibold ${p.is_active ? "text-foreground" : "text-faint-foreground line-through"}`}>{p.title}</p><p className="text-[12px] text-muted-foreground">{p.body}</p><p className="text-[11px] text-faint-foreground">Button: {p.button_label} → {p.action === "join" ? "sign up as agent" : p.action === "form" ? "form" : p.action === "link" ? p.action_url : "close"} · shows {p.frequency}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><button type="button" onClick={() => void toggle(p)} className="text-[12px] text-foreground">{p.is_active ? "Turn off" : "Turn on"}</button><button type="button" onClick={() => void remove(p)} className="text-[12px] text-faint-foreground">Delete</button></div></li>)}</ul></Section>}
      <Section page="popups" id="form-submissions" title="Form submissions" icon={<Inbox size={15} />}>
        {subs.length === 0 ? <p className="mt-2 text-[13px] text-muted-foreground">Nothing yet. Submissions from your form pop-up land here.</p> : <ul className="mt-2 divide-y divide-white/[0.06]">{subs.map((s) => <li key={s.id} className="py-2.5"><p className="text-[13.5px] font-semibold text-foreground">{s.name || "No name"} <span className="text-[11px] font-normal text-faint-foreground">· {new Date(s.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></p><p className="text-[12px] text-muted-foreground">{[s.phone, s.email].filter(Boolean).join(" · ")}</p>{s.message && <p className="mt-0.5 text-[12.5px] text-foreground">{s.message}</p>}</li>)}</ul>}
      </Section>
    </div>
  );
}
