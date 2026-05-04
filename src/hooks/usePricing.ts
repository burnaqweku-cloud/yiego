import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DbBundle } from '@/contexts/AdminContext';

export type AgentPricingMethod =
  | 'retail_minus_fixed'      // Agent Base = Retail - GHS discount
  | 'retail_minus_percent'    // Agent Base = Retail × (1 - discount%)
  | 'cost_plus_fixed'         // Agent Base = Supplier Cost + GHS buffer
  | 'cost_plus_percent';      // Agent Base = Supplier Cost × (1 + buffer%)

export interface PricingConfig {
  default_markup_percent: number;
  mtn_markup_percent: number | null;
  telecel_markup_percent: number | null;
  airteltigo_markup_percent: number | null;
  rounding_mode: string;
  rounding_step: number;
  normal_markup_type: 'percent' | 'fixed';
  normal_markup_fixed: number;
  // Agent pricing
  agent_pricing_method: AgentPricingMethod;
  agent_discount_fixed: number;
  agent_discount_percent: number;
  agent_buffer_fixed: number;
  agent_buffer_percent: number;
  // Per-network agent overrides
  agent_mtn_value: number | null;
  agent_telecel_value: number | null;
  agent_airteltigo_value: number | null;
}

export interface PricingOverride {
  id: string;
  product_id: string;
  customer_type: 'normal' | 'agent';
  pricing_mode: 'auto' | 'manual';
  manual_price: number | null;
  markup_percent_override: number | null;
  updated_by: string | null;
  updated_at: string;
}

const defaultConfig: PricingConfig = {
  default_markup_percent: 15,
  mtn_markup_percent: null,
  telecel_markup_percent: null,
  airteltigo_markup_percent: null,
  rounding_mode: '2_decimals',
  rounding_step: 0.01,
  normal_markup_type: 'percent',
  normal_markup_fixed: 0,
  agent_pricing_method: 'retail_minus_percent',
  agent_discount_fixed: 0.50,
  agent_discount_percent: 10,
  agent_buffer_fixed: 0.20,
  agent_buffer_percent: 5,
  agent_mtn_value: null,
  agent_telecel_value: null,
  agent_airteltigo_value: null,
};

