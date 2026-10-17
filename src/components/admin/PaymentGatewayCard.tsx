import { useCallback, useEffect, useState } from "react";
import { ChevronDown, CreditCard, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase } from "@/lib/admin-data";

/* Admin → Finance: which gateway takes customer payments. Paystack by default. Flutterwave or Kora
   can be switched on by the master admin; while that gateway's key is a TEST key only admin
   accounts are shown it (customers stay on Paystack) and test payments deliver nothing. */
type Gateway = "paystack" | "flutterwave" | "kora";
interface GatewayStatus { configured: boolean; test_key: boolean; effective: "nobody" | "admins_only_test" | "everyone"; webhook_url: string | null; webhook_hash_set?: boolean }
interface Status { provider: Gateway; is_master: boolean; paystack: GatewayStatus; flutterwave: GatewayStatus; kora: GatewayStatus }
const LABEL: Record<Gateway, string> = { paystack: "Paystack", flutterwave: "Flutterwave", kora: "Kora" };
const SETTLES: Record<Gateway, string> = { paystack: "Settles to the Ghana account.", flutterwave: "Settles to the Nigeria account.", kora: "Settles to the Nigeria account; you convert GHS to NGN in the Kora dashboard." };
const SECRET: Record<Gateway, string> = { paystack: "PAYSTACK_SECRET_KEY", flutterwave: "FLUTTERWAVE_SECRET_KEY", kora: "KORA_SECRET_KEY" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> }).rpc(f, a);

export default function PaymentGatewayCard() {
  const [st, setSt] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Gateway | null>(null);
  const [confirm, setConfirm] = useState<Gateway | null>(null);
  const [open, setOpen] = useState(false); // folded by default: the header row is all you need day to day

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<Status & { error?: string }>("payment-gateway", { body: {} });
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "Could not read the payment gateway."); setLoading(false); return; }
    setSt(data ?? null); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const apply = async (g: Gateway) => {
    setSaving(g); const { error } = await rpc("master_set_payment_gateway", { p_provider: g }); setSaving(null); setConfirm(null);
    if (error) return toast.error(error.message.replace(/_/g, " "));
    toast.success(g === "paystack" ? "Paystack takes all payments." : `${LABEL[g]} switched on.`); void load();
  };

  const active = st ? st[st.provider] : null;
  const effectiveLine = !st || !active ? "" : st.provider === "paystack" ? "Every payment goes through Paystack." : active.effective === "everyone" ? `Every payment goes through ${LABEL[st.provider]} (live key).` : active.effective === "admins_only_test" ? `${LABEL[st.provider]} TEST key: only admin accounts see ${LABEL[st.provider]}, customers stay on Paystack, and test payments deliver nothing.` : `${LABEL[st.provider]} is selected but not configured, so Paystack is taking payments.`;
  const testMode = active?.effective === "admins_only_test";

  return (
    <Card><CardContent>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <CreditCard className="shrink-0 text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Payment gateway</h2>
        {st && <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${testMode ? "bg-amber/15 text-amber" : "bg-primary/20 text-primary-glow"}`}>{LABEL[st.provider]}{testMode ? " · test" : " · active"}</span>}
        <ChevronDown size={16} className={`shrink-0 text-faint-foreground transition-transform ${open ? "rotate-180" : ""} ${st ? "" : "ml-auto"}`} />
      </button>
      {!open ? null : <>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Who takes the customer's money at checkout: data purchases, wallet top-ups, agent plans. Applies to the next payment started; payments already in progress finish on the gateway they started on.</p>
      {loading || !st ? <p className="mt-4 text-sm text-muted-foreground"><Loader2 size={14} className="mr-1 inline animate-spin" />Loading…</p> : <>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {(["paystack", "flutterwave", "kora"] as Gateway[]).map((g) => { const on = st.provider === g; const gs = st[g]; return (
            <button key={g} type="button" disabled={!st.is_master || on || !gs.configured} onClick={() => setConfirm(g)} className={`rounded-2xl border p-4 text-left transition-colors disabled:cursor-default ${on ? "border-primary/40 bg-primary/[0.08]" : "border-white/[0.08] hover:border-white/[0.16] disabled:opacity-60"}`}>
              <p className="flex items-center justify-between gap-2 text-[14px] font-semibold text-foreground">{LABEL[g]}{on && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-primary-glow">Active</span>}</p>
              <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">{!gs.configured ? `Not configured: no ${SECRET[g]} secret yet.` : gs.test_key ? "TEST key. Admin accounts only; nothing is delivered on test payments." : `${g === "paystack" ? "Configured" : "LIVE key"}. ${SETTLES[g]}`}</p>
            </button>); })}
        </div>
        <p className={`mt-3 flex items-start gap-2 text-[12.5px] leading-5 ${testMode ? "text-amber" : "text-muted-foreground"}`}>{testMode ? <TriangleAlert size={14} className="mt-0.5 shrink-0" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0" />}<span>{effectiveLine}</span></p>
        {!st.is_master && <p className="mt-2 text-[12px] text-faint-foreground">Only the master admin can change the gateway.</p>}
        {(["flutterwave", "kora"] as Gateway[]).filter((g) => st[g].configured).map((g) => (
          <div key={g} className="mt-4 rounded-xl border border-white/[0.07] p-3.5 text-[12.5px] leading-5 text-muted-foreground">
            <p className="font-semibold text-foreground">{LABEL[g]} webhook</p>
            {g === "flutterwave"
              ? <p className="mt-1">In Flutterwave → Settings → Webhooks, set the URL to <code className="break-all rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11.5px] text-foreground">{st.flutterwave.webhook_url}</code> and the Secret hash to the value of the <code className="font-mono text-[11.5px]">FLUTTERWAVE_WEBHOOK_HASH</code> secret.{st.flutterwave.webhook_hash_set ? " Hash secret: set." : " Hash secret: NOT set yet, so webhooks will be rejected."}</p>
              : <p className="mt-1">Sent to Kora with every payment, so nothing to configure. If you also want it in Kora → Settings → Webhooks, the URL is <code className="break-all rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11.5px] text-foreground">{st.kora.webhook_url}</code>. Kora signs webhooks with the secret key itself.</p>}
            <p className="mt-1">Going live: replace the {LABEL[g]} test secret with the live one{g === "flutterwave" ? ", set the live webhook URL and hash in Flutterwave," : ""} and switch here. No code change.</p>
          </div>
        ))}
        {confirm && (
          <div className="mt-4 rounded-xl border border-amber/30 bg-amber/[0.07] p-3.5 text-[13px] text-foreground">
            <p className="font-semibold">{confirm === "paystack" ? "Send every new payment through Paystack?" : st[confirm].test_key ? `Switch to ${LABEL[confirm]} (TEST key)? Customers keep paying through Paystack; only admin accounts will see ${LABEL[confirm]}, and their test payments deliver nothing.` : `Send every new payment through ${LABEL[confirm]} (LIVE key)? Money will settle to the Nigeria account from the next payment.`}</p>
            <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void apply(confirm)} disabled={saving !== null}>{saving ? <Loader2 className="animate-spin" /> : null}Yes, switch</Button><Button size="sm" variant="quiet" onClick={() => setConfirm(null)}>Cancel</Button></div>
          </div>
        )}
      </>}
      </>}
    </CardContent></Card>
  );
}
