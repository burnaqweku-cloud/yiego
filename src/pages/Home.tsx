import { lazy, Suspense } from "react";
import Seo from "@/components/seo/Seo";
import { organizationLd, websiteLd } from "@/lib/structuredData";
import Hero from "@/components/home/Hero";
import TrustStrip from "@/components/home/TrustStrip";
import Categories from "@/components/home/Categories";

/**
 * The public homepage.
 *
 * Only the first screen (hero → trust → categories) is in the initial
 * bundle; everything below the fold is code-split and streamed in, so the
 * page paints fast on a Ghanaian mobile connection.
 */

const WhyYieGo = lazy(() => import("@/components/home/WhyYieGo"));
const FeaturedBundles = lazy(() => import("@/components/home/FeaturedBundles"));
const HowItWorks = lazy(() => import("@/components/home/HowItWorks"));
const Testimonials = lazy(() => import("@/components/home/Testimonials"));
const FaqPreview = lazy(() => import("@/components/home/FaqPreview"));
const FinalCta = lazy(() => import("@/components/home/FinalCta"));

/** Reserves height while a below-the-fold section loads, so nothing jumps. */
function SectionFallback() {
  return <div className="min-h-[420px]" aria-hidden="true" />;
}

export default function Home() {
  return (
    <>
      <Seo
        title="DataYego — Buy Cheap MTN, Telecel & AirtelTigo Data Bundles in Ghana"
        description="Buy data bundles online in Ghana. Cheap MTN, Telecel and AirtelTigo bundles delivered to any number in minutes — pay with Mobile Money or card, no account needed."
        path="/"
        jsonLd={[organizationLd(), websiteLd()]}
      />
      <Hero />
      <TrustStrip />
      <Categories />

      <Suspense fallback={<SectionFallback />}>
        <div className="mk-wrap">
          <hr className="mk-rule" />
        </div>
        <WhyYieGo />
        <FeaturedBundles />
        <div className="mk-wrap">
          <hr className="mk-rule" />
        </div>
        <HowItWorks />
        <Testimonials />
        <FaqPreview />
        <FinalCta />
      </Suspense>
    </>
  );
}