export function usePricing() {
  const [config, setConfig] = useState<PricingConfig>(defaultConfig);
  const [overrides, setOverrides] = useState<PricingOverride[]>([]);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [serverPrices, setServerPrices] = useState<Record<string, number>>({});
  const [serverPricesLoaded, setServerPricesLoaded] = useState(false);

  useEffect(() => {
    loadAll();
    fetchServerPrices();
    const handleFocus = () => fetchServerPrices();
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(fetchServerPrices, 60000);
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, []);

  const fetchServerPrices = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-public-prices');
      if (!error && data?.prices) {
        setServerPrices(data.prices);
        setServerPricesLoaded(true);
      }
    } catch (e) {
      console.error('[usePricing] Failed to fetch server prices:', e);
    }
  };

  const loadAll = async () => {
    setLoadingPricing(true);
    const [settingsRes, overridesRes] = await Promise.all([
      supabase.from('site_settings').select('key, value'),
      supabase.from('pricing_overrides').select('*'),
    ]);

    if (settingsRes.data) {
      const s: Record<string, string> = {};
      settingsRes.data.forEach((row: any) => { s[row.key] = row.value; });
      setConfig({
        default_markup_percent: parseFloat(s.default_markup_percent) || 15,
        mtn_markup_percent: s.mtn_markup_percent ? parseFloat(s.mtn_markup_percent) : null,
        telecel_markup_percent: s.telecel_markup_percent ? parseFloat(s.telecel_markup_percent) : null,
        airteltigo_markup_percent: s.airteltigo_markup_percent ? parseFloat(s.airteltigo_markup_percent) : null,
        rounding_mode: s.rounding_mode || '2_decimals',
        rounding_step: parseFloat(s.rounding_step) || 0.01,
        normal_markup_type: (s.normal_markup_type as 'percent' | 'fixed') || 'percent',
        normal_markup_fixed: parseFloat(s.normal_markup_fixed) || 0,
        agent_pricing_method: (s.agent_pricing_method as AgentPricingMethod) || 'retail_minus_percent',
        agent_discount_fixed: parseFloat(s.agent_discount_fixed) || 0.50,
        agent_discount_percent: parseFloat(s.agent_discount_percent) || 10,
        agent_buffer_fixed: parseFloat(s.agent_buffer_fixed) || 0.20,
        agent_buffer_percent: parseFloat(s.agent_buffer_percent) || 5,
        agent_mtn_value: s.agent_mtn_value ? parseFloat(s.agent_mtn_value) : null,
        agent_telecel_value: s.agent_telecel_value ? parseFloat(s.agent_telecel_value) : null,
        agent_airteltigo_value: s.agent_airteltigo_value ? parseFloat(s.agent_airteltigo_value) : null,
      });
    }

    if (overridesRes.data) {
      setOverrides(overridesRes.data as unknown as PricingOverride[]);
    }

    setLoadingPricing(false);
  };

  const refreshPricing = useCallback(async () => {
    await Promise.all([loadAll(), fetchServerPrices()]);
  }, []);

  const getMarkupForNetwork = useCallback((network: string): number => {
    const networkLower = network.toLowerCase();
    if (networkLower === 'mtn' && config.mtn_markup_percent !== null) return config.mtn_markup_percent;
    if (networkLower === 'telecel' && config.telecel_markup_percent !== null) return config.telecel_markup_percent;
    if (networkLower === 'airteltigo' && config.airteltigo_markup_percent !== null) return config.airteltigo_markup_percent;
    return config.default_markup_percent;
  }, [config]);

  const applyRounding = useCallback((price: number): number => {
    if (price < 0) return 0;
    const step = config.rounding_step || 0.01;
    if (config.rounding_mode === 'nearest_005') {
      return Math.round(price * 20) / 20;
    }
    if (config.rounding_mode === 'nearest_010') {
      return Math.round(price * 10) / 10;
    }
    if (step > 0.01) {
      return Math.ceil(price / step) * step;
    }
    return Math.round(price * 100) / 100;
  }, [config.rounding_mode, config.rounding_step]);

  const computeNormalAutoPrice = useCallback((bundle: DbBundle): number | null => {
    const costPrice = bundle.cost_price_ghs != null ? Number(bundle.cost_price_ghs) : null;
    if (costPrice === null || costPrice <= 0) return null;

    if (bundle.markup_percent != null) {
      return applyRounding(costPrice * (1 + Number(bundle.markup_percent) / 100));
    }

    if (config.normal_markup_type === 'fixed') {
      return applyRounding(costPrice + config.normal_markup_fixed);
    }

    const markup = getMarkupForNetwork(bundle.network);
    return applyRounding(costPrice * (1 + markup / 100));
  }, [config, getMarkupForNetwork, applyRounding]);

  const getSellingPrice = useCallback((bundle: DbBundle): number => {
    const serverPrice = serverPrices[bundle.id];
    if (serverPrice != null && serverPricesLoaded) {
      return serverPrice;
    }

    const override = overrides.find(o => o.product_id === bundle.id && o.customer_type === 'normal');
    
    if (override?.pricing_mode === 'manual' && override.manual_price != null && override.manual_price > 0) {
      return Number(override.manual_price);
    }

    if (override?.markup_percent_override != null) {
      const costPrice = bundle.cost_price_ghs != null ? Number(bundle.cost_price_ghs) : null;
      if (costPrice && costPrice > 0) {
        return applyRounding(costPrice * (1 + Number(override.markup_percent_override) / 100));
      }
    }

    const autoPrice = computeNormalAutoPrice(bundle);
    if (autoPrice !== null) return autoPrice;

    return Number(bundle.price_ghs);
  }, [serverPrices, serverPricesLoaded, overrides, computeNormalAutoPrice, applyRounding]);

  /**
   * Get the per-network agent override value, or null if not set.
   */
  const getAgentNetworkValue = useCallback((network: string): number | null => {
    const n = network.toLowerCase();
    if (n === 'mtn') return config.agent_mtn_value;
    if (n === 'telecel') return config.agent_telecel_value;
    if (n === 'airteltigo') return config.agent_airteltigo_value;
    return null;
  }, [config]);

  /**
   * Compute agent base price from global settings for a bundle.
   * This is the "auto" calculation.
   */
  const computeAgentAutoPrice = useCallback((bundle: DbBundle): number => {
    const retailPrice = getSellingPrice(bundle);
    const costPrice = bundle.cost_price_ghs != null ? Number(bundle.cost_price_ghs) : 0;
    const networkOverride = getAgentNetworkValue(bundle.network);
    const method = config.agent_pricing_method;

    let basePrice: number;

    switch (method) {
      case 'retail_minus_fixed': {
        const discount = networkOverride ?? config.agent_discount_fixed;
        basePrice = retailPrice - discount;
        break;
      }
      case 'retail_minus_percent': {
        const discountPct = networkOverride ?? config.agent_discount_percent;
        basePrice = retailPrice * (1 - discountPct / 100);
        break;
      }
      case 'cost_plus_fixed': {
        const buffer = networkOverride ?? config.agent_buffer_fixed;
        basePrice = costPrice > 0 ? costPrice + buffer : retailPrice * 0.85;
        break;
      }
      case 'cost_plus_percent': {
        const bufferPct = networkOverride ?? config.agent_buffer_percent;
        basePrice = costPrice > 0 ? costPrice * (1 + bufferPct / 100) : retailPrice * 0.85;
        break;
      }
      default:
        basePrice = retailPrice * 0.9;
    }

    return applyRounding(Math.max(basePrice, 0));
  }, [config, getSellingPrice, getAgentNetworkValue, applyRounding]);

  /**
   * Get selling price for AGENT customers (agent base price).
   * Manual override > auto from global settings > fallback
   */
  const getAgentPrice = useCallback((bundle: DbBundle): number => {
    const override = overrides.find(o => o.product_id === bundle.id && o.customer_type === 'agent');
    
    if (override?.pricing_mode === 'manual' && override.manual_price != null && override.manual_price > 0) {
      return Number(override.manual_price);
    }

    return computeAgentAutoPrice(bundle);
  }, [overrides, computeAgentAutoPrice]);

  const getOverride = useCallback((productId: string, customerType: 'normal' | 'agent'): PricingOverride | undefined => {
    return overrides.find(o => o.product_id === productId && o.customer_type === customerType);
  }, [overrides]);

  return {
    config,
    overrides,
    loadingPricing,
    refreshPricing,
    getSellingPrice,
    getAgentPrice,
    getMarkupForNetwork,
    applyRounding,
    computeNormalAutoPrice,
    computeAgentAutoPrice,
    getOverride,
    serverPricesLoaded,
    getAgentNetworkValue,
  };
}