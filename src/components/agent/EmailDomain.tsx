import { useState } from "react";
import { Check, Copy, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/components/agent/AgentShell";

/* Send store emails from the agent's own domain. Three states: not set up → DNS records to add
   (pending) → verified. Only offered once a custom domain is live on the store. */
type Rec = { type: string; name: string; value: string; ttl?: string; purpose?: string; status?: string };
export default function EmailDomain() {
  const { agent, reload } = useAgent();
  const live = agent.custom_domain_status === "active" && !!agent.custom_domain;
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<Rec[] | null>(agent.email_domain_records ?? null);
  const [status, setStatus] = useState<string | null>(agent.email_domain_status ?? null);
  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<{ status: string | null; records?: Rec[]; domain?: string; error?: string }>("store-email-domain", { body });
    setBusy(false);
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "Something went wrong."); return null; }
    setStatus(data?.status ?? null); if (data?.records) setRecords(data.records); void reload(); return data;
  };
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copied."); };
  if (!live) return <p className="text-[13px] text-muted-foreground">Connect your own domain first (above). Then your store's emails can come from an address on that domain instead of DataYego's.</p>;
  if (!status) return (
    <div>
      <p className="text-[13px] text-muted-foreground">Receipts, announcements and support emails to your customers currently come from <b className="text-foreground">{agent.store_name} &lt;stores@datayego.com&gt;</b>. Switch them to <b className="text-foreground">{agent.store_name} &lt;hello@{agent.custom_domain}&gt;</b> by adding a few DNS records so mail from your domain isn't marked as spam.</p>
      <button type="button" disabled={busy} onClick={() => void call({ action: "setup", domain: agent.custom_domain })} className="onyx-btn-primary mt-3 px-4 py-2.5 text-[13px] disabled:opacity-60"><Mail size={14} className="mr-1.5 inline" />{busy ? "Setting up…" : `Send email from ${agent.custom_domain}`}</button>
    </div>
  );
  return (
    <div>
      <div className="flex items-center justify-between gap-3"><p className="text-[15px] font-semibold text-foreground">hello@{agent.email_domain}</p><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status === "verified" ? "bg-primary/15 text-primary-glow" : status === "failed" ? "bg-danger/15 text-danger" : "bg-amber/15 text-amber"}`}>{status === "verified" ? "Verified" : status === "failed" ? "Check failed" : "Waiting for DNS"}</span></div>
      {status === "verified" ? <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-primary-glow"><Check size={14} />Your store's emails now come from your domain.</p> : (
        <div className="mt-3 rounded-2xl border border-white/[0.08] p-4">
          <p className="text-[13px] font-semibold text-foreground">Add these records where your domain's DNS is managed</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Same place you added the store CNAME. They can take up to an hour to be seen; tap Check again after adding them.</p>
          <ul className="mt-3 space-y-2">{(records ?? []).map((r, i) => <li key={i} className="rounded-xl bg-white/[0.03] p-3 text-[12.5px]"><div className="flex items-center justify-between"><span className="font-semibold text-foreground">{r.type}{r.purpose ? ` · ${r.purpose}` : ""}</span>{r.status && <span className="text-[11px] text-faint-foreground">{r.status.replace(/_/g, " ")}</span>}</div><div className="mt-1.5 grid grid-cols-[48px_1fr_auto] items-center gap-x-2 gap-y-1"><span className="text-faint-foreground">Name</span><span className="truncate text-foreground">{r.name}</span><button type="button" onClick={() => copy(r.name)} aria-label="Copy name" className="text-faint-foreground"><Copy size={13} /></button><span className="text-faint-foreground">Value</span><span className="truncate text-foreground">{r.value}</span><button type="button" onClick={() => copy(r.value)} aria-label="Copy value" className="text-faint-foreground"><Copy size={13} /></button></div></li>)}</ul>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        {status !== "verified" && <button type="button" disabled={busy} onClick={() => void call({ action: "status" })} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-4 py-2 text-[13px] text-foreground disabled:opacity-60"><RefreshCw size={13} className={busy ? "animate-spin" : ""} />Check again</button>}
        <button type="button" disabled={busy} onClick={() => { if (window.confirm("Stop sending from your domain? Emails go back to stores@datayego.com.")) void call({ action: "remove" }); }} className="text-[12.5px] text-faint-foreground">Remove</button>
      </div>
    </div>
  );
}
