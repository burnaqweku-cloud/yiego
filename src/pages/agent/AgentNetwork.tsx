import { useEffect, useState } from "react";
import { Copy, Network as NetIcon, Ticket, Megaphone, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { p1, useAgent } from "@/components/agent/AgentShell";
import Section from "@/components/agent/Section";
import { formatGHS } from "@/lib/format";

/* Parent agents: recruit agents under them. Fee, pitch, invite link, their agents, coupons, announcements, read-only support. */
interface Sub { id: string; slug: string; store_name: string; status: string; paid_until: string | null; created_at: string; whatsapp: string | null; orders: number; sales: number; my_margin: number; fees_paid: number }
interface Net { agents: Sub[]; totals: { agents: number; active: number; sales: number; my_margin: number; fee_income: number } }
interface Coupon { id: string; code: string; percent_off: number; max_uses: number | null; uses: number; expires_at: string | null; is_active: boolean }
interface Conv { id: string; status: string; mode: string; name: string; last_message_at: string; messages: Array<{ sender: string; body: string; created_at: string }> }

export default function AgentNetwork() {
  const { agent, reload, storeUrl } = useAgent();
  const [on, setOn] = useState(agent.network_on ?? false); const [fee, setFee] = useState(String(agent.network_fee ?? 0)); const [pitch, setPitch] = useState(agent.network_pitch ?? "");
  const [net, setNet] = useState<Net | null>(null); const [coupons, setCoupons] = useState<Coupon[]>([]); const [code, setCode] = useState(""); const [pct, setPct] = useState("20"); const [maxUses, setMaxUses] = useState("");
  const [annTitle, setAnnTitle] = useState(""); const [annBody, setAnnBody] = useState(""); const [anns, setAnns] = useState<Array<{ id: string; title: string; body: string; created_at: string }>>([]);
  const [peek, setPeek] = useState<Sub | null>(null); const [convs, setConvs] = useState<Conv[] | null>(null);
  const load = async () => { const [n, c, a] = await Promise.all([p1().rpc("my_network", {}), p1().from("network_coupons").select("*").order("created_at", { ascending: false }), p1().from("network_announcements").select("*").order("created_at", { ascending: false }).limit(20)]); setNet(n.data as Net); setCoupons(c.data ?? []); setAnns(a.data ?? []); };
  useEffect(() => { void load(); }, []);
  const save = async () => { const { error } = await p1().rpc("agent_set_network", { p: { network_on: on, network_fee: Number(fee) || 0, network_pitch: pitch } }); if (error) return toast.error(error.message.replace(/_/g, " ")); toast.success(on ? "Your agent programme is open." : "Agent programme closed to new sign-ups."); void reload(); };
  const joinUrl = `${storeUrl}/join`;
  const addCoupon = async () => { const c = code.trim().toUpperCase(); const p = Number(pct); if (!/^[A-Z0-9]{3,20}$/.test(c) || !(p >= 1 && p <= 100)) return toast.error("Code: letters and numbers. Percent: 1 to 100."); const { error } = await p1().from("network_coupons").insert({ agent_id: agent.id, code: c, percent_off: p, max_uses: maxUses ? Number(maxUses) : null }); if (error) return toast.error(error.message.includes("unique") ? "You already have that code." : error.message); setCode(""); toast.success(`Coupon ${c} created.`); void load(); };
  const toggleCoupon = async (c: Coupon) => { await p1().from("network_coupons").update({ is_active: !c.is_active }).eq("id", c.id); void load(); };
  const postAnn = async () => { if (!annTitle.trim() || !annBody.trim()) return; const { error } = await p1().from("network_announcements").insert({ agent_id: agent.id, title: annTitle.trim(), body: annBody.trim() }); if (error) return toast.error("Couldn't post."); setAnnTitle(""); setAnnBody(""); toast.success("Posted to your agents."); void load(); };
  const openPeek = async (s: Sub) => { setPeek(s); setConvs(null); const { data } = await p1().rpc("network_inbox", { p_sub: s.id }); setConvs((data as Conv[]) ?? []); };
  const d = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
  return (
    <div className="space-y-6">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Your agents</p><h1 className="font-display text-[24px] font-semibold text-foreground">Build your own network</h1><p className="mt-1 text-[13px] text-muted-foreground">People sign up on your store, pay you a monthly fee you choose (or nothing), and get their own store. They buy at your prices; you earn on every bundle they sell.</p></div>

      <Section page="network" id="programme" title="Programme" icon={<NetIcon size={15} />} bodyClassName="space-y-4" defaultOpen>
        <label className="flex items-start justify-between gap-3"><span><span className="block text-[13.5px] font-semibold text-foreground">Accept agents</span><span className="block text-[12px] text-muted-foreground">Shows a Join page on your store and lets people sign up.</span></span><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="mt-1 h-5 w-5" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Monthly fee (GHS)</span><input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="onyx-field w-full" /><span className="mt-1 block text-[11.5px] text-faint-foreground">Paid to you every month. 0 makes it free. All of it is yours.</span></label>
          <div className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Invite link</span><div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5"><span className="truncate text-[13px] text-foreground">{joinUrl.replace("https://", "")}</span><button type="button" onClick={() => { void navigator.clipboard.writeText(joinUrl); toast.success("Copied."); }} className="ml-auto text-faint-foreground" aria-label="Copy"><Copy size={14} /></button></div><span className="mt-1 block text-[11.5px] text-faint-foreground">Also works: datayego.com/s/{agent.slug}/join. Both links are free; share whichever you like.</span></div>
        </div>
        <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Your pitch</span><textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={4} maxLength={1500} placeholder="Why should someone sell data under you? What do they get, how do they earn, how do you support them?" className="onyx-field w-full resize-y" /></label>
        <div className="flex justify-end"><button type="button" onClick={() => void save()} className="onyx-btn-primary px-4 py-2 text-[13px]">Save</button></div>
      </Section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Agents", net ? `${net.totals.active}/${net.totals.agents}` : "…"], ["Their sales", net ? formatGHS(Number(net.totals.sales)) : "…"], ["Your margin on them", net ? formatGHS(Number(net.totals.my_margin)) : "…"], ["Fees received", net ? formatGHS(Number(net.totals.fee_income)) : "…"]].map(([l, v]) => <div key={l} className="onyx-panel rounded-2xl p-3 text-center"><p className="text-[17px] font-semibold tabular-nums text-foreground">{v}</p><p className="text-[11px] text-faint-foreground">{l}</p></div>)}
      </div>

      <Section page="network" id="agents" title="Agents">
        {!net ? <p className="mt-2 text-[13px] text-muted-foreground">Loading…</p> : net.agents.length === 0 ? <p className="mt-2 text-[13px] text-muted-foreground">No agents yet. Share your invite link.</p> : (
          <ul className="mt-2 divide-y divide-white/[0.06]">{net.agents.map((s) => <li key={s.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-[13.5px] font-semibold text-foreground">{s.store_name} <span className={`ml-1 rounded-full px-2 py-0.5 text-[10.5px] ${s.status === "active" ? "bg-primary/15 text-primary-glow" : "bg-amber/15 text-amber"}`}>{s.status === "awaiting_payment" ? "not paid yet" : s.status}</span></p><p className="text-[11.5px] text-faint-foreground">{s.slug}.datayego.com{s.whatsapp ? ` · ${s.whatsapp}` : ""} · joined {d(s.created_at)}{s.paid_until && s.status === "active" ? ` · paid to ${d(s.paid_until)}` : ""}</p><p className="text-[11.5px] text-faint-foreground">{s.orders} orders · sales {formatGHS(Number(s.sales))} · your margin {formatGHS(Number(s.my_margin))} · fees {formatGHS(Number(s.fees_paid))}</p></div><button type="button" onClick={() => void openPeek(s)} className="shrink-0 rounded-full border border-white/[0.12] px-2.5 py-1 text-[11.5px] text-foreground"><MessagesSquare size={12} className="mr-1 inline" />Support</button></li>)}</ul>
        )}
      </Section>

      <Section page="network" id="coupons-on-your-fee" title="Coupons on your fee" icon={<Ticket size={15} />} subtitle="Codes you hand out; new agents type them when paying your fee.">
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_110px_110px_auto]"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" className="onyx-field" /><input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" placeholder="% off" className="onyx-field" /><input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} inputMode="numeric" placeholder="Max uses" className="onyx-field" /><button type="button" onClick={() => void addCoupon()} className="onyx-btn-primary px-4 py-2 text-[13px]">Create</button></div>
        {coupons.length > 0 && <ul className="mt-3 divide-y divide-white/[0.06]">{coupons.map((c) => <li key={c.id} className="flex items-center justify-between gap-3 py-2.5"><span><span className={`block text-[13.5px] font-semibold ${c.is_active ? "text-foreground" : "text-faint-foreground line-through"}`}>{c.code} · {c.percent_off}% off</span><span className="block text-[11.5px] text-faint-foreground">used {c.uses}{c.max_uses ? ` of ${c.max_uses}` : ""}</span></span><button type="button" onClick={() => void toggleCoupon(c)} className="text-[12px] text-faint-foreground">{c.is_active ? "Disable" : "Enable"}</button></li>)}</ul>}
      </Section>

      <Section page="network" id="message-your-agents" title="Message your agents" icon={<Megaphone size={15} />}>
        <div className="mt-3 space-y-2"><input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} maxLength={80} placeholder="Title" className="onyx-field w-full" /><textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} rows={3} maxLength={1000} placeholder="Shows on your agents' dashboards." className="onyx-field w-full resize-y" /><div className="flex justify-end"><button type="button" onClick={() => void postAnn()} className="onyx-btn-primary px-4 py-2 text-[13px]">Post</button></div></div>
        {anns.length > 0 && <ul className="mt-3 divide-y divide-white/[0.06]">{anns.map((a) => <li key={a.id} className="py-2.5"><p className="text-[13.5px] font-semibold text-foreground">{a.title}</p><p className="text-[12.5px] text-muted-foreground">{a.body}</p><p className="text-[11px] text-faint-foreground">{d(a.created_at)}</p></li>)}</ul>}
      </Section>

      {peek && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setPeek(null)}>
          <div className="onyx-panel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-foreground">{peek.store_name}: support chats</h3><p className="text-[11.5px] text-faint-foreground">Read-only. Your agent answers their own customers.</p>
            {convs === null ? <p className="mt-3 text-[13px] text-muted-foreground">Loading…</p> : convs.length === 0 ? <p className="mt-3 text-[13px] text-muted-foreground">No conversations yet.</p> : convs.map((c) => <details key={c.id} className="mt-3 rounded-xl border border-white/[0.07] p-3"><summary className="cursor-pointer text-[13.5px] font-semibold text-foreground">{c.name} <span className="text-[11px] font-normal text-faint-foreground">· {c.status} · {d(c.last_message_at)}</span></summary><ul className="mt-2 space-y-1.5">{c.messages.map((m, i) => <li key={i} className={`text-[12.5px] ${m.sender === "customer" ? "text-foreground" : "text-muted-foreground"}`}><b>{m.sender === "customer" ? c.name : m.sender === "ai" ? "assistant" : m.sender === "agent" ? peek.store_name : ""}:</b> {m.body}</li>)}</ul></details>)}
          </div>
        </div>
      )}
    </div>
  );
}
