import { Bot, CheckCircle2, Database, KeyRound, MessageSquareText } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminAISupport() {
  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="AI support" title="Support assistant" description="Manage the safe business context used to prepare customer-support replies." />
      <AdminStatStrip items={[
        { label: "Fallback", value: "Ready", tone: "success" },
        { label: "AI provider", value: "Not linked" },
        { label: "Knowledge", value: "Audit reasons" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/[0.1] text-primary-glow"><MessageSquareText size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">Order support messages</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Order Management already creates safe messages from verified payment, supplier and order statuses. It works without an AI key.</p></div></div></CardContent></Card>
        <Card><CardContent><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-primary-glow"><KeyRound size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">Provider connection</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Gemini, Claude or another provider can later improve wording through a server-side key. The browser will never receive the secret.</p></div></div></CardContent></Card>
        <Card><CardContent><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-primary-glow"><Database size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">Business knowledge</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Optional reasons from meaningful actions can become support context. Internal-only notes remain separated from customer-safe explanations.</p></div></div></CardContent></Card>
        <Card><CardContent><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/[0.1] text-success"><CheckCircle2 size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">Safety rules</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The assistant must not invent delivery times, payment confirmations, refund promises or supplier explanations that are absent from YieGo records.</p></div></div></CardContent></Card>
      </div>
      <Card><CardContent><div className="flex items-center gap-3"><Bot className="text-primary-glow" /><div><p className="font-semibold text-white">Next connection step</p><p className="mt-1 text-sm text-muted-foreground">Add the selected provider key as a Supabase secret, then enable AI rewriting behind the existing safe fallback.</p></div></div></CardContent></Card>
    </div>
  );
}
