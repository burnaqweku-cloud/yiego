import { useSearchParams } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import PageHeader from "@/components/layout/PageHeader";
import ApiAccessPanel from "@/components/api/ApiAccessPanel";
import Developers from "@/pages/Developers";
import { useFlows } from "@/store/flows";

/* Account -> API (owner, 24 Nov 2026): one place for everyone, agent or not, no agent plan needed.
   Two tabs: the seller's own API (apply, keys, wallet, webhooks) and the full documentation with its download. */
export default function AccountApi() {
  const { openAddMoney } = useFlows();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "docs" ? "docs" : "mine";
  const pick = (t: "mine" | "docs") => setParams(t === "docs" ? { tab: "docs" } : {}, { replace: true });
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5">
      <Seo title="API — DataYego" description="Sell DataYego bundles from your own website or app." path="/account/api" noindex />
      <PageHeader band title="API" subtitle="Let your website or app buy bundles from us automatically." />
      <div className="yg-seg grid grid-cols-2 gap-1 rounded-full bg-muted p-1" role="tablist">
        {([["mine", "My API"], ["docs", "Documentation"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => pick(k)}
            className={`rounded-full py-2.5 text-[14px] font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>
        ))}
      </div>
      {tab === "mine" ? <ApiAccessPanel variant="site" onTopUp={() => openAddMoney()} /> : <Developers embedded />}
    </div>
  );
}
