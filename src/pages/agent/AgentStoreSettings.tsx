import { useEffect, useState } from "react";
import { BadgeCheck, Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { formatGHS } from "@/lib/format";
import { p1, useAgent } from "@/components/agent/AgentShell";

export default function AgentStoreSettings() {
  const { agent, quote, storeUrl, reload } = useAgent();
  const [f, setF] = useState({ store_name: agent.store_name, tagline: agent.tagline ?? "", whatsapp: agent.whatsapp ?? "", momo_number: agent.momo_number ?? "", momo_name: agent.momo_name ?? "" });
  const save = async () => { const { error } = await p1().rpc("agent_update_store", { p_store_name: f.store_name, p_tagline: f.tagline, p_momo_number: f.momo_number, p_momo_name: f.momo_name, p_whatsapp: f.whatsapp }); if (error) return toast.error(error.message); toast.success("Saved."); void reload(); };
  const [link, setLink] = useState(agent.slug); const [editingLink, setEditingLink] = useState(false);
  const [check, setCheck] = useState<{ slug: string; problem: string | null; next_change_at: string | null } | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  useEffect(() => {
    if (!editingLink) return;
    const t = setTimeout(() => { void p1().rpc("agent_slug_check", { p_slug: link }).then(({ data }: { data: typeof check }) => setCheck(data)); }, 350);
    return () => clearTimeout(t);
  }, [link, editingLink]);
  const origin = storeUrl.replace(/\/s\/.*$/, "").replace(/^https?:\/\//, "");
  const LINK_MSG: Record<string, string> = { too_short: "Use at least 3 letters or numbers.", too_long: "Keep it to 30 characters or fewer.", reserved: "That name is reserved. Try another.", taken: "Someone already has that link.", same: "That's your current link." };
  const cooldownUntil = check?.next_change_at ? new Date(check.next_change_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;
  const canSaveLink = !!check && !check.problem && !cooldownUntil && check.slug === link.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const saveLink = async () => {
    setSavingLink(true); const { data, error } = await p1().rpc("agent_change_slug", { p_slug: link }); setSavingLink(false);
    if (error) return toast.error(error.message.includes("cooldown") ? "You can change your link once every 30 days." : error.message.includes("taken") ? "Someone just took that link. Try another." : "Couldn't change your link. Try another name.");
    toast.success(`Your store is now at ${origin}/s/${(data as { slug: string }).slug}. The old link still works for 90 days.`);
    setEditingLink(false); setCheck(null); void reload();
  };
  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">{label}</span><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="onyx-field w-full" {...props} /></label>;
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[22px] font-semibold text-foreground">Store</h1>
      <div className="onyx-panel rounded-2xl p-4">
        <p className="text-[13.5px] font-semibold text-foreground">Your store</p>
        <a href={storeUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-primary-glow">{storeUrl.replace(/^https?:\/\//, "")}<ExternalLink size={12} /></a>
        {!editingLink ? (
          <button type="button" onClick={() => { setLink(agent.slug); setEditingLink(true); }} className="mt-1 block text-[12px] font-medium text-primary-glow">Change link</button>
        ) : (
          <div className="mt-3 space-y-2">
            <label className="block"><span className="mb-1 block text-[12px] text-muted-foreground">Store link</span>
              <div className="flex items-center gap-1"><span className="shrink-0 text-[12.5px] text-muted-foreground">{origin}/s/</span><input value={link} onChange={(e) => setLink(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={40} className="onyx-field w-full min-w-0" placeholder="your-store-name" /></div>
            </label>
            {check && check.slug !== link.trim().toLowerCase() && check.slug && <p className="text-[12px] text-muted-foreground">Will be saved as <b className="text-foreground">{check.slug}</b></p>}
            {check && (cooldownUntil ? <p className="text-[12px] text-amber">You changed your link recently. You can change it again from {cooldownUntil}.</p>
              : check.problem ? <p className="flex items-center gap-1 text-[12px] text-danger"><X size={13} />{LINK_MSG[check.problem] ?? "Not available."}</p>
              : <p className="flex items-center gap-1 text-[12px] text-primary-glow"><Check size={13} />Available</p>)}
            <p className="text-[11.5px] text-muted-foreground">Your old link keeps working for 90 days. You can change your link once every 30 days.</p>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => { setEditingLink(false); setCheck(null); }} className="px-3 py-2 text-[13px] text-muted-foreground">Cancel</button><button type="button" disabled={!canSaveLink || savingLink} onClick={() => void saveLink()} className="onyx-btn-primary px-4 py-2 text-[13px] disabled:opacity-50">{savingLink ? "Saving…" : "Use this link"}</button></div>
          </div>
        )}
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
