import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, Check, Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { p1, useAgent } from "@/components/agent/AgentShell";
import StoreBrandingEditor from "@/components/agent/StoreBrandingEditor";
import StoreLinkEditor from "@/components/agent/StoreLinkEditor";
import Section from "@/components/agent/Section";
import { Store, Wallet, Mail } from "lucide-react";

export default function AgentStoreSettings() {
  const { agent, quote, storeUrl, reload } = useAgent();
  const { view } = useParams();
  const [f, setF] = useState({ store_name: agent.store_name, header_name: agent.header_name ?? "", tagline: agent.tagline ?? "", whatsapp: agent.whatsapp ?? "", momo_number: agent.momo_number ?? "", momo_name: agent.momo_name ?? "" });
  const headLen = f.header_name.trim().length;
  const save = async () => {
    if (headLen > 20) return toast.error("Keep the header name to 20 characters or fewer.");
    const { error } = await p1().rpc("agent_update_store", { p_store_name: f.store_name, p_tagline: f.tagline, p_momo_number: f.momo_number, p_momo_name: f.momo_name, p_whatsapp: f.whatsapp });
    if (error) return toast.error(error.message);
    if (f.header_name.trim() !== (agent.header_name ?? "")) {
      const { error: e2 } = await p1().rpc("agent_update_branding", { p: { header_name: f.header_name.trim() } });
      if (e2) return toast.error(e2.message.includes("header_name_too_long") ? "Keep the header name to 20 characters or fewer." : "Couldn't save the header name. Try again.");
    }
    toast.success("Saved."); void reload();
  };
  const addresses = [...(agent.custom_domain && agent.custom_domain_status === "active" ? [`https://${agent.custom_domain}`] : []), `https://${agent.slug}.datayego.com`];
  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">{label}</span><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="onyx-field w-full" {...props} /></label>;
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Store</h1>
      {(!view || view === "details") && <div className="onyx-panel rounded-2xl p-4">
        <p className="text-[13.5px] font-semibold text-foreground">Your store</p>
        <div className="mt-2 space-y-1.5">
          {addresses.map((u) => <div key={u} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2"><a href={u} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-[12.5px] text-primary-glow">{u.replace(/^https?:\/\//, "")}<ExternalLink size={12} className="shrink-0" /></a><button type="button" onClick={() => { void navigator.clipboard.writeText(u); toast.success("Copied."); }} className="shrink-0 text-faint-foreground" aria-label="Copy link"><Copy size={13} /></button></div>)}
        </div>
        <p className="mt-1.5 text-[11.5px] text-faint-foreground">{agent.custom_domain && agent.custom_domain_status === "active" ? "Your own domain is the main address; the free one keeps working too." : "This is your store's address. Share it anywhere; previews on WhatsApp show your store's name and logo."}</p>
        <StoreLinkEditor />
        <p className="mt-2 flex items-center gap-1 text-[12px] text-muted-foreground"><BadgeCheck size={13} className="text-primary-glow" />Plan active until {agent.paid_until}{quote ? ` · next month ${formatGHS(quote.pay_now)}` : ""}</p>
      </div>}
      <Section page="store" id="details" title="Store details" icon={<Store size={15} />} subtitle={`${agent.store_name}${agent.tagline ? " · " + agent.tagline : ""}`} defaultOpen>
        <div className="space-y-3">
          {field("store_name", "Store name (shown in full on your store's banner)")}
          <label className="block">
            <span className="mb-1 flex items-baseline justify-between text-[12px] text-muted-foreground"><span>Header name (the top bar of your store)</span><span className={headLen > 20 ? "text-danger" : ""}>{headLen}/20</span></span>
            <input value={f.header_name} onChange={(e) => setF({ ...f, header_name: e.target.value })} maxLength={20} className="onyx-field w-full" placeholder={f.store_name.trim().length <= 20 ? f.store_name : "e.g. Urban Data Store"} />
            <span className="mt-1 block text-[11.5px] text-faint-foreground">A short name that fits the top bar on every phone. Leave it empty to use your store name{f.store_name.trim().length > 20 ? " (we'll shorten it for you, because it's over 20 characters)" : ""}.</span>
          </label>
          {field("tagline", "Tagline", { placeholder: "Fast data, fair prices" })}
          {field("whatsapp", "WhatsApp number (shown on your store)", { inputMode: "tel", placeholder: "0241234567" })}
        </div>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void save()} className="onyx-btn-primary px-5 py-2.5 text-[13.5px]">Save</button></div>
      </Section>
      <Section page="store" id="payout" title="Where we pay your earnings" icon={<Wallet size={15} />} subtitle={agent.momo_number ? `MoMo ${agent.momo_number}${agent.momo_name ? " · " + agent.momo_name : ""}` : "Add your MoMo number"}>
        <div className="grid gap-3 sm:grid-cols-2">{field("momo_number", "MoMo number", { inputMode: "tel" })}{field("momo_name", "Name on MoMo")}</div>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void save()} className="onyx-btn-primary px-5 py-2.5 text-[13.5px]">Save</button></div>
      </Section>
      <Section page="store" id="alerts" title="Sale alerts" icon={<Mail size={15} />} badge={(agent.sale_alert_email ?? true) ? "On" : "Off"} subtitle="A short email when a customer pays on your store.">
        <label className="flex items-start justify-between gap-3"><span className="block text-[12.5px] text-muted-foreground">Email me on every sale, with the bundle, number and your profit.</span><input type="checkbox" defaultChecked={agent.sale_alert_email ?? true} onChange={(e) => void p1().rpc("agent_set_sale_alert", { p_on: e.target.checked }).then(({ error }) => error ? toast.error("Couldn't save.") : toast.success(e.target.checked ? "Sale alerts on." : "Sale alerts off."))} className="mt-1 h-5 w-5" /></label>
      </Section>
      <StoreBrandingEditor />
    </div>
  );
}
