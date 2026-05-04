import { useEffect } from 'react';

const CANONICAL_DOMAIN = 'https://datasika.com';

/**
 * Client-side domain redirect.
 * If the current hostname is NOT datasika.com, redirect to datasika.com
 * preserving the path and query string.
 *
 * This handles:
 *   www.datasika.com  → datasika.com
 *   datasika.shop     → datasika.com
 *   www.datasika.shop → datasika.com
 *
 * For proper 301 redirects, server-side config (DNS / edge / CDN) is also needed.
 * This acts as a client-side safety net.
 */
const DomainRedirect = () => {
  useEffect(() => {
    const { hostname, pathname, search, hash } = window.location;

    // Skip redirect in development / preview environments
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.includes('lovable.app') ||
      hostname.includes('lovable.dev') ||
      hostname === 'datasika.com'
    ) {
      return;
    }

    // Redirect non-canonical domains to datasika.com
    const target = `${CANONICAL_DOMAIN}${pathname}${search}${hash}`;
    window.location.replace(target);
  }, []);

  return null;
};

export default DomainRedirect;
