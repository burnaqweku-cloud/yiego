import { useEffect } from 'react';

const CANONICAL_DOMAIN = 'https://yiego.com';

interface SEOHeadProps {
  title?: string;
  description?: string;
  path?: string;
  ogImage?: string;
  noIndex?: boolean;
}

const defaultMeta = {
  title: 'YieGo | Buy Data Bundles in Ghana',
  description:
    'Buy affordable MTN, Telecel & AirtelTigo data bundles in Ghana. Fast delivery, secure payments, and easy ordering. YieGo is online 24/7.',
  ogImage: `${CANONICAL_DOMAIN}/og-image.png`,
};

/**
 * Sets document <title>, meta description, canonical, Open Graph & Twitter tags.
 * Runs on mount and whenever props change.
 */
const SEOHead = ({
  title,
  description,
  path,
  ogImage,
  noIndex = false,
}: SEOHeadProps) => {
  useEffect(() => {
    const fullTitle = title || defaultMeta.title;
    const fullDesc = description || defaultMeta.description;
    const canonicalUrl = path ? `${CANONICAL_DOMAIN}${path}` : CANONICAL_DOMAIN;
    const image = ogImage || defaultMeta.ogImage;

    // Title
    document.title = fullTitle;

    // Helper to set or create a <meta> tag
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Standard meta
    setMeta('name', 'description', fullDesc);
    setMeta('name', 'keywords', 'Buy MTN data Ghana, Telecel data bundles, AirtelTigo data, Ghana data top up, cheap data Ghana, data delivery platform');

    // Robots
    if (noIndex) {
      setMeta('name', 'robots', 'noindex, nofollow');
    } else {
      setMeta('name', 'robots', 'index, follow');
    }

    // Canonical link
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    // Open Graph
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', fullDesc);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', 'YieGo');
    setMeta('property', 'og:locale', 'en_GH');

    // Twitter
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', fullDesc);
    setMeta('name', 'twitter:image', image);

    return () => {
      // Cleanup not strictly needed since we overwrite on re-mount
    };
  }, [title, description, path, ogImage, noIndex]);

  return null; // This component only manages <head> side-effects
};

export default SEOHead;
