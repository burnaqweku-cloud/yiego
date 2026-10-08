import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, MessageCircleQuestion, RefreshCw, Search, Store, UserRound, X } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { assistantHtml } from "@/lib/assistantMarkdown";

/* Admin → Support → Agent assistant: everything agents ask their Store assistant. Who uses it,
   what they ask, which tools it reaches for, and every transcript. Read-only oversight. */
interface Overview { questions_today: number; questions_period: number; agents_period: number; agents_total: number; tools: Record<string, number>; by_agent: Array<{ agent_id: string; store: string; slug: string; questions: number; last_at: string }>; recent_questions: Array<{ at: string; store: string; q: string; conversation_id: string }> }
interface Thread { id: string; agent_id: string; agent: string; slug: string; title: string | null; last_at: string; preview: string | null; messages: number }
interface Msg { id: string; sender: "agent" | "assistant"; body: string; at: string; tools: string[] | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any }> }).rpc(f, a);
const RICH = "text-sm leading-6 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li+li]:mt-1 [&_strong]:font-semibold [&_strong]:text-white";
const TOOL_LABEL: Record<string, string> = { my_store: "store", my_earnings: "earnings", my_orders: "orders", order_detail: "order detail", my_prices: "prices", my_marketing: "marketing", delivery_speed: "delivery speed", check_mtn_number: "MTN check", agent_plan: "plan" };
function relTime(iso: string) { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return formatAdminDate(iso); }
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) => { const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1); return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };

