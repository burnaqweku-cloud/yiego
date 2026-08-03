import { FormEvent, useState } from "react";
import { Bot, Loader2, Send, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import SmartBackButton from "@/components/layout/SmartBackButton";
import { supabase } from "@/integrations/supabase/client";

type ChatMessage = { role: "user" | "assistant"; content: string };

const welcome: ChatMessage = {
  role: "assistant",
  content: "Hello! I’m YieGo’s 24/7 AI support assistant. I can explain buying data, payments, wallets, pending orders, shared payments, tracking and disputes. For a specific order result, use Track Order with your YG reference.",
};

export default function AISupport() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    const { data, error } = await supabase.functions.invoke<{ message?: string; error?: string }>("ai-support", {
      body: { action: "public_support", message: text, history: messages.slice(-8) },
    });
    setSending(false);
    setMessages((current) => [...current, {
      role: "assistant",
      content: data?.message ?? (data?.error || error?.message ? "AI support is temporarily unavailable. Please use Contact Support or Track Order while we restore it." : "I couldn’t answer that right now. Please try again."),
    }]);
  };

  return <div className="mx-auto max-w-3xl space-y-5">
    <SmartBackButton fallback="/support" />
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-glow">24/7 help</p><h1 className="mt-2 font-display text-3xl font-semibold text-white">AI support</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Get immediate guidance at any time. The assistant explains YieGo processes but cannot independently confirm a payment, delivery or refund.</p></div>

    <Card><CardContent className="p-0">
      <div className="flex items-center gap-3 border-b border-white/[0.07] p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/[0.1] text-primary-glow"><Bot size={20} /></span><div><p className="font-semibold text-white">YieGo AI</p><p className="text-xs text-success">Available 24/7</p></div></div>
      <div className="max-h-[58dvh] min-h-[360px] space-y-3 overflow-y-auto p-4 sm:p-5">{messages.map((message, index) => <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-primary text-primary-foreground" : "border border-white/[0.08] bg-white/[0.035] text-foreground"}`}>{message.content}</div></div>)}{sending && <div className="flex justify-start"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3"><Loader2 className="animate-spin text-primary-glow" size={18} /></div></div>}</div>
      <form onSubmit={send} className="border-t border-white/[0.07] p-4"><div className="flex gap-2"><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask YieGo AI a question…" maxLength={1500} rows={2} className="onyx-field min-h-[54px] flex-1 resize-none" /><Button type="submit" disabled={!input.trim() || sending} aria-label="Send message"><Send size={18} /></Button></div><p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint-foreground"><ShieldCheck size={13} />Never share passwords, OTPs, card details or Mobile Money PINs.</p></form>
    </CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-2"><Button variant="ghost" asChild><Link to="/track-order">Track a specific order</Link></Button><Button variant="ghost" asChild><Link to="/support">Contact human support</Link></Button></div>
  </div>;
}
