import { lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { agentsStatus, myAgentStatus, previewRequested } from "@/lib/agents";
import { useAuth } from "@/store/auth-context";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import { organizationLd, websiteLd } from "@/lib/structuredData";
import Hero from "@/components/home/Hero";
import { AgentNudge } from "@/components/agents/AgentPopup";
import Facts from "@/components/home/Facts";
import HowItWorks from "@/components/home/HowItWorks";
import BecomeAgent from "@/components/home/BecomeAgent";

/**
 * The public homepage: the price board is the product, everything below it
 * answers the questions a first-time buyer has. The hero, the facts and the
 * steps ship in the initial bundle; the rest streams in below the fold.
 */

const FaqPreview = lazy(() => import("@/components/home/FaqPreview"));
const FinalCta = lazy(() => import("@/components/home/FinalCta"));

/** Reserves height while a below-the-fold section loads, so nothing jumps. */
function SectionFallback() {
  return <div className="min-h-[420px]" aria-hidden="true" />;
}

export default function Home() {
  const navigate = useNavigate(); const { isAuthenticated } = useAuth();
  // Agents open on their dashboard; "Browse the site" on the dashboard lets them see it as a customer.
  useEffect(() => {
    if (!isAuthenticated || sessionStorage.getItem("yg-agent-browse") === "1") return;
    void agentsStatus().then(async ({ launched }) => { if (!(launched || previewRequested())) return; const me = await myAgentStatus(); if (me?.is_agent && me.agent_status === "active" && sessionStorage.getItem("yg-agent-browse") !== "1") navigate("/agent", { replace: true }); });
  }, [isAuthenticated, navigate]);
  return (
    <>
      <Seo {...metaFor("/")} jsonLd={[organizationLd(), websiteLd()]} />
      <Hero />
      <AgentNudge />
      <Facts />
      <div className="mk-wrap"><hr className="mk-rule" /></div>
      <HowItWorks />
      <BecomeAgent />
      <Suspense fallback={<SectionFallback />}>
        <FaqPreview />
        <FinalCta />
      </Suspense>
    </>
  );
}
