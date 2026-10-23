import { useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/admin/ui";
import { promotionAdLink } from "@/lib/promotionAnalytics";

export default function PromotionAdLinks() {
  const [source, setSource] = useState("tiktok");
  const [campaign, setCampaign] = useState("first-purchase");
  const link = useMemo(() => promotionAdLink(source, campaign), [source, campaign]);
  const copy = (value: string) => {
    void navigator.clipboard.writeText(value).then(() => toast.success("Link copied.")).catch(() => toast.error("Couldn’t copy the link."));
  };
  return <div className="space-y-6">
    <section className="space-y-3 border-b border-border pb-5">
      <h2 className="text-sm font-semibold text-foreground">Promotion page</h2>
      <div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-sm leading-6 text-foreground">https://datayego.com/promo</code><Button size="icon" variant="soft" aria-label="Copy promotion link" title="Copy promotion link" onClick={() => copy("https://datayego.com/promo")}><Copy size={15} /></Button><Button size="icon" variant="ghost" asChild><a href="/promo" target="_blank" rel="noreferrer" aria-label="Open promotion page" title="Open promotion page"><ExternalLink size={15} /></a></Button></div>
    </section>
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Social ad link</h2>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Source"><select className={inputCls} value={source} onChange={e => setSource(e.target.value)}>{["tiktok", "facebook", "instagram", "whatsapp", "youtube"].map(s => <option key={s} value={s}>{s === "tiktok" ? "TikTok" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></Field><Field label="Campaign name"><input className={inputCls} value={campaign} maxLength={120} onChange={e => setCampaign(e.target.value)} /></Field></div>
      <div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs leading-6 text-muted-foreground">{link}</code><Button size="icon" variant="soft" aria-label="Copy social ad link" title="Copy social ad link" onClick={() => copy(link)}><Copy size={15} /></Button></div>
    </section>
  </div>;
}