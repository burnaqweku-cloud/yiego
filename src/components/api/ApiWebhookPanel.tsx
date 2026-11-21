import { useEffect, useState } from "react";
import { Check, Copy, Eye, Lock, RefreshCw, Send, Webhook } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { agoLabel, apiSellerError, deliveryLabel, parseIpList, type ApiAccount } from "@/lib/apiAccess";

/* The seller's webhook and key-lock settings (owner, 21 Nov 2026: "do the webhook ... make sure it's secure").
   Only classes both looks style (onyx-panel, onyx-field, onyx-btn-primary), like the rest of the API page. */

interface RpcClient { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> }
const p1 = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");

const TONE: Record<string, string> = {
  good: "bg-primary/15 text-primary-glow", wait: "bg-sky-500/15 text-sky-700", warn: "bg-amber/15 text-amber", bad: "bg-danger/15 text-danger",
};

export function WebhookPanel({ account, onChanged }: { account: ApiAccount; onChanged: () => void }) {
  const hook = account.webhook ?? { url: null, secret_hint: null, deliveries: [] };
  const [url, setUrl] = useState(hook.url ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(hook.url ?? ""); }, [hook.url]);

  const run = async <T,>(what: string, fn: string, args: Record<string, unknown> = {}): Promise<T | null> => {
    setBusy(what);
    const r = await p1().rpc<T>(fn, args);
    setBusy(null);
    if (r.error) { toast.error(apiSellerError(r.error.message)); return null; }
    return r.data ?? (true as unknown as T);
  };
  const save = async () => {
    const out = await run<{ url: string | null; new_secret?: boolean }>("save", "my_api_set_webhook", { p_url: url.trim() || null });
    if (!out) return;
    toast.success(out.url ? "Webhook address saved." : "Webhook removed. Nothing more will be sent.");
    setSecret(null); onChanged();
    if (out.new_secret) void reveal();
  };
  const reveal = async (rotate = false) => {
    if (rotate && !window.confirm("Make a new signing secret? Messages signed with the old one will fail your check, so update your server straight away.")) return;
    const s = await run<string>(rotate ? "rotate" : "reveal", "my_api_webhook_secret", { p_rotate: rotate });
    if (s) { setSecret(s); setCopied(false); if (rotate) { toast.success("New signing secret made."); onChanged(); } }
  };
  const test = async () => {
    const ok = await run<number>("test", "my_api_test_webhook");
    if (ok) { toast.success("Test event sent. It shows below in a few seconds."); window.setTimeout(onChanged, 4000); }
  };
  const resend = async (id: number) => {
    const ok = await run<null>(`resend-${id}`, "my_api_resend_webhook", { p_id: id });
    if (ok) { toast.success("Sending it again."); window.setTimeout(onChanged, 4000); }
  };

  const changed = (url.trim() || null) !== (hook.url ?? null);
  return (
    <section className="onyx-panel rounded-[22px] p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><Webhook size={16} className="text-primary-glow" />Webhooks</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">We tell your server each time an order changes: sent, delivered, refunded. No need to keep asking.</p>
      <label className="mt-3 block text-[12px] font-semibold text-muted-foreground" htmlFor="api-webhook-url">Your webhook address (https)</label>
      <div className="mt-1 flex gap-2">
        <input id="api-webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yoursite.com/datayego-webhook" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="onyx-field min-w-0 flex-1" />
        <button type="button" disabled={!changed || busy === "save"} onClick={() => void save()} className="onyx-btn-primary shrink-0 !px-4 !py-2.5 !text-[13px] disabled:opacity-50">{busy === "save" ? "…" : url.trim() ? "Save" : "Remove"}</button>
      </div>

      {hook.url && (
        <>
          <div className="mt-3 rounded-2xl border border-white/[0.08] p-3">
            <p className="text-[12px] font-semibold text-muted-foreground">Signing secret</p>
            <p className="mt-0.5 text-[11.5px] text-faint-foreground">Check every message with it, so you know it really came from us.</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-foreground">{secret ?? hook.secret_hint ?? "—"}</span>
              {secret ? (
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(secret); setCopied(true); }} className="shrink-0 rounded-full border border-white/[0.14] px-3 py-1.5 text-[12px] font-semibold text-foreground">{copied ? <Check size={13} className="inline" /> : <Copy size={13} className="inline" />} {copied ? "Copied" : "Copy"}</button>
              ) : (
                <button type="button" disabled={busy === "reveal"} onClick={() => void reveal()} className="shrink-0 rounded-full border border-white/[0.14] px-3 py-1.5 text-[12px] font-semibold text-foreground"><Eye size={13} className="inline" /> Show</button>
              )}
              <button type="button" disabled={busy === "rotate"} onClick={() => void reveal(true)} className="shrink-0 rounded-full border border-white/[0.14] px-3 py-1.5 text-[12px] font-semibold text-foreground" aria-label="Make a new signing secret"><RefreshCw size={13} className="inline" /></button>
            </div>
          </div>
          <button type="button" disabled={busy === "test"} onClick={() => void test()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.14] py-2.5 text-[13px] font-semibold text-foreground disabled:opacity-50"><Send size={14} />{busy === "test" ? "Sending…" : "Send a test event"}</button>
        </>
      )}

      {hook.deliveries.length > 0 && (
        <>
          <p className="mt-4 text-[12px] font-semibold text-muted-foreground">Latest messages</p>
          <ul className="mt-1 divide-y divide-white/[0.06]">
            {hook.deliveries.map((d) => { const st = deliveryLabel(d); return (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] text-foreground">{d.event}{d.test ? " · test" : ""}</span>
                  <span className="block truncate text-[11px] text-faint-foreground">{d.reference ? `${d.reference} · ` : ""}{agoLabel(d.created_at)}{d.last_error && d.status !== "delivered" ? ` · ${d.last_error}` : ""}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[st.tone]}`}>{st.text}</span>
                {d.status === "failed" && <button type="button" disabled={busy === `resend-${d.id}`} onClick={() => void resend(d.id)} className="shrink-0 text-[11.5px] font-semibold text-primary-glow">Again</button>}
              </li>); })}
          </ul>
        </>
      )}
    </section>
  );
}

export function KeyLockPanel({ account, onChanged }: { account: ApiAccount; onChanged: () => void }) {
  const current = (account.allowed_ips ?? []).join("\n");
  const [text, setText] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(current); }, [current]);
  const save = async () => {
    const ips = parseIpList(text);
    if (ips.length && !window.confirm(`Lock your live key to ${ips.length === 1 ? "this address" : `these ${ips.length} addresses`}? Calls from any other address will be refused.`)) return;
    setBusy(true);
    const r = await p1().rpc<string[] | null>("my_api_set_allowed_ips", { p_ips: ips });
    setBusy(false);
    if (r.error) { toast.error(apiSellerError(r.error.message)); return; }
    toast.success(ips.length ? "Live key locked to your addresses." : "Live key works from any address."); onChanged();
  };
  const changed = parseIpList(text).join(",") !== (account.allowed_ips ?? []).join(",");
  return (
    <section className="onyx-panel rounded-[22px] p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><Lock size={16} className="text-primary-glow" />Lock your live key</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">Only your servers' IP addresses can use it. If someone steals the key, it won't work for them. Leave empty to allow any address.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={"e.g. 41.66.12.34\none address per line"} spellCheck={false} className="onyx-field mt-2 w-full font-mono text-[12.5px]" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-faint-foreground">{account.allowed_ips?.length ? `Locked to ${account.allowed_ips.length} address${account.allowed_ips.length === 1 ? "" : "es"}` : "Not locked"} · test keys are never locked</span>
        <button type="button" disabled={!changed || busy} onClick={() => void save()} className="onyx-btn-primary shrink-0 !px-4 !py-2 !text-[13px] disabled:opacity-50">{busy ? "…" : "Save"}</button>
      </div>
    </section>
  );
}
