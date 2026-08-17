import { SITE_NAME, SITE_OG_IMAGE, SITE_ORIGIN } from "@/lib/site";

/* ══════════════════════════════════════════════════════════════
   JSON-LD builders. Structured data is what makes DataYego
   eligible for rich results: FAQ dropdowns under the listing,
   product/price snippets for bundles, and the knowledge-panel
   signals that make a new brand look established.
   ══════════════════════════════════════════════════════════════ */

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: SITE_OG_IMAGE,
    areaServed: { "@type": "Country", name: "Ghana" },
    description: "DataYego sells MTN, Telecel and AirtelTigo data bundles online in Ghana, delivered to any number in minutes.",
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_ORIGIN,
  };
}

export function faqPageLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function breadcrumbLd(crumbs: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: SITE_ORIGIN + crumb.path,
    })),
  };
}

/** Article markup for a blog post — what makes a guide eligible to show its
 *  published date and byline in search results. */
export function articleLd(post: { slug: string; heading: string; description: string; published: string; updated?: string }) {
  const url = `${SITE_ORIGIN}/blog/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.heading,
    description: post.description,
    datePublished: post.published,
    dateModified: post.updated ?? post.published,
    image: SITE_OG_IMAGE,
    inLanguage: "en-GH",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_ORIGIN,
      logo: { "@type": "ImageObject", url: SITE_OG_IMAGE },
    },
  };
}

/** Product + Offer markup for a network's bundle list (prices in GHS). */
export function bundleOffersLd(network: string, path: string, bundles: Array<{ name: string; price: number }>) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${network} data bundles`,
    brand: { "@type": "Brand", name: network },
    description: `${network} data bundles delivered in minutes by ${SITE_NAME}.`,
    url: SITE_ORIGIN + path,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "GHS",
      lowPrice: Math.min(...bundles.map((b) => b.price)),
      highPrice: Math.max(...bundles.map((b) => b.price)),
      offerCount: bundles.length,
      availability: "https://schema.org/InStock",
    },
  };
}
