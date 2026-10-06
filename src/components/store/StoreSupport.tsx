import { useEffect, useRef, useState } from "react";
import { MessageCircle, MessagesSquare, Send, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/components/store/StoreShell";
import WhatsAppFab from "@/components/layout/WhatsAppFab";
import { useAuth } from "@/store/auth-context";

/* The store's two floating buttons: WhatsApp (whatever link the agent chose) and chat.
   Chat: AI answers first; a person from the store takes over when needed. Guests get a device key. */
interface Msg { id: string; sender: "customer" | "agent" | "ai" | "system"; body: string; created_at: string }
const visitorKey = () => { let k = localStorage.getItem("yg-store-visitor"); if (!k) { k = crypto.randomUUID(); localStorage.setItem("yg-store-visitor", k); } return k; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");

/* Assistant bubbles may contain [text](url) links or bare URLs; render them as tappable links in the accent colour. */
function Linkify({ text }: { text: string }) {
  const parts: Array<string | { label: string; href: string }> = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { if (m.index > last) parts.push(text.slice(last, m.index)); parts.push(m[1] ? { label: m[1], href: m[2] } : { label: m[3].replace(/^https?:\/\//, ""), href: m[3] }); last = m.index + m[0].length; }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => typeof p === "string" ? <span key={i}>{p}</span> : <a key={i} href={p.href} className="font-semibold text-primary-glow underline underline-offset-2" target={/wa\.me|whatsapp/.test(p.href) ? "_blank" : undefined} rel="noreferrer">{p.label}</a>)}</>;
}

export default function StoreSupport() {
  const store = useStore(); const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false); const [conv, setConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [mode, setMode] = useState<"ai" | "human">("ai"); const [status, setStatus] = useState("open");
  const [text, setText] = useState(""); const [name, setName] = useState(() => localStorage.getItem("yg-store-chat-name") ?? ""); const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false); const [thinking, setThinking] = useState(false); const [loadingThread, setLoadingThread] = useState(false); const [confirmHuman, setConfirmHuman] = useState(false); const cache = useRef<Record<string, Msg[]>>({});
  const first = (name || "").trim().split(" ")[0];
  const endRef = useRef<HTMLDivElement>(null);
  type Thread = { id: string; status: string; mode: string; created_at: string; last_message_at: string; preview: string | null; last_body: string | null };
  const [threads, setThreads] = useState<Thread[]>([]);
  const [view, setView] = useState<"chat" | "list">("chat");
  // Conversations come from the server: a signed-in customer sees them on any device; a guest sees this device's.
  const loadThreads = async () => { const { data } = await p1().rpc("store_my_conversations", { p_slug: store.slug, p_visitor: visitorKey() }); setThreads((data as Thread[]) ?? []); };
  useEffect(() => { if (open) void loadThreads(); }, [open, conv, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps
  const rememberThread = (_id: string, _preview?: string) => { void loadThreads(); };
  const support = store.support ?? { whatsapp_url: null, chat_on: false };
  const load = async (id: string) => { const { data } = await p1().rpc("store_chat_read", { p_conversation: id, p_visitor: visitorKey() }); if (data) { cache.current[id] = data.messages ?? []; setMsgs(data.messages ?? []); setMode(data.mode); setStatus(data.status); } setLoadingThread(false); };
  useEffect(() => { if (!open || !conv) return; void load(conv); const t = setInterval(() => void load(conv), 4000); return () => clearInterval(t); }, [open, conv]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length, open, thinking, confirmHuman]);
  const start = async () => {
    if (!isAuthenticated && (!name.trim() || !/^0\d{9}$/.test(phone.replace(/\D/g, "")))) return toast.error("Your name and a valid phone number, so the store can reach you.");
    setBusy(true);
    const { data, error } = await p1().rpc("store_chat_open", { p_slug: store.slug, p_visitor: visitorKey(), p_name: name.trim() || null, p_phone: phone.replace(/\D/g, "") || null });
    setBusy(false);
    if (error) return toast.error("Chat isn't available right now.");
    setConv(data.conversation_id); localStorage.setItem(`yg-store-conv:${store.slug}`, data.conversation_id); rememberThread(data.conversation_id); setView("chat"); if (name.trim()) localStorage.setItem("yg-store-chat-name", name.trim());
  };
  useEffect(() => { const saved = localStorage.getItem(`yg-store-conv:${store.slug}`); if (saved) { setConv(saved); setLoadingThread(true); } }, [store.slug]);
  const send = async (preset?: string) => {
    const body = (preset ?? text).trim(); if (!body || !conv) return;
    setText(""); setMsgs((m) => [...m, { id: "tmp" + Date.now(), sender: "customer", body, created_at: new Date().toISOString() }]); if (!threads.find((t) => t.id === conv)?.preview) rememberThread(conv);
    const { error } = await p1().rpc("store_chat_send", { p_conversation: conv, p_visitor: visitorKey(), p_body: body });
    if (error) { toast.error(error.message.includes("slow_down") ? "One moment, you're sending fast." : "Couldn't send."); return; }
    await load(conv);
    if (mode === "ai") { setThinking(true); await supabase.functions.invoke("store-chat-ai", { body: { conversationId: conv, visitor: visitorKey() } }).catch(() => null); await load(conv); setThinking(false); }
  };
  const newChat = () => { setConv(null); setMsgs([]); setMode("ai"); setStatus("open"); localStorage.removeItem(`yg-store-conv:${store.slug}`); setView("chat"); };
  const openThread = (id: string) => { setConv(id); localStorage.setItem(`yg-store-conv:${store.slug}`, id); const cached = cache.current[id]; setMsgs(cached ?? []); setLoadingThread(!cached); setView("chat"); void load(id); };
  const askHuman = async () => { if (!conv) return; await p1().rpc("store_chat_request_human", { p_conversation: conv, p_visitor: visitorKey() }); await load(conv); };
  return (
    <>
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex items-end justify-between">
        {support.whatsapp_url ? <WhatsAppFab href={support.whatsapp_url} label={`${store.store_name} on WhatsApp`} /> : <span />}
        {support.chat_on && <button type="button" onClick={() => setOpen(true)} aria-label="Chat with the store" className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"><MessagesSquare size={24} /></button>}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="onyx-panel flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl sm:h-[600px] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3"><div className="flex items-center gap-3">{store.logo_url ? <img src={store.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : null}<div><p className="text-[14px] font-semibold text-foreground">{store.store_name}</p><p className="flex items-center gap-1.5 text-[11px] text-faint-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary-glow" />{mode === "human" ? "A person from the store is on this chat" : "Online · replies in seconds"}</p></div></div><div className="flex items-center gap-1">{threads.length > 0 && view === "chat" && <button type="button" onClick={() => setView("list")} aria-label="Your chats" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"><MessagesSquare size={16} /></button>}{conv && <button type="button" onClick={newChat} aria-label="New chat" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"><Plus size={18} /></button>}<button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground"><X size={18} /></button></div></div>
            {view === "list" ? (
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="mb-3 flex items-center justify-between"><p className="text-[14px] font-semibold text-foreground">Your chats</p><button type="button" onClick={newChat} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5 text-[12.5px] font-semibold text-primary-glow"><Plus size={14} />New chat</button></div>
                <ul className="divide-y divide-white/[0.06]">{threads.map((t) => <li key={t.id}><button type="button" onClick={() => openThread(t.id)} className="flex w-full items-start justify-between gap-3 py-3 text-left"><span className="min-w-0"><span className="block truncate text-[13.5px] font-medium text-foreground">{t.preview ?? "New conversation"}</span>{t.last_body && <span className="block truncate text-[12px] text-muted-foreground">{t.last_body}</span>}<span className="block text-[11.5px] text-faint-foreground">{new Date(t.last_message_at ?? t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{t.mode === "human" ? " · with the store" : ""}{t.status === "closed" ? " · closed" : ""}{t.id === conv ? " · current" : ""}</span></span><span className="shrink-0 text-[11.5px] text-primary-glow">Open</span></button></li>)}</ul>
              </div>
            ) : !conv ? (
              <div className="flex flex-1 flex-col justify-center gap-3 px-5">
                <div className="text-center">{store.logo_url ? <img src={store.logo_url} alt="" className="mx-auto h-16 w-16 rounded-full object-cover" /> : null}<p className="mt-3 text-[17px] font-semibold text-foreground">Chat with {store.store_name}</p><p className="mt-1 text-[13px] text-muted-foreground">Ask about bundles, prices or an order. Answers in seconds, and a person from the store can step in.</p></div>
                {!isAuthenticated && <div className="space-y-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="onyx-field w-full" /><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="Your WhatsApp number" className="onyx-field w-full" /><p className="text-[11.5px] text-faint-foreground">Your number is only so {store.store_name} can reach you on WhatsApp if the chat gets missed.</p></div>}
                <button type="button" disabled={busy} onClick={() => void start()} className="onyx-btn-primary py-3 text-[14px] disabled:opacity-60">{busy ? "Opening…" : "Start chat"}</button>
              </div>
            ) : (<>
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {loadingThread && msgs.length === 0 && <div className="space-y-2">{[72, 52, 64].map((w, i) => <div key={i} className={`h-9 animate-pulse rounded-2xl bg-white/[0.06] ${i % 2 ? "ml-auto" : ""}`} style={{ width: `${w}%` }} />)}</div>}
                {!loadingThread && msgs.length === 0 && <div className="flex justify-start"><div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-2 text-[13.5px] leading-5 text-foreground">Hi{first ? ` ${first}` : ""} 👋 Welcome to {store.store_name}. Ask me about bundles, prices, delivery or an order and I'll help right away.</div></div>}
                {!loadingThread && msgs.length === 0 && <div className="flex flex-wrap gap-2 pt-1">{["How much is MTN 1GB?", "Track my order", "How fast is delivery?", "Talk to a person"].map((q) => <button key={q} type="button" onClick={() => { if (q === "Talk to a person") setConfirmHuman(true); else void send(q); }} className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12.5px] font-medium text-primary-glow">{q}</button>)}</div>}
                {msgs.map((m) => m.sender === "system" ? <p key={m.id} className="text-center text-[11.5px] text-faint-foreground">{m.body}</p> : <div key={m.id} className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-5 ${m.sender === "customer" ? "bg-primary text-primary-foreground" : "bg-white/[0.06] text-foreground"}`}>{m.sender === "agent" && <p className="mb-0.5 text-[10.5px] font-semibold opacity-70">{store.store_name}</p>}<p className="whitespace-pre-line">{m.sender === "customer" ? m.body : <Linkify text={m.body} />}</p></div></div>)}
                {confirmHuman && mode === "ai" && <div className="flex justify-start"><div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-3 text-[13.5px] leading-5 text-foreground">I can usually sort things out right here: check an order with its ID, quote a price, explain delivery times or MTN verification. If you'd still like a person from {store.store_name}, I'll connect you and they'll reply in this chat.<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setConfirmHuman(false); void askHuman(); }} className="onyx-btn-primary px-3.5 py-1.5 text-[12.5px]">Connect me to a person</button><button type="button" onClick={() => setConfirmHuman(false)} className="rounded-full border border-white/[0.12] px-3.5 py-1.5 text-[12.5px] text-foreground">Keep chatting</button></div></div></div>}
                {thinking && <div className="flex justify-start"><div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-2.5"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" /></div></div>}
                <div ref={endRef} />
              </div>
              {status === "closed" ? <p className="border-t border-white/[0.06] px-4 py-3 text-center text-[12.5px] text-faint-foreground">This chat was closed. Send a message to start a new one.</p> : null}
              <div className="border-t border-white/[0.06] p-3">
                {mode === "ai" && !confirmHuman && <button type="button" onClick={() => setConfirmHuman(true)} className="mb-2 text-[11.5px] font-semibold text-primary-glow">Talk to a person instead</button>}
                <div className="flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} disabled={thinking} placeholder="Type a message" className="onyx-field flex-1" /><button type="button" onClick={() => void send()} disabled={thinking || !text.trim()} aria-label="Send" className="onyx-btn-primary px-4 disabled:opacity-50"><Send size={16} /></button></div>
              </div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
