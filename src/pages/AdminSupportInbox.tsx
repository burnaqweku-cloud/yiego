import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, CheckCircle2, Flag, Inbox, Loader2, MessageCircle, Send, Undo2, UserRound, Users } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { assistantHtml } from "@/lib/assistantMarkdown";

type Status = "ai" | "human" | "closed";
interface Customer { full_name: string | null; email: string | null }
interface ConversationRow {
  id: string; conversation_token: string; user_id: string | null; status: Status;
  handoff_reason: string | null; assigned_admin: string | null;
  last_message_at: string; admin_last_seen_at: string | null;
  last_message_preview: string | null; last_message_sender: "customer" | "assistant" | "admin" | null;
  created_at: string; customer: Customer | null;
}
interface TranscriptMessage { id: string; sender: "customer" | "assistant" | "admin"; body: string; created_at: string }
interface InboxResponse {
  conversations?: ConversationRow[];
  conversation?: (Omit<ConversationRow, "admin_last_seen_at" | "last_message_preview" | "last_message_sender"> & { customer: Customer | null }) | { id: string; status: Status; assigned_admin: string | null };
  messages?: TranscriptMessage[]; message?: TranscriptMessage; conversation_status?: Status; error?: string;
}

type Filter = "open" | "human" | "closed" | "all";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "open", label: "Open" }, { key: "human", label: "With the team" }, { key: "closed", label: "Closed" }, { key: "all", label: "All" },
];

const LIST_POLL_MS = 10_000;
const TRANSCRIPT_POLL_MS = 5_000;

function customerLabel(row: { customer: Customer | null; user_id: string | null }) {
  return row.customer?.full_name || row.customer?.email || (row.user_id ? "Customer" : "Guest");
}
function isUnread(row: ConversationRow) {
  return !row.admin_last_seen_at || new Date(row.last_message_at) > new Date(row.admin_last_seen_at);
}
function ago(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
}

function StatusChip({ status }: { status: Status }) {
  if (status === "human") return <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/25 bg-amber/[0.09] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-amber"><Users size={11} />Team</span>;
  if (status === "closed") return <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint-foreground">Closed</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-glow/25 bg-primary/[0.08] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-primary-glow"><Bot size={11} />AI</span>;
}

const richText = "text-sm leading-6 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li+li]:mt-1 [&_strong]:font-semibold [&_strong]:text-white [&_a]:font-semibold [&_a]:text-primary-glow [&_a]:underline [&_code]:rounded [&_code]:bg-white/[0.07] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]";

