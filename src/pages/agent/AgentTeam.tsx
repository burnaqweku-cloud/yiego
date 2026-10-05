import { useEffect, useState } from "react";
import { toast } from "sonner";
import { p1, useAgent } from "@/components/agent/AgentShell";
import Section from "@/components/agent/Section";

/* Support settings and staff. Owner only. Staff see Support, Orders, Customers and the MTN checker; nothing else. */
interface Staff { id: string; email: string; user_id: string | null; invited_at: string; accepted_at: string | null; removed_at: string | null }
export default function AgentTeam() {
  const { agent, reload } = useAgent();
  const [staff, setStaff] = useState<Staff[]>([]); const [email, setEmail] = useState("");
  const [s, setS] = useState({ whatsapp_url: agent.support_whatsapp_url ?? "", whatsapp_on: agent.support_whatsapp_on ?? true, chat_on: agent.support_chat_on ?? true, ai_on: agent.support_ai_on ?? true });
  const load = async () => { const { data } = await p1().from("agent_staff").select("*").is("removed_at", null).order("invited_at"); setStaff(data ?? []); };
  useEffect(() => { void load(); }, []);
  const add = async () => { if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Enter a valid email."); const { error } = await p1().rpc("agent_add_staff", { p_email: email.trim() }); if (error) return toast.error(error.message.includes("limit_5") ? "Up to 5 staff." : error.message.includes("is_an_agent") ? "That person runs their own store." : error.message.replace(/_/g, " ")); setEmail(""); toast.success("Added. They sign in at datayego.com/agent with that email."); void load(); };
  const remove = async (id: string) => { if (!window.confirm("Remove this person from your team?")) return; await p1().rpc("agent_remove_staff", { p_id: id }); void load(); };
  const saveSupport = async () => { const { error } = await p1().rpc("agent_set_support", { p: { support_whatsapp_url: s.whatsapp_url, support_whatsapp_on: s.whatsapp_on, support_chat_on: s.chat_on, support_ai_on: s.ai_on } }); if (error) return toast.error("Couldn't save."); toast.success("Support settings saved."); void reload(); };
  return (
    <div className="space-y-6">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Support & team</p><h1 className="font-display text-[24px] font-semibold text-foreground">How customers reach you</h1></div>
      <Section page="team" id="buttons-on-your-store" title="Buttons on your store" bodyClassName="space-y-4" defaultOpen>
        <label className="flex items-start justify-between gap-3"><span><span className="block text-[13.5px] font-semibold text-foreground">WhatsApp button</span><span className="block text-[12px] text-muted-foreground">Opens whatever link you put below: your number, a group, or a channel.</span></span><input type="checkbox" checked={s.whatsapp_on} onChange={(e) => setS({ ...s, whatsapp_on: e.target.checked })} className="mt-1 h-5 w-5" /></label>
        <input value={s.whatsapp_url} onChange={(e) => setS({ ...s, whatsapp_url: e.target.value })} placeholder={`https://wa.me/233${(agent.whatsapp ?? "").replace(/\D/g, "").replace(/^0/, "") || "XXXXXXXXX"} or a group / channel link`} className="onyx-field w-full" />
        <p className="-mt-2 text-[11.5px] text-faint-foreground">Leave empty to use your WhatsApp number from Store settings.</p>
        <label className="flex items-start justify-between gap-3"><span><span className="block text-[13.5px] font-semibold text-foreground">Chat button</span><span className="block text-[12px] text-muted-foreground">Customers message you on the store. Replies land in Support.</span></span><input type="checkbox" checked={s.chat_on} onChange={(e) => setS({ ...s, chat_on: e.target.checked })} className="mt-1 h-5 w-5" /></label>
        <label className="flex items-start justify-between gap-3"><span><span className="block text-[13.5px] font-semibold text-foreground">Assistant answers first</span><span className="block text-[12px] text-muted-foreground">Instant replies about prices, delivery and orders. Hands over to you for anything about money, or when asked.</span></span><input type="checkbox" checked={s.ai_on} onChange={(e) => setS({ ...s, ai_on: e.target.checked })} className="mt-1 h-5 w-5" /></label>
        <div className="flex justify-end"><button type="button" onClick={() => void saveSupport()} className="onyx-btn-primary px-4 py-2 text-[13px]">Save</button></div>
      </Section>
      <Section page="team" id="team" title="Team" subtitle="Staff can answer Support, see Orders and Customers, and check MTN numbers. They can't see earnings, prices, settings or withdraw money. Up to 5.">
        <div className="mt-3 flex gap-2"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Their email" autoCapitalize="none" className="onyx-field flex-1" /><button type="button" onClick={() => void add()} className="onyx-btn-primary px-4 py-2 text-[13px]">Add</button></div>
        <p className="mt-2 text-[11.5px] text-faint-foreground">They need a DataYego account with that email (free to create), then they sign in at datayego.com/agent.</p>
        {staff.length > 0 && <ul className="mt-3 divide-y divide-white/[0.06]">{staff.map((m) => <li key={m.id} className="flex items-center justify-between gap-3 py-2.5"><span><span className="block text-[13.5px] text-foreground">{m.email}</span><span className="block text-[11.5px] text-faint-foreground">{m.accepted_at ? `Active since ${new Date(m.accepted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Invited, not signed in yet"}</span></span><button type="button" onClick={() => void remove(m.id)} className="text-[12px] text-danger">Remove</button></li>)}</ul>}
      </Section>
    </div>
  );
}
