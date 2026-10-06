import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, CheckCheck, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { p1, useAgent } from "@/components/agent/AgentShell";

/* The store's support inbox (owner and staff). AI answers first; replying here takes the chat over. */
interface Conv { id: string; status: string; mode: "ai" | "human"; name: string; phone: string | null; email: string | null; last_message_at: string; unanswered: boolean; last: string | null }
interface Msg { id: string; sender: "customer" | "agent" | "ai" | "system"; body: string; created_at: string }
export default function AgentSupport() {
  const { agent } = useAgent();
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open"); const [list, setList] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null); const [conv, setConv] = useState<(Conv & { messages: Msg[] }) | null>(null);
  const [text, setText] = useState(""); const endRef = useRef<HTMLDivElement>(null);
  const loadList = useCallback(async () => { const { data } = await p1().rpc("agent_inbox", { p_status: filter }); setList((data as Conv[]) ?? []); }, [filter]);
  const loadConv = useCallback(async (id: string) => { const { data } = await p1().rpc("agent_conversation", { p_id: id }); setConv(data as Conv & { messages: Msg[] }); }, []);
  useEffect(() => { void loadList(); const t = setInterval(() => void loadList(), 8000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => { if (!active) return; void loadConv(active); const t = setInterval(() => void loadConv(active), 5000); return () => clearInterval(t); }, [active, loadConv]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [conv?.messages.length]);
  const reply = async () => { const body = text.trim(); if (!body || !active) return; setText(""); const { error } = await p1().rpc("agent_reply", { p_id: active, p_body: body }); if (error) return toast.error("Couldn't send."); await loadConv(active); void loadList(); };
  const set = async (status?: string, mode?: string) => { if (!active) return; await p1().rpc("agent_conversation_set", { p_id: active, p_status: status ?? null, p_mode: mode ?? null }); await loadConv(active); void loadList(); };
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-4">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Support</p><h1 className="font-display text-[24px] font-semibold text-foreground">Customer messages</h1><p className="mt-1 text-[13px] text-muted-foreground">Chats from {agent.store_name}. The assistant answers first; when you reply, you take over.</p></div>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={`onyx-panel rounded-[22px] p-3 ${active ? "hidden lg:block" : ""}`}>
          <div className="mb-2 flex gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] p-0.5">{(["open", "closed", "all"] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={`flex-1 rounded-full py-1 text-[12px] capitalize ${filter === f ? "bg-white/[0.08] text-foreground" : "text-muted-foreground"}`}>{f}</button>)}</div>
          {list.length === 0 ? <p className="px-2 py-6 text-center text-[12.5px] text-faint-foreground">No conversations here.</p> : <ul className="divide-y divide-white/[0.06]">{list.map((c) => <li key={c.id}><button type="button" onClick={() => setActive(c.id)} className={`flex w-full items-start gap-2 px-2 py-2.5 text-left ${active === c.id ? "bg-white/[0.04]" : ""}`}><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.unanswered && c.mode === "human" ? "bg-amber" : "bg-transparent"}`} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-[13.5px] font-semibold text-foreground">{c.name}</span><span className="shrink-0 text-[10.5px] text-faint-foreground">{new Date(c.last_message_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></span><span className="block truncate text-[12px] text-muted-foreground">{c.last ?? ""}</span><span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-faint-foreground">{c.mode === "ai" ? <><Bot size={11} />assistant</> : <><UserRound size={11} />you</>}{c.status === "waiting" ? " · waiting for you" : c.status === "closed" ? " · closed" : ""}</span></span></button></li>)}</ul>}
        </section>
        <section className={`onyx-panel flex min-h-[60vh] flex-col rounded-[22px] ${!active ? "hidden lg:flex" : ""}`}>
          {!conv ? <p className="m-auto text-[13px] text-faint-foreground">Pick a conversation.</p> : (<>
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3"><button type="button" onClick={() => { setActive(null); setConv(null); }} className="lg:hidden" aria-label="Back"><ArrowLeft size={18} /></button><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold text-foreground">{conv.name}</p><p className="truncate text-[11.5px] text-faint-foreground">{[conv.phone, conv.email].filter(Boolean).join(" · ")}</p></div><div className="flex shrink-0 gap-1">{conv.mode === "human" ? <button type="button" onClick={() => void set(undefined, "ai")} title="The assistant continues from here and sees everything you wrote" className="rounded-full bg-primary/15 px-2.5 py-1 text-[11.5px] font-semibold text-primary-glow">Hand back to AI</button> : null}{conv.status !== "closed" ? <button type="button" onClick={() => void set("closed")} className="rounded-full border border-white/[0.12] px-2.5 py-1 text-[11.5px] text-foreground"><CheckCheck size={12} className="mr-1 inline" />Close</button> : <button type="button" onClick={() => void set("open", "human")} className="rounded-full border border-white/[0.12] px-2.5 py-1 text-[11.5px] text-foreground">Reopen</button>}</div></div>
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">{conv.messages.map((m) => m.sender === "system" ? <p key={m.id} className="text-center text-[11.5px] text-faint-foreground">{m.body}</p> : <div key={m.id} className={`flex ${m.sender === "customer" ? "justify-start" : "justify-end"}`}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-5 ${m.sender === "customer" ? "bg-white/[0.06] text-foreground" : m.sender === "ai" ? "bg-white/[0.03] text-muted-foreground" : "bg-primary text-primary-foreground"}`}>{m.sender === "ai" && <p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold opacity-70"><Bot size={11} />assistant</p>}<p className="whitespace-pre-line">{m.body}</p><p className="mt-0.5 text-[10px] opacity-60">{when(m.created_at)}</p></div></div>)}<div ref={endRef} /></div>
            <div className="border-t border-white/[0.06] p-3"><div className="flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void reply(); }} placeholder={conv.mode === "ai" ? "Reply to take over from the assistant" : "Reply"} className="onyx-field flex-1" /><button type="button" onClick={() => void reply()} aria-label="Send" className="onyx-btn-primary px-4"><Send size={16} /></button></div></div>
          </>)}
        </section>
      </div>
    </div>
  );
}
