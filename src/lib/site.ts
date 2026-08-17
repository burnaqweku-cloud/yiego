/* ══════════════════════════════════════════════════════════════
   The site's canonical identity and the meta for every indexable
   page, in one place. Three consumers read this list, which is
   why it lives here rather than inside the pages:

     1. the runtime <Seo> component (browsers, Google)
     2. vite.config.ts → dist/sitemap.xml
     3. vite.config.ts → a real HTML file per route, so WhatsApp
        and Facebook — which never run JavaScript — read the right
        title, description and URL for the exact link that was
        shared, not the homepage's.

   Because all three read the same entry, a shared link, the
   rendered page and the sitemap can never disagree.
   ══════════════════════════════════════════════════════════════ */

/* Relative, not the "@/" alias: vite.config.ts imports this module to build the
   sitemap and the per-route HTML, and the alias it defines is not available
   while its own config is being loaded. */
import { BLOG_INDEX_DESCRIPTION, BLOG_INDEX_TITLE, sortedPosts } from "../data/blog";

export const SITE_ORIGIN = "https://datayego.com";
export const SITE_NAME = "DataYego";

/** The default social-share image (absolute URL required by scrapers). */
export const SITE_OG_IMAGE = `${SITE_ORIGIN}/brand/yiego-og-1200x630.png`;

export interface PublicRoute {
  path: string;
  priority: number;
  changefreq: "daily" | "weekly" | "monthly";
  /** Written like a search result: the keyword phrase first, brand last. */
  title: string;
  description: string;
}

/** Every indexable public route. Add a new landing page here and it joins the
 *  sitemap, gets its own share-ready HTML file, and can feed its own <Seo>.
 *  Blog posts are appended automatically from src/data/blog.ts. */
const STATIC_ROUTES: PublicRoute[] = [
  {
    path: "/",
    priority: 1.0,
    changefreq: "daily",
    title: "DataYego — Buy Cheap MTN, Telecel & AirtelTigo Data Bundles in Ghana",
    description: "Buy data bundles online in Ghana. Cheap MTN, Telecel and AirtelTigo bundles delivered to any number in minutes — pay with Mobile Money or card, no account needed.",
  },
  {
    path: "/shop",
    priority: 0.9,
    changefreq: "daily",
    title: "Buy Data Bundles Online — MTN, Telecel & AirtelTigo | DataYego",
    description: "Browse live data bundles for every Ghana network and buy in two taps. Pay with Mobile Money, card or your DataYego wallet — delivered in minutes.",
  },
  {
    path: "/prices",
    priority: 0.9,
    changefreq: "daily",
    title: "Data Bundle Prices in Ghana Today — MTN, Telecel & AirtelTigo | DataYego",
    description: "Compare today's data bundle prices for MTN, Telecel and AirtelTigo in Ghana, live from DataYego's catalogue. Buy online with Mobile Money or card in minutes.",
  },
  {
    path: "/mtn-data-bundles",
    priority: 0.9,
    changefreq: "daily",
    title: "MTN Data Bundle Prices in Ghana — Buy Online in Minutes | DataYego",
    description: "Live MTN data bundle prices in Ghana. Buy online with Mobile Money or card and get data delivered to any MTN number in minutes — no account needed.",
  },
  {
    path: "/telecel-data-bundles",
    priority: 0.9,
    changefreq: "daily",
    title: "Telecel Data Bundle Prices Ghana (formerly Vodafone) — Buy Online | DataYego",
    description: "Live Telecel Ghana data bundle prices (formerly Vodafone). Buy online with Mobile Money or card — delivered to any Telecel number in minutes, no account needed.",
  },
  {
    path: "/airteltigo-data-bundles",
    priority: 0.9,
    changefreq: "daily",
    title: "AirtelTigo (AT) Data Bundle Prices Ghana — Buy Online | DataYego",
    description: "Live AirtelTigo data bundle prices in Ghana. Buy AT data online with Mobile Money or card — delivered to any AirtelTigo number in minutes, no account needed.",
  },
  {
    path: "/faq",
    priority: 0.7,
    changefreq: "monthly",
    title: "Frequently Asked Questions | DataYego",
    description: "How buying data on DataYego works: payments, delivery times, refunds, wallet and order tracking — answered simply.",
  },
  {
    path: "/track-order",
    priority: 0.6,
    changefreq: "monthly",
    title: "Track Your Data Order — DataYego",
    description: "Enter your YG- reference to see the live payment and delivery status of your DataYego data bundle order. No account needed.",
  },
  {
    path: "/about",
    priority: 0.5,
    changefreq: "monthly",
    title: "About DataYego — Ghana's Data Bundle Shop",
    description: "DataYego sells MTN, Telecel and AirtelTigo data bundles online, delivered to any Ghana number in minutes. Here's who we are and how it works.",
  },
  {
    path: "/support",
    priority: 0.5,
    changefreq: "monthly",
    title: "Help & Support — DataYego",
    description: "Get help any hour: the DataYego assistant answers instantly, and WhatsApp and email reach the team directly for orders, payments and refunds.",
  },
  {
    path: "/contact",
    priority: 0.5,
    changefreq: "monthly",
    title: "Contact DataYego — WhatsApp, Email & Support Hours",
    description: "Reach the DataYego team on WhatsApp or email. Send your YG- reference and the recipient number for the fastest help.",
  },
  {
    path: "/legal/terms",
    priority: 0.3,
    changefreq: "monthly",
    title: "Terms of Service | DataYego",
    description: "The terms that govern buying data bundles, wallet top-ups and orders on DataYego.",
  },
  {
    path: "/legal/privacy",
    priority: 0.3,
    changefreq: "monthly",
    title: "Privacy Policy | DataYego",
    description: "What DataYego collects, why, and how your details are protected when you buy data bundles.",
  },
  {
    path: "/legal/refunds",
    priority: 0.3,
    changefreq: "monthly",
    title: "Refund Policy | DataYego",
    description: "When DataYego refunds a data bundle order, how refunds are paid, and how to raise one.",
  },
];

/* The blog index and one entry per post, derived from the posts themselves so
   publishing a post is a single edit to src/data/blog.ts — the sitemap, the
   pre-rendered HTML and the page's own <Seo> all follow from it. */
const BLOG_ROUTES: PublicRoute[] = [
  {
    path: "/blog",
    priority: 0.8,
    changefreq: "weekly",
    title: BLOG_INDEX_TITLE,
    description: BLOG_INDEX_DESCRIPTION,
  },
  ...sortedPosts().map((post) => ({
    path: `/blog/${post.slug}`,
    priority: 0.7,
    changefreq: "monthly" as const,
    title: post.title,
    description: post.description,
  })),
];

export const PUBLIC_ROUTES: PublicRoute[] = [...STATIC_ROUTES, ...BLOG_ROUTES];

/** Props for <Seo> for one indexable route: `<Seo {...metaFor("/shop")} />`.
 *  Unknown paths fall back to the site title so a page can never render blank
 *  meta; pages that are deliberately not indexable pass their own strings. */
export function metaFor(path: string): { path: string; title: string; description: string } {
  const route = PUBLIC_ROUTES.find((entry) => entry.path === path);
  return {
    path,
    title: route?.title ?? SITE_NAME,
    description: route?.description ?? "",
  };
}

export function isPublicRoute(path: string) {
  return PUBLIC_ROUTES.some((entry) => entry.path === path);
}
