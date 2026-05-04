import { useEffect } from 'react';

const CANONICAL_HOST = 'yiego.shop';
const CANONICAL_DOMAIN = `https://${CANONICAL_HOST}`;

/**
 * Client-side domain redirect.
 * Forces all non-canonical hosts (e.g. www.yiego.shop, legacy yiego.com) to https://yiego.shop
 * preserving path, query, and hash.
 */
const DomainRedirect = () => {
  useEffect(() => {
    const { hostname, pathname, search, hash, protocol } = window.location;

    // Skip redirect in development / preview environments
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.lovable.app') ||
      hostname.endsWith('.lovable.dev')
    ) {
      return;
    }

    // Already canonical (https + apex yiego.shop) — do nothing
    if (hostname === CANONICAL_HOST && protocol === 'https:') return;

    const target = `${CANONICAL_DOMAIN}${pathname}${search}${hash}`;
    window.location.replace(target);
  }, []);

  return null;
};

export default DomainRedirect;