export default function AdminSupportInbox() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ conversation: ConversationRow; messages: TranscriptMessage[] } | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const refreshList = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action: "inbox_list" } });
    if (error || data?.error) { if (loadingList) toast.error(data?.error ?? error?.message ?? "Could not load the inbox."); return; }
    setConversations(data?.conversations ?? []);
    setLoadingList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openConversation = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingTranscript(true);
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action: "inbox_conversation", id } });
    setLoadingTranscript(false);
    if (error || data?.error || !data?.conversation) { if (!quiet) toast.error(data?.error ?? error?.message ?? "Could not open the conversation."); return; }
    if (selectedRef.current !== id) return; // user moved on while this loaded
    setTranscript({ conversation: data.conversation as ConversationRow, messages: data.messages ?? [] });
    // Opening marks it read server-side; mirror that locally so the dot clears.
    setConversations((current) => current.map((row) => row.id === id ? { ...row, admin_last_seen_at: new Date().toISOString() } : row));
  }, []);

  useEffect(() => { void refreshList(); const timer = setInterval(() => void refreshList(), LIST_POLL_MS); return () => clearInterval(timer); }, [refreshList]);
  useEffect(() => {
    if (!selectedId) { setTranscript(null); return; }
    void openConversation(selectedId);
    const timer = setInterval(() => void openConversation(selectedId, true), TRANSCRIPT_POLL_MS);
    return () => clearInterval(timer);
  }, [selectedId, openConversation]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [transcript?.messages.length, loadingTranscript]);

  const filtered = useMemo(() => conversations.filter((row) =>
    filter === "all" ? true : filter === "open" ? row.status !== "closed" : row.status === filter), [conversations, filter]);

  const stats = useMemo(() => ({
    ai: conversations.filter((row) => row.status === "ai").length,
    human: conversations.filter((row) => row.status === "human").length,
    escalated: conversations.filter((row) => row.handoff_reason && row.status !== "closed").length,
  }), [conversations]);

  const act = async (action: "take_over" | "return_to_ai" | "admin_close", success: string) => {
    if (!transcript) return;
    setActing(true);
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action, id: transcript.conversation.id } });
    setActing(false);
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "That didn't work. Try again."); return; }
    toast.success(success);
    await Promise.all([openConversation(transcript.conversation.id, true), refreshList()]);
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !transcript || sending) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke<InboxResponse>("ai-support", { body: { action: "admin_reply", id: transcript.conversation.id, message: text } });
    setSending(false);
    if (error || data?.error || !data?.message) { toast.error(data?.error ?? error?.message ?? "The reply could not be sent."); return; }
    setReply("");
    setTranscript((current) => current ? {
      conversation: { ...current.conversation, status: "human" },
      messages: [...current.messages, data.message!],
    } : current);
    void refreshList();
  };

  const conversation = transcript?.conversation;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="AI support" title="Support inbox" description="Every conversation the assistant is having, live. Open one to read along, take over to speak as the team, and hand it back when you're done." />
    <AdminStatStrip items={[
      { label: "With the AI", value: String(stats.ai), tone: "default" },
      { label: "With the team", value: String(stats.human), tone: stats.human > 0 ? "warning" : "default" },
      { label: "Escalated", value: String(stats.escalated), tone: stats.escalated > 0 ? "warning" : "success" },
    ]} />

    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      {/* ── Conversation list ── */}
      <Card className={selectedId ? "hidden lg:block" : undefined}><CardContent className="p-0">
        <div className="flex flex-wrap gap-1.5 border-b border-white/[0.07] p-3">
          {FILTERS.map(({ key, label }) => <Button key={key} variant={filter === key ? "primary" : "ghost"} size="sm" onClick={() => setFilter(key)}>{label}</Button>)}
        </div>
        {loadingList
          ? <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>
          : filtered.length === 0
            ? <p className="p-5 text-sm text-muted-foreground">Nothing here — when customers chat with the assistant, conversations appear the moment they start.</p>
            : <ul className="max-h-[64dvh] divide-y divide-white/[0.05] overflow-y-auto">
              {filtered.map((row) => <li key={row.id}>
                <button type="button" onClick={() => setSelectedId(row.id)} className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] ${selectedId === row.id ? "bg-white/[0.045]" : ""}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      {isUnread(row) && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-glow" aria-label="Unread" />}
                      <span className="truncate text-sm font-semibold text-white">{customerLabel(row)}</span>
                      {row.handoff_reason && row.status !== "closed" && <Flag size={12} className="shrink-0 text-amber" aria-label="Escalated" />}
                    </span>
                    <span className="shrink-0 text-[11px] text-faint-foreground">{ago(row.last_message_at)}</span>
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] leading-5 text-muted-foreground">
                      {row.last_message_sender === "admin" ? "You: " : row.last_message_sender === "assistant" ? "AI: " : ""}{row.last_message_preview ?? "…"}
                    </span>
                    <StatusChip status={row.status} />
                  </span>
                </button>
              </li>)}
            </ul>}
      </CardContent></Card>

      {/* ── Transcript ── */}
      <Card className={!selectedId ? "hidden lg:block" : undefined}><CardContent className="p-0">
        {!conversation
          ? <div className="grid min-h-[420px] place-items-center p-8 text-center">
            {loadingTranscript ? <Loader2 className="animate-spin text-primary-glow" /> : <div><Inbox size={28} className="mx-auto text-faint-foreground" /><p className="mt-3 text-sm text-muted-foreground">Pick a conversation to read it live.</p></div>}
          </div>
          : <>
            <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-4">
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSelectedId(null)} aria-label="Back to list"><ArrowLeft size={16} /></Button>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/[0.1] text-primary-glow"><UserRound size={19} /></span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">{customerLabel(conversation)}<StatusChip status={conversation.status} /></p>
                <p className="mt-0.5 font-mono text-[11px] text-faint-foreground">{conversation.conversation_token}</p>
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {conversation.status !== "human" && conversation.status !== "closed" && <Button size="sm" onClick={() => void act("take_over", "You have the conversation — the AI is silent until you hand it back.")} disabled={acting}><Users size={15} />Take over</Button>}
                {conversation.status === "human" && <Button variant="ghost" size="sm" onClick={() => void act("return_to_ai", "Handed back — the AI answers from the next message.")} disabled={acting}><Undo2 size={15} />Return to AI</Button>}
                {conversation.status !== "closed" && <Button variant="ghost" size="sm" onClick={() => void act("admin_close", "Conversation closed.")} disabled={acting}><CheckCircle2 size={15} />Close</Button>}
              </div>
            </div>
            {conversation.handoff_reason && <p className="flex items-center gap-2 border-b border-amber/15 bg-amber/[0.06] px-4 py-2.5 text-xs leading-5 text-amber"><Flag size={13} className="shrink-0" />AI escalated: {conversation.handoff_reason} — the customer was pointed to WhatsApp.</p>}
            <div ref={scrollRef} className="max-h-[52dvh] min-h-[320px] space-y-3 overflow-y-auto p-4">
              {transcript!.messages.map((message) => message.sender === "customer"
                ? <div key={message.id} className="flex justify-start"><div className="max-w-[85%] rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-2.5">
                    <p className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint-foreground">Customer</p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.body}</p>
                  </div></div>
                : message.sender === "assistant"
                  ? <div key={message.id} className="flex justify-start"><div className="max-w-[85%] rounded-2xl border border-primary-glow/15 bg-primary/[0.04] px-4 py-2.5">
                      <p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary-glow"><Bot size={11} />DataYego AI</p>
                      <div className={richText} dangerouslySetInnerHTML={{ __html: assistantHtml(message.body) }} />
                    </div></div>
                  : <div key={message.id} className="flex justify-end"><div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5">
                      <p className="mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/70"><Users size={11} />Team</p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-primary-foreground">{message.body}</p>
                    </div></div>)}
              {transcript!.messages.length === 0 && <p className="p-4 text-sm text-muted-foreground">No messages yet.</p>}
            </div>
            <div className="border-t border-white/[0.07] p-4">
              <div className="flex gap-2">
                <textarea className="onyx-field min-h-[54px] flex-1 resize-none" maxLength={2000} placeholder={conversation.status === "closed" ? "This conversation is closed — replying reopens it with you." : conversation.status === "human" ? "Reply as the DataYego team…" : "Reply to take over from the AI…"} value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void sendReply(); } }} />
                <Button onClick={() => void sendReply()} disabled={!reply.trim() || sending} aria-label="Send reply">{sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</Button>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint-foreground"><MessageCircle size={12} />{conversation.status === "human" ? "The AI stays silent while you have the conversation. Return to AI when you're done." : "Sending a reply takes the conversation over — the AI goes silent until you hand it back."}</p>
            </div>
          </>}
      </CardContent></Card>
    </div>
  </div>;
}
