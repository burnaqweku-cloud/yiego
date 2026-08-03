import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, Loader2, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type ConnectionState = "checking" | "ready" | "error";
interface AIResponse { status?: string; model?: string; message?: string; error?: string; code?: string; }

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
  const [question, setQuestion] = useState("How can a customer pay for another YieGo user's order?");
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);

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

  const testCustomerChat = async () => {
    if (!question.trim()) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke<AIResponse>("ai-support", { body: { action: "public_support", message: question.trim(), history: [] } });
    setSending(false);
    setAnswer(data?.message ?? data?.error ?? error?.message ?? "No response was returned.");
  };

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="AI support" title="AI support control" description="Check the AI connection and test exactly what customers receive from YieGo's 24/7 assistant." />
    <AdminStatStrip items={[
      { label: "Connection", value: connection === "checking" ? "Checking" : connection === "ready" ? "Connected" : "Unavailable", tone: connection === "ready" ? "success" : connection === "error" ? "warning" : "default" },
      { label: "Customer assistant", value: "24/7", tone: "success" },
      { label: "Model", value: model || "Not confirmed" },
    ]} />

    <Card><CardContent><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${connection === "ready" ? "bg-success/[0.1] text-success" : "bg-amber/[0.1] text-amber"}`}>{connection === "ready" ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}</span><div><h2 className="font-display text-lg font-semibold text-white">AI connection</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{connection === "checking" ? "Testing the secure server connection." : connection === "ready" ? `Connected securely${model ? ` using ${model}` : ""}. The API key stays on the server.` : errorMessage || "AI support is unavailable."}</p></div></div><Button variant="ghost" size="sm" onClick={() => void checkConnection()} disabled={connection === "checking"}>{connection === "checking" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Test connection</Button></div></CardContent></Card>

    <Card><CardContent><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Bot className="text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Test customer assistant</h2></div><p className="mt-2 text-sm leading-6 text-muted-foreground">This sends a normal public-support question. It does not read or change any customer account or order.</p></div><Button variant="ghost" size="sm" asChild><Link to="/support/ai">Open live page</Link></Button></div><textarea className="onyx-field mt-5 min-h-24 resize-y" value={question} onChange={(event) => setQuestion(event.target.value)} /><Button className="mt-3" onClick={() => void testCustomerChat()} disabled={sending || !question.trim()}>{sending ? <Loader2 className="animate-spin" /> : <Send />}Send test</Button>{answer && <div className="mt-4 rounded-2xl border border-primary-glow/15 bg-primary/[0.045] p-4 text-sm leading-6 text-foreground">{answer}</div>}</CardContent></Card>

    <Card><CardContent><h2 className="font-display text-lg font-semibold text-white">Safety boundary</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The assistant provides general guidance only. It cannot independently confirm payments, deliveries or refunds, and it never asks for passwords, OTPs, card details or Mobile Money PINs. Customers are sent to Track Order or human support when verified records are required.</p></CardContent></Card>
  </div>;
}
