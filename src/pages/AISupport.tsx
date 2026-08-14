import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Loader2, RotateCcw, Send, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { assistantHtml } from "@/lib/assistantMarkdown";

type ChatMessage = { id?: string; role: "user" | "assistant" | "team"; content: string };
type ConversationStatus = "ai" | "human" | "closed";

interface HistoryResponse {
  greeting?: string;
  conversation?: { token: string; status: ConversationStatus } | null;
  messages?: Array<{ id: string; sender: "customer" | "assistant" | "admin"; body: string }>;
  error?: string;
}
interface SupportResponse {
  message?: string | null;
  conversation_token?: string;
  conversation_status?: ConversationStatus;
  error?: string;
}

/** The stored conversation token is the thread's credential: with it, the chat
 *  survives refreshes and revisits. Signed-in users also get their thread back
 *  server-side by account, even on a fresh device. */
const TOKEN_KEY = "yiego-support-conversation";

const FALLBACK_GREETING = "Hi! I'm YieGo AI. Ask me anything about buying data, payments, your wallet or an order — I'm here all day, every day.";
const FAILURE_REPLY = "AI support is temporarily unavailable. Please use Contact Support or Track Order while we restore it.";

const senderToRole = { customer: "user", assistant: "assistant", admin: "team" } as const;

/** Assistant replies arrive as a small markdown subset; assistantHtml escapes
 *  and sanitises, these classes style the result inside the bubble. */
const richText = "text-sm leading-6 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li+li]:mt-1 [&_strong]:font-semibold [&_strong]:text-white [&_a]:font-semibold [&_a]:text-primary-glow [&_a]:underline [&_code]:rounded [&_code]:bg-white/[0.07] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]";

export default function AISupport() {
  const [greeting, setGreeting] = useState(FALLBACK_GREETING);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("ai");
  const [booting, setBooting] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const token = localStorage.getItem(TOKEN_KEY) ?? undefined;
      const { data } = await supabase.functions.invoke<HistoryResponse>("ai-support", {
        body: { action: "conversation_history", conversation_token: token },
      });
      if (cancelled) return;
      if (data?.greeting) setGreeting(data.greeting);
      if (data && !data.error) {
        if (data.conversation) {
          localStorage.setItem(TOKEN_KEY, data.conversation.token);
          setStatus(data.conversation.status);
          setMessages((data.messages ?? []).map((m) => ({ id: m.id, role: senderToRole[m.sender], content: m.body })));
        } else if (token) {
          localStorage.removeItem(TOKEN_KEY);
        }
      }
      setBooting(false);
    };
    void restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, booting, sending]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending || booting) return;
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    const { data, error } = await supabase.functions.invoke<SupportResponse>("ai-support", {
      body: { action: "public_support", message: text, conversation_token: localStorage.getItem(TOKEN_KEY) ?? undefined },
    });
    setSending(false);
    if (data?.conversation_token) localStorage.setItem(TOKEN_KEY, data.conversation_token);
    if (data?.conversation_status) setStatus(data.conversation_status);
    if (data?.message) {
      setMessages((current) => [...current, { role: "assistant", content: data.message! }]);
    } else if (data?.conversation_status !== "human") {
      setMessages((current) => [...current, {
        role: "assistant",
        content: data?.error || error?.message ? FAILURE_REPLY : "I couldn't answer that right now. Please try again.",
      }]);
    }
  };

  const startOver = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) void supabase.functions.invoke("ai-support", { body: { action: "close_conversation", conversation_token: token } });
    localStorage.removeItem(TOKEN_KEY);
    setMessages([]);
    setStatus("ai");
  };

  return <div className="mx-auto max-w-3xl space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-glow">24/7 help</p><h1 className="mt-2 font-display text-3xl font-semibold text-white">AI support</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Get immediate guidance at any time. Your conversation is saved, so you can leave and pick it up right where you stopped.</p></div>

    <Card><CardContent className="p-0">
      <div className="flex items-center gap-3 border-b border-white/[0.07] p-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/[0.1] text-primary-glow"><Bot size={20} /></span>
        <div><p className="font-semibold text-white">YieGo AI</p><p className="text-xs text-success">Available 24/7</p></div>
        {messages.length > 0 && <Button variant="ghost" size="sm" className="ml-auto text-faint-foreground" onClick={startOver}><RotateCcw size={15} />Start a new chat</Button>}
      </div>
      <div ref={scrollRef} className="max-h-[58dvh] min-h-[360px] space-y-3 overflow-y-auto p-4 sm:p-5">
        {booting
          ? <div className="flex justify-start"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3"><Loader2 className="animate-spin text-primary-glow" size={18} /></div></div>
          : <>
            <div className="flex justify-start"><div className="max-w-[88%] rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm leading-6 text-foreground">{greeting}</div></div>
            {messages.map((message, index) => message.role === "user"
              ? <div key={message.id ?? index} className="flex justify-end"><div className="max-w-[88%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">{message.content}</div></div>
              : <div key={message.id ?? index} className="flex justify-start"><div className="max-w-[88%] rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-foreground">
                  {message.role === "team" && <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-glow"><Users size={12} />YieGo team</p>}
                  <div className={richText} dangerouslySetInnerHTML={{ __html: assistantHtml(message.content) }} />
                </div></div>)}
            {status === "human" && <div className="flex justify-start"><p className="flex items-center gap-2 rounded-xl border border-primary-glow/20 bg-primary/[0.05] px-3 py-2 text-xs leading-5 text-muted-foreground"><Users size={13} className="shrink-0 text-primary-glow" />You're through to the YieGo team — a person will reply here.</p></div>}
            {sending && <div className="flex justify-start"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3"><Loader2 className="animate-spin text-primary-glow" size={18} /></div></div>}
          </>}
      </div>
      <form onSubmit={send} className="border-t border-white/[0.07] p-4"><div className="flex gap-2"><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask YieGo AI a question…" maxLength={1500} rows={2} className="onyx-field min-h-[54px] flex-1 resize-none" /><Button type="submit" disabled={!input.trim() || sending || booting} aria-label="Send message"><Send size={18} /></Button></div><p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint-foreground"><ShieldCheck size={13} />Never share passwords, OTPs, card details or Mobile Money PINs.</p></form>
    </CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-2"><Button variant="ghost" asChild><Link to="/track-order">Track a specific order</Link></Button><Button variant="ghost" asChild><Link to="/support">Contact human support</Link></Button></div>
  </div>;
}
