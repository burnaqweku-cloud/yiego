import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Check, Clock3, Code2, Copy, KeyRound, Plus, ShieldCheck, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { useWallet } from "@/store/wallet";
import { API_BASE_URL, EMPTY_ACCOUNT, agoLabel, maskPhone, orderStatusLabel, type ApiAccount, type ApiKeyRow } from "@/lib/apiAccess";
import NewKeySheet from "@/components/api/NewKeySheet";
import { KeyLockPanel, WebhookPanel } from "@/components/api/ApiWebhookPanel";

/* The seller's API page (owner, 21 Nov 2026), one body for two homes: the agent dashboard (/agent/api) and a
   customer's account (/account/api). It only uses the classes both looks already style (onyx-panel, onyx-btn-primary,
   onyx-field, the agent balance card), so it wears whichever look it sits in. */

interface RpcClient { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: { message: string } | null }> }
const p1 = () => (supabase as unknown as { schema(name: string): RpcClient }).schema("phase1");

export function useApiAccount() {
  const [account, setAccount] = useState<ApiAccount | null>(null);
  const load = useCallback(() => {
    p1().rpc<ApiAccount>("my_api_account").then((r) => setAccount(r.data ? { ...EMPTY_ACCOUNT, ...r.data } : EMPTY_ACCOUNT), () => setAccount(EMPTY_ACCOUNT));
  }, []);
  useEffect(() => { load(); }, [load]);
  // Keep the order list and today's figures fresh while the page is open.
  useEffect(() => {
    if (account?.status !== "active") return;
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [account?.status, load]);
  return { account, reload: load };
}

const TONE: Record<string, string> = {
  good: "bg-primary/15 text-primary-glow",
  wait: "bg-sky-500/15 text-sky-700",
  warn: "bg-amber/15 text-amber",
  bad: "bg-danger/15 text-danger",
  muted: "bg-white/[0.06] text-muted-foreground",
};

export default function ApiAccessPanel({ variant, onTopUp }: { variant: "agent" | "site"; onTopUp: () => void }) {
  const { account, reload } = useApiAccount();
  const { balance } = useWallet();
  const [newKey, setNewKey] = useState<{ key: string; mode: "live" | "test" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const makeKey = async (mode: "live" | "test", replace?: ApiKeyRow) => {
    if (replace && !window.confirm(`Replace your ${mode} key? The old one stops working at once.`)) return;
    setBusy(mode);
    const r = await p1().rpc<{ key: string }>("my_api_new_key", { p_mode: mode });
    setBusy(null);
    if (r.error || !r.data?.key) { toast.error(r.error && /too_many_keys/.test(r.error.message) ? "Too many new keys today. Try again tomorrow." : "Could not make a key. Try again."); return; }
    setNewKey({ key: r.data.key, mode }); reload();
  };

  if (!account) return <div className="onyx-panel h-40 animate-pulse rounded-[22px]" />;
  if (account.status === "none") return <ApplyCard variant={variant} onDone={reload} />;
  if (account.status === "pending") return <WaitCard icon={<Clock3 size={20} />} title="We're checking your application" body={`${account.name ?? "Your application"} was sent ${agoLabel(account.applied_at)}. You'll see your keys here as soon as it's approved.`} />;
  if (account.status === "suspended") return <WaitCard icon={<ShieldCheck size={20} />} title="Your API access is paused" body="Your keys don't work right now. Contact DataYego support to sort it out." />;

  const live = account.keys.find((k) => k.mode === "live");
  const test = account.keys.find((k) => k.mode === "test");
  return (
    <div className="space-y-3">
      {/* Money first: every API order is paid from this balance. */}
      <div className={variant === "agent" ? "rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent p-5" : "onyx-panel rounded-[22px] p-5"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Balance for API orders</p>
            <p className="mt-1 text-[32px] font-semibold leading-none text-foreground">{formatGHS(balance)}</p>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">Your wallet. Each order is taken from it at your price.</p>
          </div>
          <button type="button" onClick={onTopUp} className="onyx-btn-primary shrink-0 !px-4 !py-2.5 !text-[13px]"><Plus size={14} className="mr-1 inline" />Top up</button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Figure label="Orders today" value={String(account.today.orders)} />
          <Figure label="Spent today" value={formatGHS(account.today.spent)} />
          <Figure label="Delivered" value={String(account.today.delivered)} />
        </div>
      </div>

      <section className="onyx-panel rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-3">
          <div><p className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><KeyRound size={16} className="text-primary-glow" />Your keys</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Keep them secret. Anyone with your live key can spend your balance.</p></div>
        </div>
        <ul className="mt-3 space-y-2">
          <KeyItem mode="live" row={live} busy={busy === "live"} onMake={() => void makeKey("live", live)} />
          <KeyItem mode="test" row={test} busy={busy === "test"} onMake={() => void makeKey("test", test)} />
        </ul>
        <p className="mt-2 text-[11.5px] text-faint-foreground">The test key checks everything but never charges or sends anything. Use it while you build.</p>
      </section>

      <section className="onyx-panel rounded-[22px] p-3">
        <div className="flex items-center justify-between px-1"><p className="text-[15px] font-semibold text-foreground">Latest API orders</p><span className="text-[11.5px] text-faint-foreground">by your app</span></div>
        <ul className="mt-1 divide-y divide-white/[0.06]">
          {account.orders.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">No orders yet. Your first one will show here.</li>}
          {account.orders.slice(0, 6).map((o) => { const st = orderStatusLabel(o.status); return (
            <li key={o.reference} className="flex items-center gap-3 px-1 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[11px] font-bold text-primary-glow">{o.network === "MTN" ? "MTN" : o.network === "Telecel" ? "TEL" : "AT"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-foreground">{o.size_gb}GB → {maskPhone(o.phone)}</span>
                <span className="block truncate font-mono text-[11px] text-faint-foreground">{o.your_reference ?? o.reference} · {agoLabel(o.created_at)}</span>
              </span>
              <span className="text-right"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[st.tone]}`}>{st.text}</span><span className="mt-0.5 block text-[12px] font-semibold text-foreground">{formatGHS(o.price)}</span></span>
            </li>); })}
        </ul>
      </section>

      <PriceList prices={account.prices} />

      <WebhookPanel account={account} onChanged={reload} />
      <KeyLockPanel account={account} onChanged={reload} />

      <section className="onyx-panel rounded-[22px] p-4">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><Code2 size={16} className="text-primary-glow" />Connect your app</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Send your key with every request to this address:</p>
        <CopyLine value={API_BASE_URL} />
        <Link to="/account/api?tab=docs" className="mt-3 flex items-center justify-between rounded-2xl bg-primary/10 px-4 py-3 text-[13.5px] font-semibold text-primary-glow"><span className="flex items-center gap-2"><BookOpen size={16} />Read the guide, with PHP and JavaScript examples</span><ArrowRight size={15} /></Link>
      </section>

      <NewKeySheet open={!!newKey} keyValue={newKey?.key ?? ""} mode={newKey?.mode ?? "live"} onClose={() => setNewKey(null)} />
    </div>
  );
}

const NETWORK_ORDER = ["MTN", "Telecel", "AirtelTigo"];
function PriceList({ prices }: { prices: ApiAccount["prices"] }) {
  const [all, setAll] = useState(false);
  const networks = NETWORK_ORDER.filter((n) => prices.some((p) => p.network === n));
  const shown = all ? networks : networks.slice(0, 1);
  return (
    <section className="onyx-panel rounded-[22px] p-4">
      <div className="flex items-center justify-between"><p className="text-[15px] font-semibold text-foreground">Your API prices</p>
        {networks.length > 1 && <button type="button" onClick={() => setAll((v) => !v)} className="text-[12px] font-semibold text-primary-glow">{all ? "Show less" : "All bundles"}</button>}</div>
      {prices.length === 0 && <p className="mt-2 text-[12.5px] text-muted-foreground">No bundles yet.</p>}
      {shown.map((n) => { const list = prices.filter((p) => p.network === n); return (
        <div key={n} className="mt-3">
          {(all || networks.length > 1) && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{n}</p>}
          <div className="grid grid-cols-3 gap-2">
            {(all ? list : list.slice(0, 6)).map((p) => (
              <div key={p.id} className={`rounded-xl border border-white/[0.08] px-2.5 py-2 text-center ${p.available ? "" : "opacity-50"}`}>
                <p className="text-[15px] font-semibold text-foreground">{p.size_gb}GB</p>
                <p className="text-[12px] text-primary-glow">{formatGHS(p.price)}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-faint-foreground">{p.available ? p.id : "not now"}</p>
              </div>
            ))}
          </div>
        </div>); })}
      <p className="mt-2 text-[11.5px] text-faint-foreground">Ask us if you need a special price on any bundle.</p>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-background/60 px-3 py-2.5"><p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-[15px] font-semibold text-foreground">{value}</p></div>;
}

function KeyItem({ mode, row, busy, onMake }: { mode: "live" | "test"; row?: ApiKeyRow; busy: boolean; onMake: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-white/[0.08] px-3 py-2.5">
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase ${mode === "live" ? "bg-primary/15 text-primary-glow" : "bg-amber/15 text-amber"}`}>{mode}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[12.5px] text-foreground">{row ? row.hint : "No key yet"}</span>
        <span className="block text-[11px] text-faint-foreground">{row ? `Made ${agoLabel(row.created_at)} · last used ${agoLabel(row.last_used_at)}` : mode === "live" ? "Make one to start selling" : "For building and testing"}</span>
      </span>
      <button type="button" disabled={busy} onClick={onMake} className="shrink-0 rounded-full border border-white/[0.14] px-3 py-1.5 text-[12px] font-semibold text-foreground disabled:opacity-50">{busy ? "…" : row ? "Replace" : "Make key"}</button>
    </li>
  );
}

function CopyLine({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1500); }} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-background/60 px-3 py-2.5 text-left">
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">{value}</span>
      {done ? <Check size={15} className="text-primary-glow" /> : <Copy size={15} className="text-muted-foreground" />}
    </button>
  );
}

function WaitCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="onyx-panel flex items-start gap-3 rounded-[22px] p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber">{icon}</span>
      <span><span className="block text-[15px] font-semibold text-foreground">{title}</span><span className="mt-1 block text-[13px] text-muted-foreground">{body}</span></span>
    </div>
  );
}

function ApplyCard({ variant, onDone }: { variant: "agent" | "site"; onDone: () => void }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [site, setSite] = useState(""); const [use, setUse] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length >= 2 && /^0\d{9}$/.test(phone.replace(/\D/g, ""));
  const send = async () => {
    if (!ok) return; setBusy(true);
    const r = await p1().rpc("my_api_apply", { p_name: name.trim(), p_phone: phone.replace(/\D/g, ""), p_website: site.trim() || null, p_note: use.trim() || null });
    setBusy(false);
    if (r.error) { toast.error(/phone_needed/.test(r.error.message) ? "Enter a 10-digit phone number." : /name_needed/.test(r.error.message) ? "Enter your business or app name." : "Could not send. Try again."); return; }
    toast.success("Sent. We'll let you know when it's approved."); onDone();
  };
  return (
    <div className="space-y-3">
      <div className={variant === "agent" ? "rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent p-5" : "onyx-panel rounded-[22px] p-5"}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">DataYego API</p>
        <p className="mt-1 font-display text-[22px] font-semibold leading-tight text-foreground">Sell our bundles from your own website or app</p>
        <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
          <Point icon={<Zap size={15} />}>Your site sends the order, we deliver it. You get an order number at once and can check it any time.</Point>
          <Point icon={<Wallet size={15} />}>Paid from your DataYego wallet. Top up any amount, no minimum.</Point>
          <Point icon={<KeyRound size={15} />}>A test key to build with, that never charges or sends anything.</Point>
        </ul>
      </div>
      <section className="onyx-panel rounded-[22px] p-4">
        <p className="text-[15px] font-semibold text-foreground">Apply for API access</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Anyone can apply. We check every application before giving keys.</p>
        <div className="mt-3 space-y-2.5">
          <Field label="Business or app name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kofi Data Hub" className="onyx-field w-full" /></Field>
          <Field label="Phone or WhatsApp"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="024 123 4567" className="onyx-field w-full" /></Field>
          <Field label="Your website or app (if you have one)"><input value={site} onChange={(e) => setSite(e.target.value)} placeholder="kofidatahub.com" className="onyx-field w-full" /></Field>
          <Field label="How will you use it?"><textarea value={use} onChange={(e) => setUse(e.target.value)} rows={3} placeholder="e.g. My website sells bundles and I want orders to go through automatically." className="onyx-field w-full" /></Field>
        </div>
        <button type="button" disabled={!ok || busy} onClick={() => void send()} className="onyx-btn-primary mt-4 w-full !py-3 !text-[14px] disabled:opacity-50">{busy ? "Sending…" : "Apply"}</button>
        <Link to="/account/api?tab=docs" className="mt-3 flex items-center justify-center gap-1 text-[12.5px] font-semibold text-primary-glow">See how it works first<ArrowRight size={13} /></Link>
      </section>
    </div>
  );
}

function Point({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <li className="flex items-start gap-2.5"><span className="mt-0.5 text-primary-glow">{icon}</span><span>{children}</span></li>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[12px] font-semibold text-muted-foreground">{label}</span>{children}</label>;
}
