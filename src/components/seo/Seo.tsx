import { useEffect } from "react";
import { SITE_NAME, SITE_OG_IMAGE, SITE_ORIGIN } from "@/lib/site";

/* ══════════════════════════════════════════════════════════════
   Per-route document head management, dependency-free. index.html
   carries the site-wide defaults for non-JS scrapers; this
   component overrides them the moment a route renders, giving
   every page its own title, description, canonical URL, share
   card and (optionally) JSON-LD structured data.
   ══════════════════════════════════════════════════════════════ */

interface SeoProps {
  /** Full document title — write it like a search result, brand last. */
  title: string;
  description: string;
  /** Route path beginning with "/", used for the canonical URL. */
  path: string;
  image?: string;
  noindex?: boolean;
  jsonLd?: object | object[];
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

export default function Seo({ title, description, path, image, noindex, jsonLd }: SeoProps) {
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : null;

  useEffect(() => {
    const url = SITE_ORIGIN + (path === "/" ? "/" : path);
    const shareImage = image ? (image.startsWith("http") ? image : SITE_ORIGIN + image) : SITE_OG_IMAGE;

    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    // A canonical on a noindexed page is a contradictory signal — remove it.
    if (noindex) document.head.querySelector('link[rel="canonical"]')?.remove();
    else upsertCanonical(url);
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", shareImage);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", shareImage);

    let script = document.getElementById("seo-jsonld") as HTMLScriptElement | null;
    if (jsonLdText) {
      if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = "seo-jsonld";
        document.head.appendChild(script);
      }
      script.textContent = jsonLdText;
    } else {
      script?.remove();
    }

    // A page that noindexes itself must not leak that to the next route.
    return () => {
      if (noindex) upsertMeta("name", "robots", "index, follow");
    };
  }, [title, description, path, image, noindex, jsonLdText]);

  return null;
}
