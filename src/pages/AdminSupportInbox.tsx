import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bot, CheckCheck, CheckCircle2, Flag, Inbox, Loader2, MailOpen, MessageCircle, Pin, PinOff, Search, Send, ShoppingBag, Undo2, UserRound, Users, X } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { assistantHtml, assistantPlain } from "@/lib/assistantMarkdown";
import { formatGHS } from "@/lib/format";
import { refreshSupportAlerts } from "@/lib/supportAlerts";

/* Support inbox: every chat the public assistant is having, live. Newest first, pinned on top, read along,
   take over, hand back, mark handled, close. Order IDs in messages link to Orders; the customer's
   recent orders sit beside the chat. */
type Status = "ai" | "human" | "closed";
interface Customer { full_name: string | null; email: string | null }
interface ConversationRow { id: string; conversation_token: string; user_id: string | null; status: Status; handoff_reason: string | null; assigned_admin: string | null; last_message_at: string; admin_last_seen_at: string | null; admin_pinned_at?: string | null; last_message_preview: string | null; last_message_sender: "customer" | "assistant" | "admin" | null; created_at: string; customer: Customer | null }
interface TranscriptMessage { id: string; sender: "customer" | "assistant" | "admin"; body: string; created_at: string; meta?: { tools_used?: string[]; escalated?: boolean } | null }
interface InboxResponse { conversations?: ConversationRow[]; conversation?: ConversationRow; messages?: TranscriptMessage[]; message?: TranscriptMessage; error?: string }
interface RecentOrder { order_reference: string; status: string; amount: number; recipient_phone: string; created_at: string; data_products: { name: string } | null }

type Tab = "needs" | "ai" | "read" | "closed" | "all";
const TABS: Array<{ key: Tab; label: string }> = [{ key: "needs", label: "Needs you" }, { key: "ai", label: "With AI" }, { key: "read", label: "Read" }, { key: "closed", label: "Closed" }, { key: "all", label: "All" }];
const LIST_POLL_MS = 15_000; const TRANSCRIPT_POLL_MS = 5_000;
const REF_RE = /\b(YG|AG)-[A-Z0-9]{6,12}\b/g;

