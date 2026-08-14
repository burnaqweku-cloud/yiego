/* ══════════════════════════════════════════════════════════════
   The site's canonical identity, in one place. Imported by the
   runtime (Seo component, structured data) AND by vite.config.ts
   at build time to generate sitemap.xml — so the sitemap, the
   canonical tags and the router never drift apart.
   ══════════════════════════════════════════════════════════════ */

export const SITE_ORIGIN = "https://datayego.com";
export const SITE_NAME = "DataYego";

/** The default social-share image (absolute URL required by scrapers). */
export const SITE_OG_IMAGE = `${SITE_ORIGIN}/brand/yiego-og-1200x630.png`;

export interface PublicRoute {
  path: string;
  priority: number;
  changefreq: "daily" | "weekly" | "monthly";
}

/** Every indexable public route. Add new landing pages here and they join
 *  the sitemap on the next build. Keep in sync with src/App.tsx. */
export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "/", priority: 1.0, changefreq: "daily" },
  { path: "/shop", priority: 0.9, changefreq: "daily" },
  { path: "/prices", priority: 0.9, changefreq: "daily" },
  { path: "/mtn-data-bundles", priority: 0.9, changefreq: "daily" },
  { path: "/telecel-data-bundles", priority: 0.9, changefreq: "daily" },
  { path: "/airteltigo-data-bundles", priority: 0.9, changefreq: "daily" },
  { path: "/faq", priority: 0.7, changefreq: "monthly" },
  { path: "/track-order", priority: 0.6, changefreq: "monthly" },
  { path: "/about", priority: 0.5, changefreq: "monthly" },
  { path: "/support", priority: 0.5, changefreq: "monthly" },
  { path: "/contact", priority: 0.5, changefreq: "monthly" },
  { path: "/legal/terms", priority: 0.3, changefreq: "monthly" },
  { path: "/legal/privacy", priority: 0.3, changefreq: "monthly" },
  { path: "/legal/refunds", priority: 0.3, changefreq: "monthly" },
];
