import { useEffect } from 'react';

const CANONICAL_DOMAIN = 'https://yiego.com';

/**
 * Client-side domain redirect.
 * If the current hostname is NOT yiego.com, redirect to yiego.com
 * preserving the path and query string.
 *
 * This handles:
 *   www.yiego.com  → yiego.com
 *   yiego.com     → yiego.com
 *   www.yiego.com → yiego.com
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
      hostname === 'yiego.com'
    ) {
      return;
    }

    // Redirect non-canonical domains to yiego.com
    const target = `${CANONICAL_DOMAIN}${pathname}${search}${hash}`;
    window.location.replace(target);
  }, []);

  return null;
};

export default DomainRedirect;
