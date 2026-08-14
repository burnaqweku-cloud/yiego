import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, Loader2, MessageSquareText, RefreshCw, Save, Send, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type ConnectionState = "checking" | "ready" | "error";
interface AIResponse { status?: string; model?: string; message?: string; error?: string; code?: string; greeting?: string; persona_notes?: string; }

const errorLabels: Record<string, string> = {
  invalid_api_key: "The stored AI key is invalid or was revoked.",
  missing_api_key: "The AI key has not been configured.",
  provider_limit: "The AI service rate limit was reached. Try again shortly.",
  provider_billing: "AI credits are exhausted. Add credits in Settings.",
  model_unavailable: "The configured AI model is unavailable. Redeploy the ai-support function.",
  provider_permission: "The AI service rejected this request.",
};

export default function AdminAISupport() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [model, setModel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [question, setQuestion] = useState("How can a customer pay for another DataYego user's order?");
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [personaNotes, setPersonaNotes] = useState("");
  const [voiceLoading, setVoiceLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const checkConnection = useCallback(async () => {
    setConnection("checking"); setErrorMessage("");
    const { data, error } = await supabase.functions.invoke<AIResponse>("ai-support", { body: { action: "health" } });
    if (error || data?.error || data?.status !== "ready") {
      setConnection("error"); setModel("");
      setErrorMessage(errorLabels[data?.code ?? ""] ?? data?.error ?? error?.message ?? "AI support could not be reached.");
      return;
    }
    setConnection("ready"); setModel(data.model ?? "AI");
  }, []);

  useEffect(() => { void checkConnection(); }, [checkConnection]);

  useEffect(() => {
    let cancelled = false;
    const loadVoice = async () => {
      const { data } = await supabase.functions.invoke<AIResponse>("ai-support", { body: { action: "get_assistant_settings" } });
      if (cancelled) return;
      if (data && !data.error) { setGreeting(data.greeting ?? ""); setPersonaNotes(data.persona_notes ?? ""); }
      setVoiceLoading(false);
    };
    void loadVoice();
    return () => { cancelled = true; };
  }, []);

  const saveVoice = async () => {
    if (!greeting.trim()) { toast.error("The greeting can't be empty."); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<AIResponse>("ai-support", {
      body: { action: "update_assistant_settings", greeting: greeting.trim(), persona_notes: personaNotes.trim() },
    });
    setSaving(false);
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "The settings could not be saved."); return; }
    toast.success("Saved. The assistant uses this voice from its very next reply.");
  };

  const testCustomerChat = async () => {
    if (!question.trim()) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke<AIResponse>("ai-support", { body: { action: "test_customer_reply", message: question.trim() } });
    setSending(false);
    setAnswer(data?.message ?? data?.error ?? error?.message ?? "No response was returned.");
  };

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="AI support" title="AI support control" description="Check the AI connection, shape how the assistant speaks, and test exactly what customers receive." />
    <AdminStatStrip items={[
      { label: "Connection", value: connection === "checking" ? "Checking" : connection === "ready" ? "Connected" : "Unavailable", tone: connection === "ready" ? "success" : connection === "error" ? "warning" : "default" },
      { label: "Customer assistant", value: "24/7", tone: "success" },
      { label: "Model", value: model || "Not confirmed" },
    ]} />

    <Card><CardContent><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${connection === "ready" ? "bg-success/[0.1] text-success" : "bg-amber/[0.1] text-amber"}`}>{connection === "ready" ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}</span><div><h2 className="font-display text-lg font-semibold text-white">AI connection</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{connection === "checking" ? "Testing the secure server connection." : connection === "ready" ? `Connected securely${model ? ` using ${model}` : ""}. The API key stays on the server.` : errorMessage || "AI support is unavailable."}</p></div></div><Button variant="ghost" size="sm" onClick={() => void checkConnection()} disabled={connection === "checking"}>{connection === "checking" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Test connection</Button></div></CardContent></Card>

    <Card><CardContent>
      <div className="flex items-center gap-2"><MessageSquareText className="text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Voice &amp; greeting</h2></div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">This is yours to shape — no deploy needed, changes apply from the assistant's next reply. The greeting opens every conversation. The tone notes are standing instructions layered on top of the built-in safety rules, e.g. "Always mention that delivery usually takes minutes" or "Call bundles 'packages'".</p>
      {voiceLoading ? <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16} />Loading current settings…</div> : <>
        <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.14em] text-faint-foreground" htmlFor="ai-greeting">Greeting</label>
        <textarea id="ai-greeting" className="onyx-field mt-2 min-h-16 w-full resize-y" maxLength={300} value={greeting} onChange={(event) => setGreeting(event.target.value)} />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-faint-foreground" htmlFor="ai-persona">Tone &amp; behaviour notes</label>
        <textarea id="ai-persona" className="onyx-field mt-2 min-h-28 w-full resize-y" maxLength={4000} placeholder="One instruction per line works best." value={personaNotes} onChange={(event) => setPersonaNotes(event.target.value)} />
        <Button className="mt-4" onClick={() => void saveVoice()} disabled={saving || !greeting.trim()}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save voice</Button>
      </>}
    </CardContent></Card>

    <Card><CardContent><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Bot className="text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Test customer assistant</h2></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Runs the exact customer setup — persona, safety rules and your saved voice — without creating a real conversation.</p></div><Button variant="ghost" size="sm" asChild><Link to="/support/ai">Open live page</Link></Button></div><textarea className="onyx-field mt-5 min-h-24 resize-y" value={question} onChange={(event) => setQuestion(event.target.value)} /><Button className="mt-3" onClick={() => void testCustomerChat()} disabled={sending || !question.trim()}>{sending ? <Loader2 className="animate-spin" /> : <Send />}Send test</Button>{answer && <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-primary-glow/15 bg-primary/[0.045] p-4 text-sm leading-6 text-foreground">{answer}</div>}</CardContent></Card>

    <Card><CardContent><h2 className="font-display text-lg font-semibold text-white">Safety boundary</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The assistant provides general guidance only. It cannot independently confirm payments, deliveries or refunds, and it never asks for passwords, OTPs, card details or Mobile Money PINs. Customers are sent to Track Order or human support when verified records are required. Tone notes cannot override these rules.</p></CardContent></Card>
  </div>;
}