export default function AdminAgentAssistant() {
  const [days, setDays] = useState(7);
  const [ov, setOv] = useState<Overview | null>(null);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);

  const load = useCallback(async () => {
    const [o, t] = await Promise.all([rpc("admin_agent_assistant_overview", { p_days: days }), rpc("admin_agent_assistant_threads", { p_limit: 200, p_agent: agentFilter })]);
    setOv(o.data ?? null); setThreads(Array.isArray(t.data) ? t.data : []);
  }, [days, agentFilter]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { if (!open) { setMsgs(null); return; } setMsgs(null); void rpc("admin_agent_assistant_messages", { p_conversation: open.id }).then(({ data }) => setMsgs(Array.isArray(data) ? data : [])); }, [open]);

  const filtered = useMemo(() => { const term = q.trim().toLowerCase(); return (threads ?? []).filter((t) => !term || [t.agent, t.slug, t.title, t.preview].some((v) => (v ?? "").toLowerCase().includes(term))); }, [threads, q]);
  const tools = Object.entries(ov?.tools ?? {}).sort((a, b) => b[1] - a[1]);
  const agentName = agentFilter ? ov?.by_agent.find((a) => a.agent_id === agentFilter)?.store : null;

  return <div className="space-y-5">
    <AdminPageHeader eyebrow="Support" title="Agent assistant" description="What agents ask their Store assistant and what it answers. Read-only: it never changes anything in a store." action={<div className="flex items-center gap-2">
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-white/[0.1] bg-transparent px-2 py-1 text-[12px] text-foreground">{[1, 7, 30].map((d) => <option key={d} value={d} className="bg-[#0f1613]">{d === 1 ? "Today" : `Last ${d} days`}</option>)}</select>
      <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={15} /></Button></div>} />
    <AdminStatStrip items={[
      { label: "Questions today", value: String(ov?.questions_today ?? "…"), tone: "default" },
      { label: days === 1 ? "Questions today" : `Questions, ${days} days`, value: String(ov?.questions_period ?? "…"), tone: "default" },
      { label: "Agents using it", value: ov ? `${ov.agents_period} of ${ov.agents_total}` : "…", tone: "success" },
      { label: "Most used", value: tools[0] ? (TOOL_LABEL[tools[0][0]] ?? tools[0][0]) : "—", tone: "default" },
    ]} />

    <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      {/* Agents */}
      <Card><CardContent className="p-0">
        <p className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 text-[13px] font-semibold text-foreground"><Store size={14} className="text-primary-glow" />Agents</p>
        <ul className="max-h-[60dvh] divide-y divide-white/[0.05] overflow-y-auto">
          <li><button type="button" onClick={() => { setAgentFilter(null); setOpen(null); }} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] ${agentFilter === null ? "bg-primary/[0.08] text-primary-glow" : "text-foreground hover:bg-white/[0.03]"}`}>All agents<span className="text-[11px] text-faint-foreground">{ov?.agents_total ?? ""}</span></button></li>
          {(ov?.by_agent ?? []).map((a) => <li key={a.agent_id}><button type="button" onClick={() => { setAgentFilter(a.agent_id); setOpen(null); }} className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left ${agentFilter === a.agent_id ? "bg-primary/[0.08]" : "hover:bg-white/[0.03]"}`}><span className="min-w-0"><span className={`block truncate text-[13px] ${agentFilter === a.agent_id ? "text-primary-glow" : "text-foreground"}`}>{a.store}</span><span className="block text-[11px] text-faint-foreground">{relTime(a.last_at)}</span></span><span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 text-[10.5px] text-muted-foreground">{a.questions}</span></button></li>)}
          {ov && ov.by_agent.length === 0 && <li className="px-4 py-3 text-[12.5px] text-muted-foreground">No agent has asked anything yet.</li>}
        </ul>
        {tools.length > 0 && <div className="border-t border-white/[0.07] p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-faint-foreground">What it looks up</p><div className="mt-2 flex flex-wrap gap-1.5">{tools.map(([t, n]) => <span key={t} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11.5px] text-muted-foreground">{TOOL_LABEL[t] ?? t} <b className="text-foreground">{n}</b></span>)}</div></div>}
      </CardContent></Card>

      {/* Threads or transcript */}
      <Card><CardContent className="p-0">
        {!open ? <>
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] p-3">
            <p className="text-[13px] font-semibold text-foreground">{agentName ? `${agentName}'s chats` : "All chats"}<span className="ml-1.5 text-[11.5px] font-normal text-faint-foreground">{filtered.length}</span></p>
            <label className="ml-auto flex items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-1.5"><Search size={14} className="text-faint-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Store, question or words" className="w-44 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint-foreground" />{q && <button type="button" onClick={() => setQ("")} aria-label="Clear"><X size={14} className="text-faint-foreground" /></button>}</label>
          </div>
          {threads === null ? <p className="p-4 text-[12.5px] text-muted-foreground">Loading…</p> : filtered.length === 0 ? <p className="p-4 text-[12.5px] text-muted-foreground">No chats yet.</p> : (
            <ul className="max-h-[64dvh] divide-y divide-white/[0.05] overflow-y-auto">
              {filtered.map((t) => <li key={t.id}><button type="button" onClick={() => setOpen(t)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><MessageCircleQuestion size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[13.5px] font-medium text-foreground">{t.agent}</span><span className="shrink-0 text-[11px] text-faint-foreground">{relTime(t.last_at)}</span></span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{t.title || "Chat"}</span>
                  <span className="block truncate text-[11.5px] text-faint-foreground">{t.preview ?? ""} · {t.messages} messages</span>
                </span>
              </button></li>)}
            </ul>
          )}
        </> : <>
          <div className="flex items-center gap-3 border-b border-white/[0.07] p-3.5">
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)} aria-label="Back"><ArrowLeft size={16} /></Button>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><Store size={18} /></span>
            <div className="min-w-0"><p className="truncate text-[14px] font-semibold text-white">{open.agent} <span className="font-normal text-faint-foreground">· {open.slug}.datayego.com</span></p><p className="text-[11.5px] text-muted-foreground">{open.title || "Chat"} · {open.messages} messages · last {formatAdminDate(open.last_at)}</p></div>
          </div>
          <div className="max-h-[64dvh] min-h-[320px] space-y-2.5 overflow-y-auto px-4 py-4">
            {msgs === null ? <p className="text-[12.5px] text-muted-foreground">Loading…</p> : msgs.map((m, i, arr) => { const newDay = i === 0 || dayLabel(arr[i - 1].at) !== dayLabel(m.at); return <div key={m.id}>
              {newDay && <p className="my-3 text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">{dayLabel(m.at)}</p>}
              {m.sender === "agent"
                ? <div className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-md bg-primary/20 px-3.5 py-2"><p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary-glow"><UserRound size={11} />Agent</p><p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{m.body}</p><p className="mt-0.5 text-right text-[10.5px] text-faint-foreground">{hhmm(m.at)}</p></div></div>
                : <div className="flex justify-start"><div className="max-w-[82%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.03] px-3.5 py-2"><p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint-foreground"><Bot size={11} />Store assistant</p><div className={RICH} dangerouslySetInnerHTML={{ __html: assistantHtml(m.body) }} /><p className="mt-0.5 text-right text-[10.5px] text-faint-foreground">{hhmm(m.at)}{m.tools?.length ? ` · looked up ${m.tools.map((t) => TOOL_LABEL[t] ?? t).join(", ")}` : ""}</p></div></div>}
            </div>; })}
          </div>
        </>}
      </CardContent></Card>
    </div>

    {ov && ov.recent_questions.length > 0 && !open && (
      <Card><CardContent>
        <p className="text-[13px] font-semibold text-foreground">Latest questions</p>
        <ul className="mt-2 divide-y divide-white/[0.05]">
          {ov.recent_questions.slice(0, 12).map((r, i) => <li key={i}><button type="button" onClick={() => { const t = (threads ?? []).find((x) => x.id === r.conversation_id); if (t) setOpen(t); }} className="flex w-full items-baseline gap-3 py-2 text-left hover:text-foreground"><span className="w-24 shrink-0 text-[11px] text-faint-foreground">{relTime(r.at)}</span><span className="w-36 shrink-0 truncate text-[12.5px] text-muted-foreground">{r.store}</span><span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{r.q}</span></button></li>)}
        </ul>
      </CardContent></Card>
    )}
  </div>;
}
