import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, Database, KeyRound, Loader2, MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type ConnectionState = "checking" | "ready" | "error";

interface AIHealthResponse {
  status?: string;
  provider?: string;
  model?: string;
  error?: string;
}

interface AIRewriteResponse extends AIHealthResponse {
  message?: string;
}

const sampleFacts = {
  order_reference: "YG-DEMO123",
  payment_status: "pending",
  fulfilment_status: "not_started",
  supplier_status: null,
  customer_status: "waiting_for_payment",
};

const sampleDraft = "Hello, your YieGo order YG-DEMO123 is waiting for payment. The order has not been sent to the supplier yet. Please complete payment to continue.";

export default function AdminAISupport() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [model, setModel] = useState<string>("");
  const [draft, setDraft] = useState(sampleDraft);
  const [instruction, setInstruction] = useState("Make it warm, concise and professional.");
  const [result, setResult] = useState("");
  const [rewriting, setRewriting] = useState(false);

  const checkConnection = useCallback(async () => {
    setConnection("checking");
    const { data, error } = await supabase.functions.invoke<AIHealthResponse>("ai-support", {
      body: { action: "health" },
    });

    if (error || data?.error || data?.status !== "ready") {
      setConnection("error");
      setModel("");
      return;
    }

    setConnection("ready");
    setModel(data.model ?? "Claude");
  }, []);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  const rewrite = async () => {
    if (!draft.trim()) {
      toast.error("Enter a safe support draft first.");
      return;
    }

    setRewriting(true);
    const { data, error } = await supabase.functions.invoke<AIRewriteResponse>("ai-support", {
      body: {
        action: "rewrite_support",
        draft: draft.trim(),
        instruction: instruction.trim(),
        verifiedFacts: sampleFacts,
      },
    });
    setRewriting(false);

    if (error || data?.error || !data?.message) {
      toast.error(data?.error ?? error?.message ?? "Claude could not improve the message.");
      return;
    }

    setResult(data.message);
    if (data.model) setModel(data.model);
    toast.success("Claude improved the support message.");
  };

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="AI support" title="Support assistant" description="Use Claude to improve customer-support wording while keeping YieGo's verified records as the source of truth." />

      <AdminStatStrip items={[
        { label: "Safe fallback", value: "Ready", tone: "success" },
        { label: "Claude", value: connection === "checking" ? "Checking" : connection === "ready" ? "Connected" : "Unavailable", tone: connection === "ready" ? "success" : connection === "error" ? "warning" : "default" },
        { label: "Model", value: model || "Not confirmed" },
      ]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/[0.1] text-primary-glow"><MessageSquareText size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">Order support messages</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">YieGo first creates a safe message from payment, fulfilment, supplier and customer-visible statuses. Claude only improves how that verified message is written.</p></div></div></CardContent></Card>
        <Card><CardContent><div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${connection === "ready" ? "bg-success/[0.1] text-success" : "bg-white/[0.04] text-primary-glow"}`}><KeyRound size={20} /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold text-white">Provider connection</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{connection === "checking" ? "Testing the secure Supabase connection to Claude." : connection === "ready" ? "Claude is connected through the server. The API key is not exposed to the browser." : "The secure Claude connection could not be confirmed. The safe fallback remains available."}</p></div><Button variant="ghost" size="sm" onClick={() => void checkConnection()} disabled={connection === "checking"}>{connection === "checking" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Test</Button></div></div></div></CardContent></Card>
        <Card><CardContent><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-primary-glow"><Database size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">Business knowledge</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Optional reasons from meaningful business actions may be supplied as context. Claude is instructed not to expose internal-only notes or invent explanations.</p></div></div></CardContent></Card>
        <Card><CardContent><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/[0.1] text-success"><CheckCircle2 size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">Safety rules</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Claude cannot confirm payments, promise delivery or refunds, blame a supplier, or add account details unless those facts are explicitly provided by YieGo.</p></div></div></CardContent></Card>
      </div>

      <Card><CardContent>
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Bot className="text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Test Claude rewriting</h2></div><p className="mt-2 text-sm leading-6 text-muted-foreground">This test uses fixed demo facts. It does not change any real customer order.</p></div><span className="rounded-full border border-primary-glow/20 bg-primary/[0.08] px-3 py-1 text-xs font-semibold text-primary-glow">Admin only</span></div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Safe draft</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="onyx-field min-h-36 resize-y text-sm leading-6" /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Style request</span><input value={instruction} onChange={(event) => setInstruction(event.target.value)} className="onyx-field" /></label>
            <Button onClick={() => void rewrite()} disabled={rewriting || connection !== "ready"}>{rewriting ? <Loader2 className="animate-spin" /> : <Sparkles />}Improve with Claude</Button>
          </div>

          <div className="rounded-2xl border border-primary-glow/15 bg-primary/[0.045] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-glow">Claude result</p>{result ? <textarea value={result} onChange={(event) => setResult(event.target.value)} className="onyx-field mt-4 min-h-52 resize-y text-sm leading-6" /> : <div className="grid min-h-52 place-items-center text-center"><div><Sparkles className="mx-auto text-faint-foreground" /><p className="mt-3 text-sm text-muted-foreground">Run the test to see Claude's customer-ready rewrite.</p></div></div>}</div>
        </div>
      </CardContent></Card>
    </div>
  );
}
