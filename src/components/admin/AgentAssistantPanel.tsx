import { useEffect, useState } from "react";
import { MessageCircleQuestion, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { assistantHtml } from "@/lib/assistantMarkdown";

/* Admin → AI support → Agent assistant: what agents are asking "Ask DataYego" and what it answered. */
interface Thread { id: string; agent: string; slug: string; title: string | null; last_at: string; preview: string | null; messages: number }
interface Msg { id: string; sender: "agent" | "assistant"; body: string; at: string; tools: string[] | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any }> }).rpc(f, a);
const RICH = "text-sm leading-6 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li+li]:mt-1 [&_strong]:font-semibold [&_strong]:text-white";

export default function AgentAssistantPanel() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [open, setOpen] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const load = async () => { setThreads(null); const { data } = await rpc("admin_agent_assistant_threads", { p_limit: 100 }); setThreads(Array.isArray(data) ? data : []); };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!open) return; setMsgs(null); void rpc("admin_agent_assistant_messages", { p_conversation: open.id }).then(({ data }) => setMsgs(Array.isArray(data) ? data : [])); }, [open]);
  const today = (threads ?? []).filter((t) => Date.now() - new Date(t.last_at).getTime() < 86400000).length;

  return (
    <Card><CardContent>
      <div className="flex items-start justify-between gap-4">
        <div><div className="flex items-center gap-2"><MessageCircleQuestion className="text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Agent assistant (Ask DataYego)</h2></div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The assistant inside the agent dashboard. It reads the Agents and How-to knowledge plus the agent Help Center, and each agent's own store, orders and earnings. {threads ? `${threads.length} recent chats, ${today} active in the last 24h.` : ""}</p></div>
        <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={15} /></Button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="max-h-[480px] overflow-y-auto rounded-xl border border-white/[0.07]">
          {threads === null ? <p className="p-3 text-[12.5px] text-muted-foreground">Loading…</p> : threads.length === 0 ? <p className="p-3 text-[12.5px] text-muted-foreground">No chats yet.</p> : threads.map((t) => (
            <button key={t.id} type="button" onClick={() => setOpen(t)} className={`block w-full border-b border-white/[0.05] px-3 py-2.5 text-left ${open?.id === t.id ? "bg-primary/[0.08]" : "hover:bg-white/[0.03]"}`}>
              <p className="flex items-baseline justify-between gap-2 text-[13px]"><span className="truncate font-medium text-foreground">{t.agent}</span><span className="shrink-0 text-[11px] text-faint-foreground">{formatAdminDate(t.last_at)}</span></p>
              <p className="truncate text-[12px] text-muted-foreground">{t.title || "Chat"} · {t.messages} messages</p>
            </button>
          ))}
        </div>
        <div className="max-h-[480px] overflow-y-auto rounded-xl border border-white/[0.07] p-3">
          {!open ? <p className="text-[12.5px] text-muted-foreground">Pick a chat to read it.</p> : msgs === null ? <p className="text-[12.5px] text-muted-foreground">Loading…</p> : msgs.map((m) => (
            <div key={m.id} className={`mb-2 flex ${m.sender === "agent" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${m.sender === "agent" ? "bg-primary/20 text-foreground" : "border border-white/[0.08] bg-white/[0.03]"}`}>
                {m.sender === "agent" ? <p className="whitespace-pre-wrap text-sm leading-6">{m.body}</p> : <div className={RICH} dangerouslySetInnerHTML={{ __html: assistantHtml(m.body) }} />}
                <p className="mt-1 text-[10.5px] text-faint-foreground">{formatAdminDate(m.at)}{m.tools?.length ? ` · used ${m.tools.join(", ")}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CardContent></Card>
  );
}
