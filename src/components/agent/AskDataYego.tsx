import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { History, Loader2, MessageCircleQuestion, Plus, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { assistantHtml } from "@/lib/assistantMarkdown";
import { useContactSettings } from "@/hooks/useContactSettings";

/* Store assistant: the assistant inside the agent dashboard. One component, two homes:
   a floating button that opens it as a sheet on every dashboard page (AgentShell), and the
   full page under Help (AgentAsk). Suggested questions follow the page the agent is on. */

interface Msg { id?: string; role: "agent" | "assistant"; body: string }
interface Thread { id: string; title: string | null; last_message_at: string; last_message_preview: string | null }
const RICH = "break-words [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li+li]:mt-1 [&_strong]:font-semibold [&_strong]:text-white [&_a]:font-semibold [&_a]:text-primary-glow [&_a]:underline";

async function call<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>("agent-assistant", { body });
  if (error) {
    // supabase-js hides non-2xx bodies behind FunctionsHttpError; read the message from the response when possible
    const ctx = (error as { context?: Response }).context;
    try { const j = ctx ? await ctx.clone().json() : null; return { data: null, error: j?.error ?? error.message }; } catch { return { data: null, error: error.message }; }
  }
  if (data && (data as { error?: string }).error) return { data: null, error: (data as { error?: string }).error! };
  return { data: data ?? null, error: null };
}

