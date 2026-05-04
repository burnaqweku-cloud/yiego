import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Network, type OrderStatus, NETWORK_ORDER } from '@/data/bundles';
import { useAuth } from '@/hooks/useAuth';

export interface DbBundle {
  id: string;
  network: string;
  bundle_size_gb: number;
  price_ghs: number;
  delivery_type: string;
  active: boolean;
  popular: boolean;
  created_at: string;
  cost_price_ghs: number | null;
  markup_percent: number | null;
  description: string;
  agent_price_ghs: number | null;
  display_order: number;
  supplier_last_updated: string | null;
  expiry_type: string;
}

export interface DbOrder {
  id: string;
  order_id: string;
  user_id: string | null;
  recipient_number: string;
  network: string;
  product_id: string | null;
  bundle_size_gb: number;
  amount_ghs: number;
  status: string;
  payment_method: string;
  supplier_reference: string | null;
  supplier_order_id: string | null;
  supplier_status: string | null;
  supplier_message: string | null;
  supplier_amount: number | null;
  supplier_remaining_balance: number | null;
  supplier_timestamp: string | null;
  supplier_raw_response: string | null;
  delivery_note: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteNotice {
  id?: string;
  enabled: boolean;
  severity: 'info' | 'warning' | 'outage' | 'success';
  title: string;
  message: string;
  affected_network: string;
  start_time?: string | null;
  end_time?: string | null;
}

export interface SupportSettings {
  whatsapp_number: string;
  whatsapp_message: string;
}

interface AdminContextType {
  orders: DbOrder[];
  loadingOrders: boolean;
  refreshOrders: () => Promise<void>;
  addOrder: (order: Omit<DbOrder, 'id' | 'created_at' | 'updated_at' | 'supplier_order_id' | 'supplier_status' | 'supplier_message' | 'supplier_amount' | 'supplier_remaining_balance' | 'supplier_timestamp' | 'supplier_raw_response'>) => Promise<DbOrder | null>;
  updateOrder: (id: string, updates: Partial<DbOrder>) => Promise<void>;

  bundles: DbBundle[];
  loadingBundles: boolean;
  refreshBundles: () => Promise<void>;
  addBundle: (bundle: Omit<DbBundle, 'id' | 'created_at'>) => Promise<void>;
  updateBundle: (id: string, updates: Partial<DbBundle>) => Promise<void>;
  deleteBundle: (id: string) => Promise<void>;

  siteNotice: SiteNotice;
  updateSiteNotice: (updates: Partial<SiteNotice>) => Promise<void>;
  refreshSiteNotice: () => Promise<void>;

