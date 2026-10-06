import { useEffect, useRef, useState } from "react";
import { Bot, FileUp, Plus, ShieldCheck, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { p1, useAgent } from "@/components/agent/AgentShell";

/* The agent's store assistant: what it already knows (platform facts, read-only), the agent's own
   knowledge (typed or uploaded), and a test box. Platform facts always win on orders, delivery, prices. */
interface Entry { id: string; title: string; content: string; is_active: boolean; source: string | null; updated_at: string }
const PLATFORM = [
  ["Orders and tracking", "Looks up any of your customers' orders by Order ID or, when they're signed in, sees their recent orders: paid, in progress, delivered, MTN verification, wrong network."],
  ["Prices", "Quotes your store's own prices and promos, live."],
  ["Delivery", "Knows the current MTN delivery time and that Telecel/AirtelTigo usually deliver in minutes; explains first-time MTN verification."],
  ["Payments", "MoMo and card via Paystack, the wallet, and why a payment can show as pending."],
  ["Hand-over", "Refunds, money deducted without delivery, complaints it can't verify, or anyone asking for a person: it hands over to you in your Support inbox."],
];
const MAX = 4000;

export default function AgentAssistant() {
  const { agent, reload } = useAgent();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [editing, setEditing] = useState<Partial<Entry> | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(""); const [answer, setAnswer] = useState<string | null>(null); const [asking, setAsking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async () => { const { data } = await p1().from("store_ai_knowledge").select("id, title, content, is_active, source, updated_at").order("sort_order").order("created_at"); setEntries((data as Entry[]) ?? []); };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const { error } = await p1().rpc("store_ai_knowledge_save", { p_id: editing.id ?? null, p_title: editing.title ?? "", p_content: editing.content ?? "", p_is_active: editing.is_active ?? true, p_source: editing.source ?? "typed" });
    setBusy(false);
    if (error) return toast.error(error.message.includes("max_20") ? "Up to 20 entries." : error.message.includes("title") ? "Give it a title." : error.message.includes("short") ? "Write at least a sentence." : "Couldn't save.");
    toast.success("Saved. The assistant uses it from the next message."); setEditing(null); void load();
  };
  const toggle = async (e: Entry) => { await p1().rpc("store_ai_knowledge_save", { p_id: e.id, p_title: e.title, p_content: e.content, p_is_active: !e.is_active, p_source: null }); void load(); };
  const remove = async (e: Entry) => { if (!window.confirm(`Delete "${e.title}"?`)) return; await p1().rpc("store_ai_knowledge_delete", { p_id: e.id }); void load(); };
  const onFile = async (f: File) => {
    const name = f.name.toLowerCase();
    let text = "";
    try {
      if (name.endsWith(".pdf")) { const pdfjs = await import("pdfjs-dist"); pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`; const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise; const parts: string[] = []; for (let i = 1; i <= Math.min(doc.numPages, 30); i++) { const page = await doc.getPage(i); const c = await page.getTextContent(); parts.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" ")); } text = parts.join("\n"); }
      else if (name.endsWith(".docx")) { const mammoth = await import("mammoth"); text = (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value; }
      else text = await f.text();
    } catch { return toast.error("Couldn't read that file. Try .txt, .md, .csv, .pdf or .docx."); }
    text = text.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
    if (text.length < 10) return toast.error("That file has no readable text.");
    if (text.length > MAX) toast.message(`Trimmed to ${MAX.toLocaleString()} characters. Split long documents into a few entries.`);
    setEditing({ title: f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120), content: text.slice(0, MAX), is_active: true, source: f.name });
  };
  const ask = async () => {
    const question = q.trim(); if (!question) return;
    setAsking(true); setAnswer(null);
    const { data, error } = await supabase.functions.invoke<{ reply?: string; handover?: string; error?: string }>("store-chat-ai", { body: { action: "test", question } });
    setAsking(false);
    if (error || data?.error) return toast.error(data?.error ?? "The assistant didn't answer.");
    setAnswer(data?.reply ?? (data?.handover ? "It would hand this over to you (a person)." : "No answer."));
  };
  const used = (entries ?? []).filter((e) => e.is_active).length;

  return (
    <div className="space-y-5">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Support</p><h1 className="font-display text-[24px] font-semibold text-foreground">Your store assistant</h1><p className="mt-1 text-[13px] text-muted-foreground">It answers customers in {agent.store_name}'s name, in seconds. Teach it what's specific to your business.</p></div>

      <section className="onyx-panel rounded-[22px] p-5">
        <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-glow"><ShieldCheck size={16} /></span><div><h2 className="text-[15px] font-semibold text-foreground">What it already knows</h2><p className="mt-0.5 text-[12.5px] text-muted-foreground">Maintained by DataYego so answers about orders, delivery and payments stay accurate. Your knowledge adds to this; it never replaces it.</p></div></div>
        <ul className="mt-4 space-y-2.5">{PLATFORM.map(([t, d]) => <li key={t} className="flex gap-2 text-[13px]"><span className="mt-0.5 text-primary-glow">✓</span><span><b className="text-foreground">{t}.</b> <span className="text-muted-foreground">{d}</span></span></li>)}</ul>
        <p className="mt-4 text-[12px] text-faint-foreground">Your store's About text, support hours and FAQ from Store settings are also used automatically.</p>
      </section>

      <section className="onyx-panel rounded-[22px] p-5">
        <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-glow"><Bot size={16} /></span><div><h2 className="text-[15px] font-semibold text-foreground">Your knowledge</h2><p className="mt-0.5 text-[12.5px] text-muted-foreground">Things only you can tell it: how you handle WhatsApp support, your business hours, deals, how customers reach you, anything you repeat to every customer. Up to 20 entries.</p></div></div><span className="shrink-0 rounded-full border border-white/[0.1] px-2 py-0.5 text-[11.5px] text-muted-foreground">{used} in use</span></div>
        {!editing && <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setEditing({ title: "", content: "", is_active: true, source: "typed" })} className="onyx-btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px]"><Plus size={14} />Write knowledge</button><button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-4 py-2.5 text-[13px] text-foreground"><FileUp size={14} />Upload a file</button><input ref={fileRef} type="file" accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} /></div>}
        {editing && (
          <div className="mt-4 space-y-3 rounded-2xl bg-white/[0.03] p-4">
            <input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={120} placeholder="Title, e.g. How our WhatsApp support works" className="onyx-field w-full" />
            <textarea value={editing.content ?? ""} onChange={(e) => setEditing({ ...editing, content: e.target.value.slice(0, MAX) })} rows={9} placeholder={"Write it the way you'd tell a new staff member.\n\nExample: We reply on WhatsApp from 7am to 11pm. For wrong numbers, we can't reverse data but we help the customer re-order. We give 5% off orders above GHS 100 if they message us first."} className="onyx-field w-full resize-y" />
            <div className="flex items-center justify-between text-[12px] text-faint-foreground"><span>{editing.source && editing.source !== "typed" ? `From ${editing.source}` : ""}</span><span>{(editing.content ?? "").length.toLocaleString()} / {MAX.toLocaleString()}</span></div>
            <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="onyx-btn-primary px-5 py-2.5 text-[13.5px] disabled:opacity-60">{busy ? "Saving…" : "Save"}</button><button type="button" onClick={() => setEditing(null)} className="rounded-full border border-white/[0.12] px-4 py-2.5 text-[13.5px] text-foreground">Cancel</button></div>
          </div>
        )}
        <ul className="mt-4 divide-y divide-white/[0.06]">
          {entries === null && <li className="py-3 text-[13px] text-muted-foreground">Loading…</li>}
          {entries?.length === 0 && !editing && <li className="py-3 text-[13px] text-muted-foreground">Nothing yet. Start with how customers can reach you and what you tell every new customer.</li>}
          {entries?.map((e) => <li key={e.id} className="flex items-start justify-between gap-3 py-3"><button type="button" onClick={() => setEditing(e)} className="min-w-0 flex-1 text-left"><p className={`truncate text-[14px] font-semibold ${e.is_active ? "text-foreground" : "text-faint-foreground line-through"}`}>{e.title}</p><p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{e.content}</p><p className="mt-1 text-[11px] text-faint-foreground">{e.source && e.source !== "typed" ? `From ${e.source} · ` : ""}{new Date(e.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p></button><div className="flex shrink-0 items-center gap-2"><label className="flex items-center gap-1 text-[11.5px] text-muted-foreground"><input type="checkbox" checked={e.is_active} onChange={() => void toggle(e)} />On</label><button type="button" onClick={() => void remove(e)} aria-label="Delete" className="text-faint-foreground hover:text-danger"><Trash2 size={15} /></button></div></li>)}
        </ul>
      </section>

      <section className="onyx-panel rounded-[22px] p-5">
        <h2 className="text-[15px] font-semibold text-foreground">Try it</h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Ask as a customer would. This doesn't create a real conversation.</p>
        <div className="mt-3 flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void ask(); }} placeholder="e.g. Do you deliver at night? How do I reach you?" className="onyx-field flex-1" /><button type="button" disabled={asking || !q.trim()} onClick={() => void ask()} className="onyx-btn-primary px-4 disabled:opacity-50"><Send size={15} /></button></div>
        {asking && <p className="mt-3 text-[13px] text-muted-foreground">Thinking…</p>}
        {answer && <div className="mt-3 rounded-2xl bg-white/[0.04] p-4 text-[13.5px] leading-6 text-foreground">{answer}</div>}
      </section>
      <button type="button" onClick={() => void reload()} className="hidden" aria-hidden />
    </div>
  );
}