export function AskDataYegoPanel({ onClose, full = false }: { onClose?: () => void; full?: boolean }) {
  const { pathname } = useLocation();
  const { whatsappUrl } = useContactSettings();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [convId, setConvId] = useState<string | null>(() => { try { return sessionStorage.getItem("yg-assistant-conv"); } catch { return null; } });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [showThreads, setShowThreads] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { void call<{ questions: string[] }>({ action: "suggest", path: pathname }).then((r) => setSuggested(r.data?.questions ?? [])); }, [pathname]);
  useEffect(() => { if (!convId) return; void call<{ messages: Array<{ id: string; sender: "agent" | "assistant"; body: string }> }>({ action: "history", conversation_id: convId }).then((r) => setMessages((r.data?.messages ?? []).map((m) => ({ id: m.id, role: m.sender, body: m.body })))); }, [convId]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages, sending]);

  const loadThreads = useCallback(async () => { const r = await call<{ threads: Thread[] }>({ action: "threads" }); setThreads(r.data?.threads ?? []); }, []);
  const openThread = (id: string) => { setConvId(id); try { sessionStorage.setItem("yg-assistant-conv", id); } catch { /* ignore */ } setShowThreads(false); };
  const newChat = () => { setConvId(null); setMessages([]); try { sessionStorage.removeItem("yg-assistant-conv"); } catch { /* ignore */ } setShowThreads(false); };

  const send = async (e: FormEvent | null, preset?: string) => {
    e?.preventDefault();
    const text = (preset ?? input).trim();
    if (!text || sending) return;
    setInput(""); setMessages((m) => [...m, { role: "agent", body: text }]); setSending(true);
    const r = await call<{ conversation_id: string; message: string; remaining: number | null }>({ action: "ask", message: text, conversation_id: convId ?? undefined });
    setSending(false);
    if (r.error || !r.data) { setMessages((m) => [...m, { role: "assistant", body: r.error ?? "I couldn't answer that right now. Try again in a moment." }]); return; }
    if (r.data.conversation_id && r.data.conversation_id !== convId) { setConvId(r.data.conversation_id); try { sessionStorage.setItem("yg-assistant-conv", r.data.conversation_id); } catch { /* ignore */ } }
    setRemaining(r.data.remaining);
    setMessages((m) => [...m, { role: "assistant", body: r.data!.message }]);
  };

  return (
    <div className={`flex flex-col ${full ? "min-h-[70dvh]" : "h-full"}`}>
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary-glow"><MessageCircleQuestion size={16} /></span><div><p className="text-[14px] font-semibold text-foreground">Store assistant</p><p className="text-[11.5px] text-muted-foreground">Knows your store, your orders and your money</p></div></div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setShowThreads((v) => !v); if (!threads) void loadThreads(); }} aria-label="Past chats" className={`flex h-8 w-8 items-center justify-center rounded-full ${showThreads ? "bg-primary/15 text-primary-glow" : "text-muted-foreground hover:text-foreground"}`}><History size={15} /></button>
          <button type="button" onClick={newChat} aria-label="New chat" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><Plus size={16} /></button>
          {onClose && <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><X size={16} /></button>}
        </div>
      </div>

      {showThreads ? (
        <div className="flex-1 overflow-y-auto p-3">
          {threads === null ? <p className="p-3 text-[12.5px] text-muted-foreground">Loading…</p> : threads.length === 0 ? <p className="p-3 text-[12.5px] text-muted-foreground">No past chats yet.</p> : threads.map((t) => (
            <button key={t.id} type="button" onClick={() => openThread(t.id)} className={`mb-1.5 block w-full rounded-xl border px-3 py-2.5 text-left ${t.id === convId ? "border-primary/40 bg-primary/[0.08]" : "border-white/[0.07] hover:bg-white/[0.03]"}`}>
              <p className="truncate text-[13px] font-medium text-foreground">{t.title || "Chat"}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">{t.last_message_preview || ""}</p>
              <p className="mt-0.5 text-[10.5px] text-faint-foreground">{new Date(t.last_message_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </button>
          ))}
        </div>
      ) : (
        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13.5px] leading-6 text-foreground">Ask me anything about your store: where a setting is, why an order is where it is, what you make on a bundle, how to withdraw. I can see your own store, orders and earnings, and I'll point you to the exact page for anything you want to change.</div>
              {suggested.length > 0 && <div className="flex flex-wrap gap-2">{suggested.map((q) => <button key={q} type="button" onClick={() => void send(null, q)} className="rounded-full border border-primary/30 bg-primary/[0.08] px-3 py-1.5 text-[12.5px] font-medium text-primary-glow hover:bg-primary/[0.14]">{q}</button>)}</div>}
            </>
          )}
          {messages.map((m, i) => m.role === "agent"
            ? <div key={m.id ?? i} className="flex justify-end"><div className="max-w-[88%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-[13.5px] leading-6 text-primary-foreground">{m.body}</div></div>
            : <div key={m.id ?? i} className="flex justify-start"><div className={`${RICH} max-w-[90%] rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[13.5px] leading-6 text-foreground`} dangerouslySetInnerHTML={{ __html: assistantHtml(m.body) }} /></div>)}
          {sending && <div className="flex justify-start"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"><Loader2 size={16} className="animate-spin text-primary-glow" /></div></div>}
        </div>
      )}

      <form onSubmit={(e) => void send(e)} className="border-t border-white/[0.07] p-3">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your store…" maxLength={1500} className="onyx-field min-w-0 flex-1" />
          <button type="submit" disabled={!input.trim() || sending} aria-label="Send" className="onyx-btn-primary flex h-11 w-11 shrink-0 items-center justify-center p-0 disabled:opacity-50"><Send size={16} /></button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-faint-foreground">
          <span>{remaining !== null ? `${remaining} questions left today` : "Read-only: it never changes anything in your store."}</span>
          {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="text-primary-glow">Not solved? WhatsApp DataYego</a>}
        </div>
      </form>
    </div>
  );
}

/** Floating "Assistant" button + sheet, mounted once in the agent shell. */
export default function AskDataYegoLauncher() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  if (pathname.startsWith("/agent/ask")) return null; // the full page is open
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Store assistant" className="fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-primary pl-3.5 pr-4 text-[13.5px] font-semibold text-primary-foreground shadow-[0_8px_30px_rgba(60,240,170,0.35)] sm:bottom-6 sm:right-6"><MessageCircleQuestion size={18} />Assistant</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Store assistant" onClick={(e) => e.stopPropagation()} className="onyx-panel flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl sm:h-[640px] sm:max-w-[480px] sm:rounded-3xl">
            <AskDataYegoPanel onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
