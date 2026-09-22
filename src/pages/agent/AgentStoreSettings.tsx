import { useState } from "react";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { p1, useAgent } from "@/components/agent/AgentShell";

export default function AgentStoreSettings() {
  const { agent, quote, storeUrl, reload } = useAgent();
  const [f, setF] = useState({ store_name: agent.store_name, tagline: agent.tagline ?? "", whatsapp: agent.whatsapp ?? "", momo_number: agent.momo_number ?? "", momo_name: agent.momo_name ?? "" });
  const save = async () => { const { error } = await p1().rpc("agent_update_store", { p_store_name: f.store_name, p_tagline: f.tagline, p_momo_number: f.momo_number, p_momo_name: f.momo_name, p_whatsapp: f.whatsapp }); if (error) return toast.error(error.message); toast.success("Saved."); void reload(); };
  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">{label}</span><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="onyx-field w-full" {...props} /></label>;
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Store</h1>
      <div className="onyx-panel rounded-2xl p-4">
        <p className="text-[13.5px] font-semibold text-foreground">Your store</p>
        <a href={storeUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-primary-glow">{storeUrl.replace(/^https?:\/\//, "")}<ExternalLink size={12} /></a>
        <p className="mt-2 flex items-center gap-1 text-[12px] text-muted-foreground"><BadgeCheck size={13} className="text-primary-glow" />Plan active until {agent.paid_until}{quote ? ` · next month ${formatGHS(quote.pay_now)}` : ""}</p>
      </div>
      <div className="onyx-panel space-y-3 rounded-2xl p-4">
        {field("store_name", "Store name")}
        {field("tagline", "Tagline", { placeholder: "Fast data, fair prices" })}
        {field("whatsapp", "WhatsApp number (shown on your store)", { inputMode: "tel", placeholder: "0241234567" })}
      </div>
      <div className="onyx-panel space-y-3 rounded-2xl p-4">
        <p className="text-[13.5px] font-semibold text-foreground">Where we pay your earnings</p>
        <div className="grid gap-3 sm:grid-cols-2">{field("momo_number", "MoMo number", { inputMode: "tel" })}{field("momo_name", "Name on MoMo")}</div>
      </div>
      <div className="flex justify-end"><button type="button" onClick={() => void save()} className="onyx-btn-primary px-5 py-2.5 text-[13.5px]">Save</button></div>
    </div>
  );
}
