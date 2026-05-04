import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Mounted inside DashboardLayout. Listens for new point_transactions rows
 * for the current user where source = 'order' and shows a delightful toast.
 *
 * Uses a session-scoped seen-set to avoid showing duplicate toasts for the
 * same transaction across re-mounts within a session.
 */
const LoyaltyPointsEarnedListener = () => {
  const { user } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    // Hydrate seen set from sessionStorage so reloads don't re-toast
    try {
      const raw = sessionStorage.getItem('ds_loyalty_seen_tx');
      if (raw) seenRef.current = new Set(JSON.parse(raw));
    } catch {}

    const persistSeen = () => {
      try {
        sessionStorage.setItem(
          'ds_loyalty_seen_tx',
          JSON.stringify(Array.from(seenRef.current).slice(-200)),
        );
      } catch {}
    };

    const channel = supabase
      .channel(`loyalty-toast-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'point_transactions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            type: string;
            source: string;
            amount: number;
            balance_after: number;
          };
          if (!row || seenRef.current.has(row.id)) return;
          if (row.type !== 'earn' || row.source !== 'order') return;
          if (!row.amount || row.amount <= 0) return;

          seenRef.current.add(row.id);
          persistSeen();

          toast.success(`You earned ${row.amount} points!`, {
            description: `Balance: ${(row.balance_after ?? 0).toLocaleString()} pts`,
            icon: <Sparkles className="w-4 h-4 text-primary" />,
            duration: 6000,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
};

export default LoyaltyPointsEarnedListener;
