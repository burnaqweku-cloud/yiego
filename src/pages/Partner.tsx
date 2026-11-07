import { useEffect, useState } from "react";
import { Copy, Handshake } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/format";
import { loadPartnerDashboard, PARTNER_PACKAGES, partnerLink, projectEarnings, type PartnerDashboard } from "@/lib/partners";

const WHATSAPP = "https://wa.me/233508786777";

export default function Partner() {
  const [d, setD] = useState<PartnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void loadPartnerDashboard().then(({ data }) => { setD(data ?? null); setLoading(false); }); }, []);

  if (loading) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!d) return (
    <div className="space-y-6">
      <Seo title="Partners — DataYego" description="DataYego partner programme." path="/partner" noindex />
      <PageHeader eyebrow="Partners" title="Partner dashboard" subtitle="This account isn't a DataYego partner yet." />
      <section className="onyx-panel rounded-[24px] p-6 text-sm text-muted-foreground">Run a channel or community in Ghana? Message our team to join and earn on every bundle your audience buys.
        <div className="mt-4"><Button asChild><a href={WHATSAPP} target="_blank" rel="noreferrer">Contact the team</a></Button></div></section>
    </div>
  );

  const link = partnerLink(d.code);
  const rateKey = d.package === "starter" ? "starter" : "pro";
  const sample = d.rates.find((r) => Number(r.gb) === 2) ?? d.rates[0];
  return (
    <div className="space-y-6">
      <Seo title="Partner dashboard — DataYego" description="Your DataYego partner earnings." path="/partner" noindex />
      <PageHeader eyebrow="Partners" title={`Hi, ${d.name}`} subtitle={`${PARTNER_PACKAGES[d.package].name} package${d.status !== "active" ? " · paused" : ""}`} />

      <section className="onyx-panel rounded-[24px] p-5">
        <p className="text-xs text-muted-foreground">Your link</p>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copied"); }} className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-left">
          <span className="truncate font-mono text-sm font-semibold">{link}</span><Copy size={16} className="shrink-0 text-primary" />
        </button>
        <p className="mt-2 text-xs text-muted-foreground">You earn when someone buys through your link and the data is delivered.</p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Earnings to be paid", formatGHS(Number(d.owed))], ["Paid to you", formatGHS(Number(d.paid))], ["Orders today", d.orders_today], ["Orders this week", d.orders_week]].map(([k, v]) => (
          <div key={String(k)} className="onyx-panel rounded-2xl p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 font-display text-xl font-semibold">{v}</p></div>
        ))}
      </div>

      <section className="onyx-panel rounded-[24px] p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Handshake size={17} />What you earn per delivered order</h2>
        <div className="mt-3 divide-y divide-border text-sm">
          {d.rates.map((r) => <div key={r.name} className="flex justify-between py-2"><span>{r.name}</span><span className="font-semibold">{formatGHS(Number(r[rateKey]))}</span></div>)}
        </div>
        {sample && <p className="mt-3 text-xs text-muted-foreground">Example: 500 delivered {sample.name} orders = {formatGHS(projectEarnings(Number(sample[rateKey]), 500))}. This is an illustration, not a promise of sales.</p>}
      </section>

      <section className="onyx-panel rounded-[24px] p-5 text-sm">
        <h2 className="font-semibold">Packages</h2>
        <ul className="mt-3 space-y-2">
          {(Object.keys(PARTNER_PACKAGES) as (keyof typeof PARTNER_PACKAGES)[]).map((k) => (
            <li key={k} className={`rounded-xl border p-3 ${d.package === k ? "border-primary/40 bg-primary/10" : "border-border"}`}><b>{PARTNER_PACKAGES[k].name}</b>{d.package === k && " · your package"}<p className="text-xs text-muted-foreground">{PARTNER_PACKAGES[k].blurb}</p></li>
          ))}
        </ul>
        {d.package !== "premier" && <Button asChild variant="soft" className="mt-3"><a href={WHATSAPP} target="_blank" rel="noreferrer">Apply for an upgrade</a></Button>}
      </section>

      <section className="onyx-panel rounded-[24px] p-5 text-sm">
        <h2 className="font-semibold">Recent earnings</h2>
        {d.recent.length === 0 ? <p className="mt-3 text-muted-foreground">No delivered orders from your link yet.</p> : (
          <div className="mt-3 divide-y divide-border">
            {d.recent.map((e) => <div key={e.ref} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{e.bundle ?? "Bundle"} <span className="text-xs text-muted-foreground">· {new Date(e.created_at).toLocaleDateString("en-GH", { timeZone: "Africa/Accra" })}</span></span><span className={e.status === "void" ? "text-muted-foreground line-through" : "font-semibold"}>{formatGHS(Number(e.amount))}{e.status === "paid" && " ✓"}</span></div>)}
          </div>
        )}
      </section>
    </div>
  );
}
