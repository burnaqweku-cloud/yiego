import { useEffect, useState } from "react";
import { Check, Copy, Globe, RefreshCw, ShoppingCart } from "lucide-react";
import { formatGHS } from "@/lib/format";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { p1, useAgent } from "@/components/agent/AgentShell";
import Section from "@/components/agent/Section";
import EmailDomain from "@/components/agent/EmailDomain";
import { Mail, Sparkles } from "lucide-react";

/* The store's own address: a free subdomain, and optionally the agent's own domain. */
interface Status { domain: string | null; status?: string; ssl?: string; live?: boolean; cname_target?: string; errors?: unknown; error?: string }
export default function AgentDomain() {
  const { agent, reload } = useAgent();
  const sub = `${agent.slug}.datayego.com`;
  const [domain, setDomain] = useState(""); const [st, setSt] = useState<Status | null>(null); const [busy, setBusy] = useState(false);
  const call = async (body: Record<string, unknown>) => { const { data, error } = await supabase.functions.invoke<Status>("cf-domains", { body }); if (error) return { error: error.message } as Status; return data as Status; };
  const refresh = async () => { if (!agent.custom_domain) { setSt(null); return; } setBusy(true); const r = await call({ action: "status" }); setBusy(false); setSt(r); };
  useEffect(() => { void refresh(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.custom_domain]);
  const connect = async () => {
    const d = domain.trim().toLowerCase(); if (!d) return;
    setBusy(true); const r = await call({ action: "connect", domain: d }); setBusy(false);
    if (r.error) return toast.error(r.error);
    toast.success("Domain added. Now add the DNS record below."); setDomain(""); void reload();
  };
  const disconnect = async () => { if (!window.confirm(`Disconnect ${agent.custom_domain}? Your store stays available at ${sub} and datayego.com/s/${agent.slug}.`)) return; setBusy(true); await call({ action: "disconnect" }); setBusy(false); setSt(null); void reload(); };
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied."); };
  const live = st?.live || agent.custom_domain_status === "active";
  // Buy through DataYego (we register it by hand)
  const [buy, setBuy] = useState(""); const [quote, setQuote] = useState<{ domain: string; price: number; available: boolean | null } | null>(null); const [buying, setBuying] = useState(false);
  const [orders, setOrders] = useState<Array<{ id: string; domain: string; price: number; status: string; created_at: string; expires_at: string | null }>>([]);
  useEffect(() => { void p1().from("domain_orders").select("id, domain, price, status, created_at, expires_at").neq("status", "pending_payment").order("created_at", { ascending: false }).then(({ data }) => setOrders(data ?? [])); }, [agent.custom_domain]);
  const check = async () => { const d = buy.trim().toLowerCase(); if (!d) return; setBuying(true); const { data, error } = await supabase.functions.invoke<{ domain: string; price: number; available: boolean | null; error?: string }>("domain-purchase", { body: { action: "check", domain: d } }); setBuying(false); if (error || data?.error) { setQuote(null); return toast.error(data?.error ?? error?.message ?? "Couldn't check."); } setQuote(data!); };
  const pay = async () => { if (!quote) return; setBuying(true); const { data, error } = await supabase.functions.invoke<{ authorizationUrl?: string; error?: string }>("domain-purchase", { body: { action: "pay", domain: quote.domain } }); setBuying(false); if (error || data?.error || !data?.authorizationUrl) return toast.error(data?.error ?? error?.message ?? "Couldn't start payment."); window.location.assign(data.authorizationUrl); };
  return (
    <div className="space-y-6">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Domain</p><h1 className="font-display text-[24px] font-semibold text-foreground">Your store's address</h1><p className="mt-1 text-[13px] text-muted-foreground">Your free address, and your own domain if you want one.</p></div>
      <Section page="domain" id="free-address" title="Free address" icon={<Globe size={15} />} defaultOpen>
        <div className="mt-3 space-y-2">
          {[`https://${sub}`].map((u) => <div key={u} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5"><a href={u} target="_blank" rel="noreferrer" className="truncate text-[13.5px] text-foreground">{u.replace("https://", "")}</a><button type="button" onClick={() => copy(u)} className="shrink-0 text-faint-foreground" aria-label="Copy"><Copy size={14} /></button></div>)}
        </div>
        <p className="mt-2 text-[11.5px] text-faint-foreground">Free, no setup, and when it's shared on WhatsApp the preview shows your store's name and logo. Every page of your store lives on it: {sub}/track, /sign-in, and so on.</p>
      </Section>
      <Section page="domain" id="your-own-domain" title="Your own domain">
        {!agent.custom_domain ? (<>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Own a domain like mystore.com? Connect it and your store runs on it, with its own secure certificate. You keep the domain with whoever you bought it from.</p>
          <div className="mt-3 flex gap-2"><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mystore.com" autoCapitalize="none" className="onyx-field flex-1" /><button type="button" disabled={busy} onClick={() => void connect()} className="onyx-btn-primary px-4 py-2 text-[13px] disabled:opacity-60">Connect</button></div>
        </>) : (<>
          <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[16px] font-semibold text-foreground">{agent.custom_domain}</p><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${live ? "bg-primary/15 text-primary-glow" : "bg-amber/15 text-amber"}`}>{live ? "Live" : "Waiting for DNS"}</span></div>
          {!live && (
            <div className="mt-4 rounded-2xl border border-white/[0.08] p-4">
              <p className="text-[13px] font-semibold text-foreground">Add this record where your domain's DNS is managed</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Usually your registrar (Hostinger, Namecheap, GoDaddy…). Delete any existing A or CNAME record for the same name first.</p>
              <div className="mt-3 grid grid-cols-[70px_1fr] gap-y-2 text-[13px]"><span className="text-faint-foreground">Type</span><span className="text-foreground">CNAME</span><span className="text-faint-foreground">Name</span><span className="flex items-center gap-2 text-foreground">@ <span className="text-[11px] text-faint-foreground">(or {agent.custom_domain})</span></span><span className="text-faint-foreground">Value</span><span className="flex items-center gap-2 break-all text-foreground">{st?.cname_target ?? "stores-origin.datayego.com"}<button type="button" onClick={() => copy(st?.cname_target ?? "stores-origin.datayego.com")} className="text-faint-foreground" aria-label="Copy"><Copy size={13} /></button></span></div>
              <p className="mt-3 text-[11.5px] text-faint-foreground">If your registrar doesn't allow CNAME on the root (@), ask them for "CNAME flattening" or "ALIAS", or use www.{agent.custom_domain} instead. DNS changes take minutes to a few hours; the certificate is issued automatically once it's seen.</p>
            </div>
          )}
          {live && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-primary-glow"><Check size={14} />Your store is live at https://{agent.custom_domain}</p>}
          {st?.errors ? <p className="mt-2 text-[11.5px] text-amber">Cloudflare says: {JSON.stringify(st.errors)}</p> : null}
          <div className="mt-4 flex items-center gap-3"><button type="button" disabled={busy} onClick={() => void refresh()} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-3 py-1.5 text-[12.5px] text-foreground disabled:opacity-60"><RefreshCw size={13} className={busy ? "animate-spin" : ""} />Check again</button><button type="button" disabled={busy} onClick={() => void disconnect()} className="text-[12.5px] text-danger">Disconnect</button></div>
        </>)}
      </Section>
      <Section page="domain" id="perks" title="What your own domain gets you" icon={<Sparkles size={15} />}>
        <ul className="space-y-2 text-[13.5px] text-muted-foreground">
          {[["A real website address", `Customers see ${agent.custom_domain ?? "yourstore.com"}, not DataYego's name, on every page.`], ["Every link points to it", "Receipts, tracking links, announcement and support emails, your share link and your price list all use your domain. Old datayego.com/s/ links jump to it automatically."], ["Emails from your domain", `Optional: receipts and announcements come from hello@${agent.custom_domain ?? "yourstore.com"} once you add a few DNS records (below).`], ["Secure certificate, no setup", "HTTPS is issued and renewed for you."], ["Keep your subdomain too", `${agent.slug}.datayego.com keeps working as a spare address.`]].map(([t, d]) => <li key={t} className="flex gap-2"><span className="mt-0.5 text-primary-glow">✓</span><span><b className="text-foreground">{t}.</b> {d}</span></li>)}
        </ul>
      </Section>
      <Section page="domain" id="email-domain" title="Send email from your domain" icon={<Mail size={15} />} subtitle="Receipts and announcements from hello@yourdomain instead of DataYego's address.">
        <EmailDomain />
      </Section>
      {!agent.custom_domain && (
        <Section page="domain" id="buy-a-domain-through-us" title="Buy a domain through us" icon={<ShoppingCart size={15} />} subtitle={<>Don't have one? We register it and connect it to your store for you. <b className="text-foreground">.com GHS 250/yr</b> · <b className="text-foreground">.shop GHS 120/yr</b>. Usually live within 24 hours.</>}>
          <div className="mt-3 flex gap-2"><input value={buy} onChange={(e) => { setBuy(e.target.value); setQuote(null); }} placeholder="mystore.com or mystore.shop" autoCapitalize="none" className="onyx-field flex-1" /><button type="button" disabled={buying} onClick={() => void check()} className="rounded-full border border-white/[0.12] px-4 py-2 text-[13px] text-foreground disabled:opacity-60">Check</button></div>
          {quote && (
            <div className={`mt-3 rounded-2xl border p-4 ${quote.available === false ? "border-amber/30 bg-amber/5" : "border-primary-glow/30 bg-primary/5"}`}>
              {quote.available === false ? <p className="text-[13.5px] text-foreground"><b>{quote.domain}</b> is already taken. Try another name.</p> : (<>
                <p className="text-[13.5px] text-foreground"><b>{quote.domain}</b> {quote.available === null ? "looks available (we'll confirm when registering)" : "is available"} · <b>{formatGHS(quote.price)}</b> for 1 year</p>
                <p className="mt-1 text-[11.5px] text-faint-foreground">Plus the usual 4% payment fee. If it turns out to be taken, you get the full price back in your wallet.</p>
                <button type="button" disabled={buying} onClick={() => void pay()} className="onyx-btn-primary mt-3 px-5 py-2.5 text-[13.5px] disabled:opacity-60">{buying ? "Please wait…" : `Pay ${formatGHS(quote.price)} and register`}</button>
              </>)}
            </div>
          )}
        </Section>
      )}
      {orders.length > 0 && (
        <Section page="domain" id="domains-bought-through-us" title="Domains bought through us">
          <ul className="mt-2 divide-y divide-white/[0.06]">{orders.map((o) => <li key={o.id} className="flex items-center justify-between gap-3 py-2.5"><span><span className="block text-[13.5px] font-semibold text-foreground">{o.domain}</span><span className="block text-[11.5px] text-faint-foreground">{formatGHS(Number(o.price))} · {new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{o.expires_at ? ` · renews ${new Date(o.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span></span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${o.status === "live" || o.status === "registered" ? "bg-primary/15 text-primary-glow" : o.status === "paid" ? "bg-amber/15 text-amber" : "bg-white/[0.06] text-muted-foreground"}`}>{o.status === "paid" ? "Being set up" : o.status === "registered" ? "Registered" : o.status === "live" ? "Live" : o.status}</span></li>)}</ul>
        </Section>
      )}
    </div>
  );
}
