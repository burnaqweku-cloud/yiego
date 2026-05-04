import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UserOrder {
  id: string;
  order_id: string;
  recipient_number: string;
  network: string;
  product_id: string | null;
  bundle_size_gb: number;
  amount_ghs: number;
  status: string;
  payment_method: string;
  payment_status: string | null;
  paystack_reference: string | null;
  delivery_note: string | null;
  failure_reason: string | null;
  /** Phase 2 — bulk dispatch queue state (queued | batched | sent) */
  queue_state: string | null;
  created_at: string;
  updated_at: string;
}

// Only select fields actually used by dashboard components.
// queue_state added in Phase 2 to drive customer-facing copy in OrderTracker.
const ORDER_SELECT = 'id, order_id, recipient_number, network, product_id, bundle_size_gb, amount_ghs, status, payment_method, payment_status, paystack_reference, delivery_note, failure_reason, queue_state, created_at, updated_at';

export function useUserOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    lastFetchRef.current = Date.now();
    setLoading(true);

    const { data } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('user_id', user.id)
      .neq('order_source', 'admin_bulk')
      .order('created_at', { ascending: false });

    if (data) setOrders(data as UserOrder[]);
    setLoading(false);
  }, [user]);

  // Initial fetch
  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: react to inserts and status updates instantly
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-orders-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as UserOrder;
            setOrders(prev => prev.some(o => o.id === row.id) ? prev : [row, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as UserOrder;
            setOrders(prev => prev.map(o => o.id === row.id ? { ...o, ...row } : o));
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as { id: string };
            setOrders(prev => prev.filter(o => o.id !== row.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Refresh when user returns to the tab (only if data is older than 15s — avoid spam)
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (Date.now() - lastFetchRef.current > 15_000) refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user, refresh]);

  return { orders, loading, refresh };
}
