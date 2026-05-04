import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Orders bottom-tab badge.
 *
 * Counts orders whose status has changed since the user's last visit to
 * the Orders list page. Newly placed orders (created after last visit) are
 * excluded — the user already knows about those.
 *
 * Source of truth: profiles.orders_last_seen_at (per-user).
 *  - NULL = never seen → badge is 0 (avoid flooding existing accounts).
 *
 * Cleared by markOrdersSeen() (called on Orders list page mount).
 */
export function useOrdersBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('orders_last_seen_at')
      .eq('id', user.id)
      .maybeSingle();

    const lastSeen = (profile as any)?.orders_last_seen_at;
    if (!lastSeen) { setCount(0); return; }

    const { count: c } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('order_source', 'admin_bulk')
      .gt('status_updated_at', lastSeen)
      .lt('created_at', lastSeen);

    setCount(c ?? 0);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: any status change to one of this user's orders → recount
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`orders-badge-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        () => { refresh(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  // Refresh when window regains focus
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { count, refresh };
}

/** Single-update clear: stamps profiles.orders_last_seen_at = now() */
export async function markOrdersSeen(userId: string) {
  await supabase
    .from('profiles')
    .update({ orders_last_seen_at: new Date().toISOString() } as any)
    .eq('id', userId);
}
