import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, RefreshCw, Search, Store, UserRound, X } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import ChatSourceBadge from "@/components/admin/ChatSourceBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { assistantHtml, assistantPlain } from "@/lib/assistantMarkdown";

/* Admin → Support → Storefront chats: what customers ask the Chat assistant on an agent's store,
   and what it (or the store owner) answers. Read-only oversight, one thread per visitor. */
interface Overview { questions_today: number; questions_period: number; chats_period: number; stores_period: number; ai_replies: number; agent_replies: number; by_store: Array<{ agent_id: string; store: string; slug: string; chats: number; last_at: string }> }
interface Thread { id: string; agent_id: string; store: string; slug: string; customer: string; phone: string | null; mode: "ai" | "human"; last_at: string; first_q: string | null; preview: string | null; messages: number }
interface Msg { id: string; sender: "customer" | "ai" | "agent" | "system"; body: string; at: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any }> }).rpc(f, a);
const RICH = "break-words text-sm leading-6 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li+li]:mt-1 [&_strong]:font-semibold [&_strong]:text-white";
function relTime(iso: string) { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return formatAdminDate(iso); }
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) => { const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1); return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };

export default function AdminStorefrontChats() {
  const [days, setDays] = useState(7);
  const [ov, setOv] = useState<Overview | null>(null);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);

  const load = useCallback(async () => {
    const [o, t] = await Promise.all([rpc("admin_storefront_chats_overview", { p_days: days }), rpc("admin_storefront_chats_threads", { p_limit: 200, p_agent: storeFilter })]);
    setOv(o.data ?? null); setThreads(Array.isArray(t.data) ? t.data : []);
  }, [days, storeFilter]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    if (!open) { setMsgs(null); return; }
    let alive = true; setMsgs(null);
    const pull = () => rpc("admin_storefront_chats_messages", { p_conversation: open.id }).then(({ data }) => { if (alive) setMsgs(Array.isArray(data) ? data : []); });
    void pull(); const timer = setInterval(() => void pull(), 10_000);
    return () => { alive = false; clearInterval(timer); };
  }, [open]);

  const filtered = useMemo(() => { const term = q.trim().toLowerCase(); return (threads ?? []).filter((t) => !term || [t.store, t.slug, t.customer, t.phone, t.first_q, t.preview].some((v) => (v ?? "").toLowerCase().includes(term))); }, [threads, q]);
  const storeName = storeFilter ? ov?.by_store.find((a) => a.agent_id === storeFilter)?.store : null;

  return <div className="space-y-5">
    <AdminPageHeader eyebrow="Support" title="Storefront chats" description="What customers ask the Chat assistant on an agent's store, and what it answers. These are the stores' chats, not datayego.com and not the agent dashboard. Read-only." action={<div className="flex items-center gap-2">
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-white/[0.1] bg-transparent px-2 py-1 text-[12px] text-foreground">{[1, 7, 30].map((d) => <option key={d} value={d} className="bg-[#0f1613]">{d === 1 ? "Today" : `Last ${d} days`}</option>)}</select>
      <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={15} /></Button></div>} />
    <AdminStatStrip items={[
      { label: "Questions today", value: String(ov?.questions_today ?? "…"), tone: "default" },
      { label: days === 1 ? "Chats today" : `Chats, ${days} days`, value: String(ov?.chats_period ?? "…"), tone: "default" },
      { label: "Stores with chats", value: String(ov?.stores_period ?? "…"), tone: "success" },
      { label: "Answered by", value: ov ? `AI ${ov.ai_replies} · owner ${ov.agent_replies}` : "…", tone: "default" },
    ]} />

    <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <Card className="min-w-0 overflow-hidden"><CardContent className="p-0">
        <p className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 text-[13px] font-semibold text-foreground"><Store size={14} className="text-primary-glow" />Stores</p>
        <ul className="max-h-[60dvh] divide-y divide-white/[0.05] overflow-y-auto">
          <li><button type="button" onClick={() => { setStoreFilter(null); setOpen(null); }} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] ${storeFilter === null ? "bg-primary/[0.08] text-primary-glow" : "text-foreground hover:bg-white/[0.03]"}`}>All stores<span className="text-[11px] text-faint-foreground">{ov?.by_store.length ?? ""}</span></button></li>
          {(ov?.by_store ?? []).map((a) => <li key={a.agent_id}><button type="button" onClick={() => { setStoreFilter(a.agent_id); setOpen(null); }} className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left ${storeFilter === a.agent_id ? "bg-primary/[0.08]" : "hover:bg-white/[0.03]"}`}><span className="min-w-0"><span className={`block truncate text-[13px] ${storeFilter === a.agent_id ? "text-primary-glow" : "text-foreground"}`}>{a.store}</span><span className="block text-[11px] text-faint-foreground">{relTime(a.last_at)}</span></span><span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 text-[10.5px] text-muted-foreground">{a.chats}</span></button></li>)}
          {ov && ov.by_store.length === 0 && <li className="px-4 py-3 text-[12.5px] text-muted-foreground">No store has had a chat yet.</li>}
        </ul>
      </CardContent></Card>

      <Card className="min-w-0 overflow-hidden"><CardContent className="p-0">
        {!open ? <>
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] p-3">
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-foreground">{storeName ? `${storeName}'s chats` : "All storefront chats"}<span className="text-[11.5px] font-normal text-faint-foreground">{filtered.length}</span></p>
            <label className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-1.5 sm:ml-auto sm:w-auto"><Search size={14} className="text-faint-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Store, customer or words" className="w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint-foreground sm:w-44" />{q && <button type="button" onClick={() => setQ("")} aria-label="Clear"><X size={14} className="text-faint-foreground" /></button>}</label>
          </div>
          {threads === null ? <p className="p-4 text-[12.5px] text-muted-foreground">Loading…</p> : filtered.length === 0 ? <p className="p-4 text-[12.5px] text-muted-foreground">No chats yet.</p> : (
            <ul className="max-h-[64dvh] divide-y divide-white/[0.05] overflow-y-auto">
              {filtered.map((t) => <li key={t.id}><button type="button" onClick={() => setOpen(t)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber/[0.12] text-amber"><Store size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[13.5px] font-medium text-foreground">{t.customer}</span><span className="shrink-0 text-[11px] text-faint-foreground">{relTime(t.last_at)}</span></span>
                  <span className="mt-0.5 flex items-center gap-2"><ChatSourceBadge kind="storefront" store={t.store} />{t.mode === "human" && <span className="shrink-0 rounded-full border border-white/[0.1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Owner replying</span>}</span>
                  <span className="mt-1 block truncate text-[12.5px] text-muted-foreground">{assistantPlain(t.first_q ?? t.preview ?? "", 90)}</span>
                  <span className="block text-[11.5px] text-faint-foreground">{t.messages} messages</span>
                </span>
              </button></li>)}
            </ul>
          )}
        </> : <>
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-3.5">
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)} aria-label="Back"><ArrowLeft size={16} /></Button>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber/[0.12] text-amber"><UserRound size={18} /></span>
            <div className="min-w-0 flex-1 basis-40">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-white">{open.customer}<ChatSourceBadge kind="storefront" store={open.store} /></p>
              <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{open.slug}.datayego.com · {open.messages} messages · last {formatAdminDate(open.last_at)}</p>
            </div>
          </div>
          <div className="max-h-[64dvh] min-h-[320px] space-y-2.5 overflow-y-auto px-4 py-4">
            {msgs === null ? <p className="text-[12.5px] text-muted-foreground">Loading…</p> : msgs.map((m, i, arr) => { const newDay = i === 0 || dayLabel(arr[i - 1].at) !== dayLabel(m.at); return <div key={m.id}>
              {newDay && <p className="my-3 text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">{dayLabel(m.at)}</p>}
              {m.sender === "system" ? <p className="text-center text-[11.5px] text-faint-foreground">{m.body}</p>
                : m.sender === "customer" ? <div className="flex justify-start"><div className="max-w-[82%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.035] px-3.5 py-2"><p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint-foreground"><UserRound size={11} />Customer</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{m.body}</p><p className="mt-0.5 text-right text-[10.5px] text-faint-foreground">{hhmm(m.at)}</p></div></div>
                : m.sender === "ai" ? <div className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-md border border-primary-glow/15 bg-primary/[0.05] px-3.5 py-2"><p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary-glow"><Bot size={11} />Chat assistant</p><div className={RICH} dangerouslySetInnerHTML={{ __html: assistantHtml(m.body) }} /><p className="mt-0.5 text-right text-[10.5px] text-faint-foreground">{hhmm(m.at)}</p></div></div>
                : <div className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2"><p className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/70">Store owner</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-primary-foreground">{m.body}</p><p className="mt-0.5 text-right text-[10.5px] text-primary-foreground/60">{hhmm(m.at)}</p></div></div>}
            </div>; })}
          </div>
        </>}
      </CardContent></Card>
    </div>
  </div>;
}
