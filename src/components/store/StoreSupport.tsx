import { useEffect, useRef, useState } from "react";
import { MessageCircle, MessagesSquare, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/components/store/StoreShell";
import { useAuth } from "@/store/auth-context";

/* The store's two floating buttons: WhatsApp (whatever link the agent chose) and chat.
   Chat: AI answers first; a person from the store takes over when needed. Guests get a device key. */
interface Msg { id: string; sender: "customer" | "agent" | "ai" | "system"; body: string; created_at: string }
const visitorKey = () => { let k = localStorage.getItem("yg-store-visitor"); if (!k) { k = crypto.randomUUID(); localStorage.setItem("yg-store-visitor", k); } return k; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");

export default function StoreSupport() {
  const store = useStore(); const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false); const [conv, setConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [mode, setMode] = useState<"ai" | "human">("ai"); const [status, setStatus] = useState("open");
  const [text, setText] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const support = store.support ?? { whatsapp_url: null, chat_on: false };
  const load = async (id: string) => { const { data } = await p1().rpc("store_chat_read", { p_conversation: id, p_visitor: visitorKey() }); if (data) { setMsgs(data.messages ?? []); setMode(data.mode); setStatus(data.status); } };
  useEffect(() => { if (!open || !conv) return; void load(conv); const t = setInterval(() => void load(conv), 4000); return () => clearInterval(t); }, [open, conv]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length, open]);
  const start = async () => {
    if (!isAuthenticated && (!name.trim() || !/^0\d{9}$/.test(phone.replace(/\D/g, "")))) return toast.error("Your name and a valid phone number, so the store can reach you.");
    setBusy(true);
    const { data, error } = await p1().rpc("store_chat_open", { p_slug: store.slug, p_visitor: visitorKey(), p_name: name.trim() || null, p_phone: phone.replace(/\D/g, "") || null });
    setBusy(false);
    if (error) return toast.error("Chat isn't available right now.");
    setConv(data.conversation_id); localStorage.setItem(`yg-store-conv:${store.slug}`, data.conversation_id);
  };
  useEffect(() => { const saved = localStorage.getItem(`yg-store-conv:${store.slug}`); if (saved) setConv(saved); }, [store.slug]);
  const send = async () => {
    const body = text.trim(); if (!body || !conv) return;
    setText(""); setMsgs((m) => [...m, { id: "tmp" + Date.now(), sender: "customer", body, created_at: new Date().toISOString() }]);
    const { error } = await p1().rpc("store_chat_send", { p_conversation: conv, p_visitor: visitorKey(), p_body: body });
    if (error) { toast.error(error.message.includes("slow_down") ? "One moment, you're sending fast." : "Couldn't send."); return; }
    await load(conv);
    if (mode === "ai") { await supabase.functions.invoke("store-chat-ai", { body: { conversationId: conv, visitor: visitorKey() } }).catch(() => null); await load(conv); }
  };
  const askHuman = async () => { if (!conv) return; await p1().rpc("store_chat_request_human", { p_conversation: conv, p_visitor: visitorKey() }); await load(conv); };
  return (
    <>
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex items-end justify-between">
        {support.whatsapp_url ? <a href={support.whatsapp_url} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-[#062b16] shadow-lg"><MessageCircle size={26} /></a> : <span />}
        {support.chat_on && <button type="button" onClick={() => setOpen(true)} aria-label="Chat with the store" className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"><MessagesSquare size={24} /></button>}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="onyx-panel flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl sm:h-[600px] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3"><div><p className="text-[14px] font-semibold text-foreground">{store.store_name}</p><p className="text-[11px] text-faint-foreground">{mode === "human" ? "A person from the store is on this chat" : "Instant answers · a person can take over"}</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground"><X size={18} /></button></div>
            {!conv ? (
              <div className="flex flex-1 flex-col justify-center gap-3 px-5">
                <p className="text-[14px] text-foreground">Hi! Ask anything about bundles, prices or an order.</p>
                {!isAuthenticated && <><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="onyx-field w-full" /><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Your phone number" className="onyx-field w-full" /></>}
                <button type="button" disabled={busy} onClick={() => void start()} className="onyx-btn-primary py-3 text-[14px] disabled:opacity-60">Start chat</button>
              </div>
            ) : (<>
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {msgs.length === 0 && <p className="text-center text-[12.5px] text-faint-foreground">Say hello. Replies appear here.</p>}
                {msgs.map((m) => m.sender === "system" ? <p key={m.id} className="text-center text-[11.5px] text-faint-foreground">{m.body}</p> : <div key={m.id} className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-5 ${m.sender === "customer" ? "bg-primary text-primary-foreground" : "bg-white/[0.06] text-foreground"}`}>{m.sender === "agent" && <p className="mb-0.5 text-[10.5px] font-semibold opacity-70">{store.store_name}</p>}<p className="whitespace-pre-line">{m.body}</p></div></div>)}
                <div ref={endRef} />
              </div>
              {status === "closed" ? <p className="border-t border-white/[0.06] px-4 py-3 text-center text-[12.5px] text-faint-foreground">This chat was closed. Send a message to start a new one.</p> : null}
              <div className="border-t border-white/[0.06] p-3">
                {mode === "ai" && <button type="button" onClick={() => void askHuman()} className="mb-2 text-[11.5px] font-semibold text-primary-glow">Talk to a person instead</button>}
                <div className="flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} placeholder="Type a message" className="onyx-field flex-1" /><button type="button" onClick={() => void send()} aria-label="Send" className="onyx-btn-primary px-4"><Send size={16} /></button></div>
              </div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
