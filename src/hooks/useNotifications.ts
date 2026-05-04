import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  read_at: string | null;
  link: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const newNotifTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      const items = (data as unknown as AppNotification[]) || [];
      setNotifications(items);
      setUnreadCount(items.filter(n => !n.read).length);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          setNotifications(prev => [newNotif, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Trigger bell pulse
          setHasNewNotification(true);
          if (newNotifTimer.current) clearTimeout(newNotifTimer.current);
          newNotifTimer.current = setTimeout(() => setHasNewNotification(false), 3000);

          // Show in-app toast
          toast(newNotif.title, {
            description: newNotif.message?.slice(0, 80),
            action: {
              label: 'View',
              onClick: () => {
                window.location.href = '/dashboard/notifications';
              },
            },
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (newNotifTimer.current) clearTimeout(newNotifTimer.current);
    };
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    const nowIso = new Date().toISOString();
    await supabase
      .from('notifications')
      .update({ read: true, read_at: nowIso } as any)
      .eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, read_at: nowIso } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAsUnread = useCallback(async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read: false, read_at: null } as any)
      .eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false, read_at: null } : n));
    setUnreadCount(prev => prev + 1);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    await supabase
      .from('notifications')
      .update({ read: true, read_at: nowIso } as any)
      .eq('user_id', user.id)
      .eq('read', false);
    setNotifications(prev => prev.map(n => n.read ? n : { ...n, read: true, read_at: nowIso }));
    setUnreadCount(0);
  }, [user]);

  const deleteNotification = useCallback(async (id: string) => {
    const notif = notifications.find(n => n.id === id);
    await supabase
      .from('notifications' as any)
      .delete()
      .eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (notif && !notif.read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, [notifications]);

  // Sort: unread first (newest), then read (newest) — memoized to avoid re-sort on every render
  const sortedNotifications = useMemo(
    () => [...notifications].sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }),
    [notifications]
  );

  return {
    notifications: sortedNotifications,
    loading,
    unreadCount,
    hasNewNotification,
    markAsRead,
    markAsUnread,
    markAllRead,
    deleteNotification,
    refresh: fetchNotifications,
  };
};
