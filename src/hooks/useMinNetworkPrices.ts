import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Network } from '@/data/bundles';
import { NETWORKS } from '@/data/bundles';

export interface MinNetworkPrices {
  prices: Record<Network, number | null>;
  loading: boolean;
}

/**
 * Fetches products + server-computed prices and returns
 * the minimum selling price per network.
 * Uses the same get-public-prices edge function as checkout.
 */
export function useMinNetworkPrices(): MinNetworkPrices {
  const [prices, setPrices] = useState<Record<Network, number | null>>({
    MTN: null,
    Telecel: null,
    AirtelTigo: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      try {
        // Fetch products and server prices in parallel
        const [productsRes, pricesRes] = await Promise.all([
          supabase.from('products').select('id, network, active').eq('active', true),
          supabase.functions.invoke('get-public-prices'),
        ]);

        if (cancelled) return;

        const products = productsRes.data || [];
        const serverPrices: Record<string, number> = pricesRes.data?.prices || {};

        const mins: Record<Network, number | null> = { MTN: null, Telecel: null, AirtelTigo: null };

        for (const product of products) {
          const price = serverPrices[product.id];
          if (price == null) continue;
          const net = product.network as Network;
          if (!NETWORKS.includes(net)) continue;
          if (mins[net] === null || price < mins[net]!) {
            mins[net] = price;
          }
        }

        if (!cancelled) {
          setPrices(mins);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();

    // Refresh on focus and every 60s
    const onFocus = () => fetch();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(fetch, 60000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);

  return { prices, loading };
}