  supportSettings: SupportSettings;
  updateSupportSettings: (updates: Partial<SupportSettings>) => Promise<void>;
  refreshSupportSettings: () => Promise<void>;
}

const defaultNotice: SiteNotice = {
  enabled: false,
  severity: 'info',
  title: '',
  message: '',
  affected_network: 'All',
};

const defaultSupport: SupportSettings = {
  whatsapp_number: '233200000000',
  whatsapp_message: 'Hello YieGo Support, I need help with my order.',
};

const AdminContext = createContext<AdminContextType | null>(null);

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
};

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const { isAdminOrStaff, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [bundles, setBundles] = useState<DbBundle[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [siteNotice, setSiteNotice] = useState<SiteNotice>(defaultNotice);
  const [supportSettings, setSupportSettings] = useState<SupportSettings>(defaultSupport);
  const adminInitializedRef = useRef(false);
  const bundleRequestIdRef = useRef(0);
  const bundlesRef = useRef<DbBundle[]>([]);

  useEffect(() => {
    bundlesRef.current = bundles;
  }, [bundles]);

  const normalizeNetwork = useCallback((network: string) => {
    const normalized = network.trim().toLowerCase();
    if (normalized === 'mtn') return 'MTN';
    if (normalized === 'telecel' || normalized === 'vodafone') return 'Telecel';
    if (normalized === 'airteltigo' || normalized === 'airteltigo ') return 'AirtelTigo';
    return network.trim();
  }, []);

  const refreshBundles = useCallback(async () => {
    const requestId = ++bundleRequestIdRef.current;
    const hasExistingBundles = bundlesRef.current.length > 0;

    if (!hasExistingBundles) {
      setLoadingBundles(true);
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('active', true);

    if (requestId !== bundleRequestIdRef.current) return;

    if (error) {
      console.error('Error loading bundles:', error);
      setLoadingBundles(false);
      return;
    }

    const normalizedBundles = ((data ?? []) as unknown as DbBundle[])
      .map((bundle) => ({ ...bundle, network: normalizeNetwork(bundle.network) }))
      .filter((bundle) => bundle.active)
      .sort((a, b) => {
        const orderA = NETWORK_ORDER[a.network] ?? 99;
        const orderB = NETWORK_ORDER[b.network] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        if ((a.display_order || 0) !== (b.display_order || 0)) return (a.display_order || 0) - (b.display_order || 0);
        return a.bundle_size_gb - b.bundle_size_gb;
      });

    if (normalizedBundles.length > 0 || !hasExistingBundles) {
      setBundles(normalizedBundles);
    }

    setLoadingBundles(false);
  }, [normalizeNetwork]);

  const refreshOrders = useCallback(async () => {
    setLoadingOrders(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setOrders(data as unknown as DbOrder[]);
    setLoadingOrders(false);
  }, []);

  const refreshSiteNotice = useCallback(async () => {
    const { data } = await supabase
      .from('site_notices')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (data) {
      setSiteNotice({
        id: data.id,
        enabled: data.enabled,
        severity: data.severity as SiteNotice['severity'],
        title: data.title,
        message: data.message,
        affected_network: data.affected_network,
        start_time: data.start_time,
        end_time: data.end_time,
      });
    }
  }, []);

  const refreshSupportSettings = useCallback(async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value');
    if (data) {
      const settings: Record<string, string> = {};
      data.forEach((row: any) => { settings[row.key] = row.value; });
      setSupportSettings({
        whatsapp_number: settings.whatsapp_number || defaultSupport.whatsapp_number,
        whatsapp_message: settings.whatsapp_message || defaultSupport.whatsapp_message,
      });
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void refreshBundles();
  }, [authLoading, refreshBundles]);

  useEffect(() => {
    const revalidateBundles = () => {
      if (document.visibilityState === 'visible') {
        void refreshBundles();
      }
    };

    window.addEventListener('focus', revalidateBundles);
    window.addEventListener('online', revalidateBundles);
    document.addEventListener('visibilitychange', revalidateBundles);

    return () => {
      window.removeEventListener('focus', revalidateBundles);
      window.removeEventListener('online', revalidateBundles);
      document.removeEventListener('visibilitychange', revalidateBundles);
    };
  }, [refreshBundles]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAdminOrStaff) {
      setLoadingOrders(false);
      return;
    }

    if (adminInitializedRef.current) return;
    adminInitializedRef.current = true;

    void refreshSiteNotice();
    void refreshSupportSettings();
  }, [authLoading, isAdminOrStaff, refreshSiteNotice, refreshSupportSettings]);

  const addOrder = useCallback(async (order: Omit<DbOrder, 'id' | 'created_at' | 'updated_at' | 'supplier_order_id' | 'supplier_status' | 'supplier_message' | 'supplier_amount' | 'supplier_remaining_balance' | 'supplier_timestamp' | 'supplier_raw_response'>): Promise<DbOrder | null> => {
    const { data, error } = await supabase
      .from('orders')
      .insert(order as any)
      .select()
      .single();
    if (error) {
      console.error('Error creating order:', error);
      return null;
    }
    if (data) {
      const newOrder = data as unknown as DbOrder;
      setOrders(prev => [newOrder, ...prev]);
      return newOrder;
    }
    return null;
  }, []);

  const updateOrder = useCallback(async (orderId: string, updates: Partial<DbOrder>) => {
    const { error } = await supabase
      .from('orders')
      .update(updates as any)
      .eq('order_id', orderId);
    if (!error) {
      setOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, ...updates, updated_at: new Date().toISOString() } : o));
    }
  }, []);

  const addBundle = useCallback(async (bundle: Omit<DbBundle, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('products')
      .insert(bundle as any)
      .select()
      .single();
    if (!error && data) {
      setBundles(prev => [...prev, data as unknown as DbBundle]);
    }
  }, []);

  const updateBundle = useCallback(async (id: string, updates: Partial<DbBundle>) => {
    const { error } = await supabase
      .from('products')
      .update(updates as any)
      .eq('id', id);
    if (!error) {
      setBundles(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    }
  }, []);

  const deleteBundle = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    if (!error) {
      setBundles(prev => prev.filter(b => b.id !== id));
    }
  }, []);

  const updateSiteNotice = useCallback(async (updates: Partial<SiteNotice>) => {
    const newNotice = { ...siteNotice, ...updates };
    setSiteNotice(newNotice);

    // Normalize datetime-local strings (e.g. "2026-05-01T10:00") to ISO with tz.
    // Empty/invalid values become null so the row is treated as "no schedule".
    const toIso = (v: string | null | undefined): string | null => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };

    const payload = {
      enabled: newNotice.enabled,
      severity: newNotice.severity,
      title: newNotice.title,
      message: newNotice.message,
      affected_network: newNotice.affected_network,
      start_time: toIso(newNotice.start_time),
      end_time: toIso(newNotice.end_time),
    };

    if (siteNotice.id) {
      await supabase.from('site_notices').update(payload).eq('id', siteNotice.id);
    } else {
      // No row yet — insert and capture the id so future updates persist.
      const { data } = await supabase
        .from('site_notices')
        .insert(payload)
        .select()
        .maybeSingle();
      if (data?.id) setSiteNotice({ ...newNotice, id: data.id });
    }
  }, [siteNotice]);

  const updateSupportSettings = useCallback(async (updates: Partial<SupportSettings>) => {
    const newSettings = { ...supportSettings, ...updates };
    setSupportSettings(newSettings);

    for (const [key, value] of Object.entries(updates)) {
      await supabase
        .from('site_settings')
        .update({ value })
        .eq('key', key);
    }
  }, [supportSettings]);

  return (
    <AdminContext.Provider value={{
      orders, loadingOrders, refreshOrders, addOrder, updateOrder,
      bundles, loadingBundles, refreshBundles, addBundle, updateBundle, deleteBundle,
      siteNotice, updateSiteNotice, refreshSiteNotice,
      supportSettings, updateSupportSettings, refreshSupportSettings,
    }}>
      {children}
    </AdminContext.Provider>
  );
};
