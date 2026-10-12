import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase } from "@/lib/admin-data";

/* Admin → Finance: which gateway takes customer payments. Paystack by default. Flutterwave can be
   switched on by the master admin; while its key is a TEST key only admin accounts are shown
   Flutterwave (customers stay on Paystack) and test payments deliver nothing. */
type Gateway = "paystack" | "flutterwave";
interface Status { provider: Gateway; is_master: boolean; paystack: { configured: boolean }; flutterwave: { configured: boolean; test_key: boolean; webhook_hash_set: boolean; webhook_url: string; effective: "nobody" | "admins_only_test" | "everyone" } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> }).rpc(f, a);

export default function PaymentGatewayCard() {
  const [st, setSt] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Gateway | null>(null);
  const [confirm, setConfirm] = useState<Gateway | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<Status & { error?: string }>("payment-gateway", { body: {} });
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "Could not read the payment gateway."); setLoading(false); return; }
    setSt(data ?? null); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const apply = async (g: Gateway) => {
    setSaving(g); const { error } = await rpc("master_set_payment_gateway", { p_provider: g }); setSaving(null); setConfirm(null);
    if (error) return toast.error(error.message.replace(/_/g, " "));
    toast.success(g === "paystack" ? "Paystack takes all payments." : "Flutterwave switched on."); void load();
  };

  const fw = st?.flutterwave;
  const effectiveLine = !st ? "" : st.provider === "paystack" ? "Every payment goes through Paystack." : fw?.effective === "everyone" ? "Every payment goes through Flutterwave (live key)." : fw?.effective === "admins_only_test" ? "Flutterwave TEST key: only admin accounts see Flutterwave, customers stay on Paystack, and test payments deliver nothing." : "Flutterwave is selected but not configured, so Paystack is taking payments.";

  return (
    <Card><CardContent>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex items-center gap-2"><CreditCard className="text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Payment gateway</h2></div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Who takes the customer's money at checkout: data purchases, wallet top-ups, agent plans. Applies to the next payment started; payments already in progress finish on the gateway they started on.</p>
        </div>
      </div>
      {loading || !st ? <p className="mt-4 text-sm text-muted-foreground"><Loader2 size={14} className="mr-1 inline animate-spin" />Loading…</p> : <>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(["paystack", "flutterwave"] as Gateway[]).map((g) => { const on = st.provider === g; const conf = g === "paystack" ? st.paystack.configured : fw?.configured; return (
            <button key={g} type="button" disabled={!st.is_master || on || !conf} onClick={() => setConfirm(g)} className={`rounded-2xl border p-4 text-left transition-colors disabled:cursor-default ${on ? "border-primary/40 bg-primary/[0.08]" : "border-white/[0.08] hover:border-white/[0.16] disabled:opacity-60"}`}>
              <p className="flex items-center justify-between text-[14px] font-semibold text-foreground">{g === "paystack" ? "Paystack" : "Flutterwave"}{on && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-primary-glow">Active</span>}</p>
              <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">{g === "paystack" ? (st.paystack.configured ? "Configured. Settles to the Ghana account." : "Not configured.") : !fw?.configured ? "Not configured: no FLUTTERWAVE_SECRET_KEY secret yet." : fw.test_key ? "TEST key. Admin accounts only; nothing is delivered on test payments." : "LIVE key. Settles to the Nigeria account."}</p>
            </button>); })}
        </div>
        <p className={`mt-3 flex items-start gap-2 text-[12.5px] leading-5 ${fw?.effective === "admins_only_test" ? "text-amber" : "text-muted-foreground"}`}>{fw?.effective === "admins_only_test" ? <TriangleAlert size={14} className="mt-0.5 shrink-0" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0" />}<span>{effectiveLine}</span></p>
        {!st.is_master && <p className="mt-2 text-[12px] text-faint-foreground">Only the master admin can change the gateway.</p>}
        {fw?.configured && (
          <div className="mt-4 rounded-xl border border-white/[0.07] p-3.5 text-[12.5px] leading-5 text-muted-foreground">
            <p className="font-semibold text-foreground">Flutterwave webhook</p>
            <p className="mt-1">In Flutterwave → Settings → Webhooks, set the URL to <code className="break-all rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11.5px] text-foreground">{fw.webhook_url}</code> and the Secret hash to the value of the <code className="font-mono text-[11.5px]">FLUTTERWAVE_WEBHOOK_HASH</code> secret.{fw.webhook_hash_set ? " Hash secret: set." : " Hash secret: NOT set yet, so webhooks will be rejected."}</p>
            <p className="mt-1">Going live: replace the three Flutterwave secrets with the live ones, set the live webhook URL and hash in Flutterwave, and switch here. No code change.</p>
          </div>
        )}
        {confirm && (
          <div className="mt-4 rounded-xl border border-amber/30 bg-amber/[0.07] p-3.5 text-[13px] text-foreground">
            <p className="font-semibold">{confirm === "paystack" ? "Send every new payment through Paystack?" : fw?.test_key ? "Switch to Flutterwave (TEST key)? Customers keep paying through Paystack; only admin accounts will see Flutterwave, and their test payments deliver nothing." : "Send every new payment through Flutterwave (LIVE key)? Money will settle to the Nigeria account from the next payment."}</p>
            <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void apply(confirm)} disabled={saving !== null}>{saving ? <Loader2 className="animate-spin" /> : null}Yes, switch</Button><Button size="sm" variant="quiet" onClick={() => setConfirm(null)}>Cancel</Button></div>
          </div>
        )}
      </>}
    </CardContent></Card>
  );
}