const customerLabel = (row: { customer: Customer | null; user_id: string | null }) => row.customer?.full_name || row.customer?.email || (row.user_id ? "Customer" : "Guest");
const isUnread = (row: ConversationRow) => row.status !== "closed" && (!row.admin_last_seen_at || new Date(row.last_message_at) > new Date(row.admin_last_seen_at));
const isRead = (row: ConversationRow) => row.status !== "closed" && !isUnread(row);
const needsYou = (row: ConversationRow) => row.status === "human" || (row.status !== "closed" && Boolean(row.handoff_reason));
function relTime(iso: string) {
  const d = new Date(iso); const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(); y.setDate(y.getDate() - 1); if (d.toDateString() === y.toDateString()) return `yesterday ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
const dayLabel = (iso: string) => { const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1); return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const initials = (label: string) => label.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
/** Order references in a message become links to Orders. */
function linkRefs(text: string) {
  const parts: Array<string | { ref: string }> = []; let last = 0;
  for (const m of text.matchAll(REF_RE)) { parts.push(text.slice(last, m.index)); parts.push({ ref: m[0] }); last = (m.index ?? 0) + m[0].length; }
  parts.push(text.slice(last));
  return parts.map((p, i) => typeof p === "string" ? <span key={i}>{p}</span> : <Link key={i} to={`/admin/orders?q=${p.ref}`} className="font-mono font-semibold text-primary-glow underline">{p.ref}</Link>);
}

function StatusChip({ row }: { row: ConversationRow }) {
  if (row.status === "closed") return <span className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint-foreground">Closed</span>;
  if (row.status === "human") return <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/[0.1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber"><Users size={10} />You</span>;
  if (row.handoff_reason) return <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/[0.1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-danger"><Flag size={10} />Escalated</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-primary-glow/25 bg-primary/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-glow"><Bot size={10} />AI</span>;
}
const richText = "text-sm leading-6 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li+li]:mt-1 [&_strong]:font-semibold [&_strong]:text-white [&_a]:font-semibold [&_a]:text-primary-glow [&_a]:underline";

export default function AdminSupportInbox() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [tab, setTab] = useState<Tab>("needs");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ conversation: ConversationRow; messages: TranscriptMessage[] } | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);
  const [reply, setReply] = useState(""); const [sending, setSending] = useState(false); const [acting, setActing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null); const selectedRef = useRef<string | null>(null); selectedRef.current = selectedId;

  const refreshList = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action: "inbox_list" } });
    if (error || data?.error) { if (loadingList) toast.error(data?.error ?? error?.message ?? "Could not load the inbox."); return; }
    setConversations(data?.conversations ?? []); setLoadingList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openConversation = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingTranscript(true);
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action: "inbox_conversation", id } });
    setLoadingTranscript(false);
    if (error || data?.error || !data?.conversation) { if (!quiet) toast.error(data?.error ?? error?.message ?? "Could not open the conversation."); return; }
    if (selectedRef.current !== id) return;
    setTranscript({ conversation: data.conversation, messages: data.messages ?? [] });
    setConversations((cur) => cur.map((r) => r.id === id ? { ...r, admin_last_seen_at: new Date().toISOString() } : r));
    if (!quiet) refreshSupportAlerts();
  }, []);
  useEffect(() => { void refreshList(); const t = setInterval(() => void refreshList(), LIST_POLL_MS); return () => clearInterval(t); }, [refreshList]);
  useEffect(() => { if (!selectedId) { setTranscript(null); setOrders(null); return; } void openConversation(selectedId); const t = setInterval(() => void openConversation(selectedId, true), TRANSCRIPT_POLL_MS); return () => clearInterval(t); }, [selectedId, openConversation]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [transcript?.messages.length, loadingTranscript]);
  // The customer's recent orders (signed-in customers only), so the context is beside the chat.
  const userId = transcript?.conversation.user_id ?? null;
  useEffect(() => {
    if (!userId) { setOrders(null); return; }
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (adminDatabase() as unknown as { from: (t: string) => any }).from("orders").select("order_reference, status, amount, recipient_phone, created_at, data_products(name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(5).then((r: { data: RecentOrder[] | null }) => { if (alive) setOrders(r.data ?? []); });
    return () => { alive = false; };
  }, [userId]);

  const counts = useMemo(() => ({ needs: conversations.filter(needsYou).length, ai: conversations.filter((r) => r.status === "ai" && !r.handoff_reason).length, read: conversations.filter(isRead).length, closed: conversations.filter((r) => r.status === "closed").length, all: conversations.length }), [conversations]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = conversations.filter((r) => tab === "all" ? true : tab === "needs" ? needsYou(r) : tab === "ai" ? r.status === "ai" && !r.handoff_reason : tab === "read" ? isRead(r) : r.status === "closed");
    const hit = term ? base.filter((r) => [r.customer?.full_name, r.customer?.email, r.conversation_token, r.last_message_preview].some((v) => (v ?? "").toLowerCase().includes(term))) : base;
    // pinned chats first, then strictly newest message first. Read or unread never changes the order.
    return hit.slice().sort((a, b) => Number(Boolean(b.admin_pinned_at)) - Number(Boolean(a.admin_pinned_at)) || (b.admin_pinned_at ?? "").localeCompare(a.admin_pinned_at ?? "") || b.last_message_at.localeCompare(a.last_message_at));
  }, [conversations, tab, q]);

  const pinOrRead = async (action: "pin_chat" | "unpin_chat" | "mark_unread", success: string) => {
    if (!transcript) return; setActing(true);
    const id = transcript.conversation.id;
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action, id } });
    setActing(false);
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "That didn't work. Try again."); return; }
    toast.success(success);
    // Mark unread leaves the chat, otherwise the open transcript would mark it read again a few seconds later.
    if (action === "mark_unread") setSelectedId(null);
    await refreshList(); refreshSupportAlerts();
  };
  const act = async (action: "take_over" | "return_to_ai" | "admin_close" | "mark_handled", success: string) => {
    if (!transcript) return; setActing(true);
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action, id: transcript.conversation.id } });
    setActing(false);
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "That didn't work. Try again."); return; }
    toast.success(success); await Promise.all([openConversation(transcript.conversation.id, true), refreshList()]); refreshSupportAlerts();
  };
  const sendReply = async () => {
    const text = reply.trim(); if (!text || !transcript || sending) return; setSending(true);
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action: "admin_reply", id: transcript.conversation.id, message: text } });
    setSending(false);
    if (error || data?.error || !data?.message) { toast.error(data?.error ?? error?.message ?? "The reply could not be sent."); return; }
    setReply(""); setTranscript((cur) => cur ? { conversation: { ...cur.conversation, status: "human" }, messages: [...cur.messages, data.message!] } : cur); void refreshList();
  };
  const c = transcript?.conversation;
  const pinned = Boolean(c && conversations.find((r) => r.id === c.id)?.admin_pinned_at);

  return <div className="space-y-5">
    <AdminPageHeader eyebrow="Support" title="Support inbox" description="Every chat the assistant is having, live. Newest message first, pinned chats stay on top." />
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* List */}
      <Card className={`min-w-0 overflow-hidden ${selectedId ? "hidden lg:block" : ""}`}><CardContent className="p-0">
        <div className="border-b border-white/[0.07] p-3">
          <div className="flex gap-1 overflow-x-auto">{TABS.map((t) => <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] font-medium ${tab === t.key ? "bg-primary/20 text-primary-glow" : "text-muted-foreground hover:text-foreground"}`}>{t.label}<span className={`rounded-full px-1.5 text-[10.5px] ${t.key === "needs" && counts.needs > 0 ? "bg-amber text-[#1a1200] font-bold" : "bg-white/[0.06] text-faint-foreground"}`}>{counts[t.key]}</span></button>)}</div>
          <label className="mt-2.5 flex items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-1.5"><Search size={14} className="text-faint-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, token or words" className="w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint-foreground" />{q && <button type="button" onClick={() => setQ("")} aria-label="Clear"><X size={14} className="text-faint-foreground" /></button>}</label>
        </div>
        {loadingList ? <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>
          : filtered.length === 0 ? <p className="p-5 text-sm text-muted-foreground">{tab === "needs" ? "Nothing needs you right now." : tab === "read" ? "Chats you open show up here. A new message from the customer sends the chat back to unread." : "Nothing here."}</p>
          : <ul className="max-h-[70dvh] divide-y divide-white/[0.05] overflow-y-auto">
            {filtered.map((row) => { const label = customerLabel(row); const unread = isUnread(row); return <li key={row.id}>
              <button type="button" onClick={() => setSelectedId(row.id)} className={`flex w-full gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03] ${selectedId === row.id ? "bg-white/[0.05]" : ""}`}>
                <span className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold ${row.handoff_reason && row.status !== "closed" ? "bg-danger/15 text-danger" : row.status === "human" ? "bg-amber/15 text-amber" : "bg-primary/[0.12] text-primary-glow"}`}>{initials(label)}{unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0f1613] bg-primary-glow" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2"><span className={`truncate text-[13.5px] ${unread ? "font-semibold text-white" : "font-medium text-foreground"}`}>{label}</span><span className="flex shrink-0 items-center gap-1 text-[11px] text-faint-foreground">{row.admin_pinned_at && <Pin size={11} className="text-primary-glow" />}{relTime(row.last_message_at)}</span></span>
                  <span className="mt-0.5 flex items-center justify-between gap-2"><span className={`truncate text-[12.5px] ${unread ? "text-foreground" : "text-muted-foreground"}`}>{row.last_message_sender === "admin" ? "You: " : row.last_message_sender === "assistant" ? "AI: " : ""}{assistantPlain(row.last_message_preview ?? "…", 90)}</span><span className="shrink-0"><StatusChip row={row} /></span></span>
                </span>
              </button>
            </li>; })}
          </ul>}
      </CardContent></Card>

      {/* Chat */}
      <Card className={`min-w-0 overflow-hidden ${!selectedId ? "hidden lg:block" : ""}`}><CardContent className="p-0">
        {!c ? <div className="grid min-h-[480px] place-items-center p-8 text-center">{loadingTranscript ? <Loader2 className="animate-spin text-primary-glow" /> : <div><Inbox size={28} className="mx-auto text-faint-foreground" /><p className="mt-3 text-sm text-muted-foreground">Pick a chat to read it live.</p></div>}</div> : <>
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-3.5">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSelectedId(null)} aria-label="Back"><ArrowLeft size={16} /></Button>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-primary-glow"><UserRound size={18} /></span>
            <div className="min-w-0 flex-1 basis-40">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-white">{customerLabel(c)}<StatusChip row={c} /></p>
              <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{c.customer?.email && c.customer.full_name ? `${c.customer.email} · ` : ""}started {formatAdminDate(c.created_at)} · <span className="font-mono">{c.conversation_token}</span></p>
            </div>
            <div className="flex w-full flex-wrap gap-1.5 sm:ml-auto sm:w-auto">
              {c.handoff_reason && c.status !== "closed" && <Button size="sm" variant="soft" onClick={() => void act("mark_handled", "Marked handled.")} disabled={acting}><CheckCheck size={15} />Mark handled</Button>}
              {c.status === "ai" && <Button size="sm" onClick={() => void act("take_over", "You have the chat. The assistant is silent until you hand it back.")} disabled={acting}><Users size={15} />Take over</Button>}
              {c.status === "human" && <Button variant="ghost" size="sm" onClick={() => void act("return_to_ai", "Handed back to the assistant.")} disabled={acting}><Undo2 size={15} />Hand back</Button>}
              {c.status !== "closed" && <Button variant="ghost" size="sm" onClick={() => void act("admin_close", "Chat closed.")} disabled={acting}><CheckCircle2 size={15} />Close</Button>}
              {pinned ? <Button variant="ghost" size="sm" onClick={() => void pinOrRead("unpin_chat", "Unpinned.")} disabled={acting}><PinOff size={15} />Unpin</Button> : <Button variant="ghost" size="sm" onClick={() => void pinOrRead("pin_chat", "Pinned to the top.")} disabled={acting}><Pin size={15} />Pin</Button>}
              <Button variant="ghost" size="sm" onClick={() => void pinOrRead("mark_unread", "Marked unread.")} disabled={acting}><MailOpen size={15} />Mark unread</Button>
            </div>
          </div>
          {c.handoff_reason && c.status !== "closed" && <p className="flex items-center gap-2 border-b border-danger/20 bg-danger/[0.07] px-4 py-2.5 text-[12.5px] leading-5 text-danger"><Flag size={13} className="shrink-0" /><span><b>Escalated:</b> {c.handoff_reason}. The customer was pointed to WhatsApp.</span></p>}
          {orders && orders.length > 0 && <div className="flex items-center gap-2 overflow-x-auto border-b border-white/[0.07] px-4 py-2"><ShoppingBag size={13} className="shrink-0 text-faint-foreground" /><span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-faint-foreground">Recent orders</span>{orders.map((o) => <Link key={o.order_reference} to={`/admin/orders?q=${o.order_reference}`} className="shrink-0 rounded-lg border border-white/[0.08] px-2 py-1 text-[11.5px] text-foreground hover:border-primary/40"><span className="font-mono text-primary-glow">{o.order_reference}</span> · {o.data_products?.name?.replace(/^.*?—\s*/, "") ?? "bundle"} · {formatGHS(Number(o.amount))} · <span className={o.status === "delivered" ? "text-ink-emerald" : o.status === "refunded" ? "text-faint-foreground" : "text-amber"}>{o.status.replace(/_/g, " ")}</span></Link>)}</div>}
          <div ref={scrollRef} className="max-h-[56dvh] min-h-[360px] space-y-2.5 overflow-y-auto px-4 py-4">
            {transcript!.messages.map((m, i, arr) => { const newDay = i === 0 || dayLabel(arr[i - 1].created_at) !== dayLabel(m.created_at); return <div key={m.id}>
              {newDay && <p className="my-3 text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">{dayLabel(m.created_at)}</p>}
              {m.sender === "customer" ? <div className="flex justify-start"><div className="max-w-[82%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.035] px-3.5 py-2"><p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{linkRefs(m.body)}</p><p className="mt-0.5 text-right text-[10.5px] text-faint-foreground">{hhmm(m.created_at)}</p></div></div>
                : m.sender === "assistant" ? <div className="flex justify-start"><div className="max-w-[82%] rounded-2xl rounded-bl-md border border-primary-glow/15 bg-primary/[0.05] px-3.5 py-2"><p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary-glow"><Bot size={11} />Assistant{m.meta?.escalated ? " · handed over" : ""}</p><div className={richText} dangerouslySetInnerHTML={{ __html: assistantHtml(m.body) }} /><p className="mt-0.5 text-right text-[10.5px] text-faint-foreground">{hhmm(m.created_at)}{m.meta?.tools_used?.length ? ` · ${m.meta.tools_used.join(", ")}` : ""}</p></div></div>
                : <div className="flex justify-end"><div className="max-w-[82%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2"><p className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/70">Team</p><p className="whitespace-pre-wrap text-sm leading-6 text-primary-foreground">{m.body}</p><p className="mt-0.5 text-right text-[10.5px] text-primary-foreground/60">{hhmm(m.created_at)}</p></div></div>}
            </div>; })}
            {transcript!.messages.length === 0 && <p className="p-4 text-sm text-muted-foreground">No messages yet.</p>}
          </div>
          <div className="border-t border-white/[0.07] p-3.5">
            <div className="flex gap-2">
              <textarea className="onyx-field min-h-[52px] flex-1 resize-none" maxLength={2000} placeholder={c.status === "closed" ? "Closed. Replying reopens it with you." : c.status === "human" ? "Reply as the DataYego team… (Enter to send, Shift+Enter for a new line)" : "Reply to take over from the assistant…"} value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }} />
              <Button onClick={() => void sendReply()} disabled={!reply.trim() || sending} aria-label="Send reply">{sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint-foreground"><MessageCircle size={12} />{c.status === "human" ? "The assistant stays silent while you have the chat. Hand back when you're done." : "Sending a reply takes the chat over; the assistant goes silent until you hand it back."}</p>
          </div>
        </>}
      </CardContent></Card>
    </div>
  </div>;
}
