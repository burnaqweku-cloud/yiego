import Seo from "@/components/seo/Seo";
import PageHeader from "@/components/layout/PageHeader";
import ApiAccessPanel from "@/components/api/ApiAccessPanel";
import { useFlows } from "@/store/flows";

/* Account -> API (owner, 21 Nov 2026: anybody can apply). The same page agents have in their dashboard. */
export default function AccountApi() {
  const { openAddMoney } = useFlows();
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5">
      <Seo title="Your API — DataYego" description="Sell DataYego bundles from your own website or app." path="/account/api" noindex />
      <PageHeader band title="Your API" subtitle="Let your website or app buy bundles from us automatically." />
      <ApiAccessPanel variant="site" onTopUp={() => openAddMoney()} />
    </div>
  );
}
