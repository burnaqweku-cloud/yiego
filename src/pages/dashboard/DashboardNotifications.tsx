import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Bell, CheckCheck, ShoppingCart, Wallet, AlertTriangle, MessageCircle,
  ChevronLeft, Eye, EyeOff, Trash2, ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

type TabType = 'all' | 'order' | 'wallet' | 'support' | 'system';

const TABS: { key: TabType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'order', label: 'Orders' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'support', label: 'Support' },
  { key: 'system', label: 'System' },
];

const getIcon = (type: string) => {
  switch (type) {
    case 'order': return ShoppingCart;
    case 'wallet': return Wallet;
    case 'support': return MessageCircle;
    case 'system': return AlertTriangle;
    default: return Bell;
  }
};

const getIconBg = (type: string) => {
  switch (type) {
    case 'order': return 'bg-primary/10 text-primary';
    case 'wallet': return 'bg-emerald-500/10 text-emerald-600';
    case 'support': return 'bg-sky-500/10 text-sky-600';
    case 'system': return 'bg-amber-500/10 text-amber-600';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'order': return 'Order';
    case 'wallet': return 'Wallet';
    case 'support': return 'Support';
    case 'system': return 'System';
    default: return 'General';
  }
};

const emptyMessages: Record<TabType, string> = {
  all: 'No notifications yet',
  order: 'No order notifications',
  wallet: 'No wallet notifications',
  support: 'No support notifications',
  system: 'No system notifications',
};

// Build a relative app route from the absolute link or related entity.
function getEntityRoute(n: AppNotification): { href: string; label: string } | null {
  // Prefer structured related entity when present
  if (n.related_entity_type && n.related_entity_id) {
    switch (n.related_entity_type) {
      case 'order':       return { href: `/dashboard/orders/${n.related_entity_id}`, label: 'View Order' };
      case 'ticket':      return { href: `/dashboard/support`,                       label: 'View Ticket' };
      case 'withdrawal':  return { href: `/agent/withdrawals`,                       label: 'View Withdrawal' };
      case 'subscription':return { href: `/agent/subscription`,                      label: 'View Subscription' };
    }
  }
  // Fallback: convert absolute link to a relative path
  if (n.link) {
    try {
      const u = new URL(n.link);
      const path = u.pathname + (u.search || '');
      const lower = path.toLowerCase();
      let label = 'Open';
      if (lower.includes('/orders'))        label = 'View Order';
      else if (lower.includes('/wallet'))   label = 'View Wallet';
      else if (lower.includes('/support'))  label = 'View Conversation';
      else if (lower.includes('/withdraw')) label = 'View Withdrawal';
      else if (lower.includes('/subscription')) label = 'View Subscription';
      else if (lower.includes('/referral')) label = 'View Referral';
      return { href: path, label };
    } catch {
      // not an absolute URL — assume relative
      return { href: n.link, label: 'Open' };
    }
  }
  return null;
}

const DashboardNotifications = () => {
  const navigate = useNavigate();
  const {
    notifications, loading, unreadCount,
    markAsRead, markAsUnread, markAllRead, deleteNotification,
  } = useNotifications();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const [confirmAllRead, setConfirmAllRead] = useState(false);

  // Per-tab unread counts (memoized)
  const unreadByType = useMemo(() => {
    const map: Record<string, number> = { order: 0, wallet: 0, support: 0, system: 0 };
    for (const n of notifications) {
      if (!n.read && map[n.type] !== undefined) map[n.type]++;
    }
    return map;
  }, [notifications]);

  const filtered = activeTab === 'all'
    ? notifications
    : notifications.filter(n => n.type === activeTab);

  const handleOpen = (n: AppNotification) => {
    // Auto-mark as read the moment the detail view OPENS (not on close).
    if (!n.read) markAsRead(n.id);
    setSelected({ ...n, read: true, read_at: n.read_at ?? new Date().toISOString() });
  };

  const handleMarkAllRead = () => {
    if (unreadCount >= 10) {
      setConfirmAllRead(true);
    } else {
      markAllRead();
    }
  };

  // ---------- Detail view ----------
  if (selected) {
    const Icon = getIcon(selected.type);
    const entity = getEntityRoute(selected);
    return (
      <DashboardLayout>
        <div className="p-4 md:p-6 space-y-4 max-w-3xl animate-fade-in">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to notifications
          </button>

          <Card className="overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${getIconBg(selected.type)}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {getTypeLabel(selected.type)}
                    </span>
                  </div>
                  <h2 className="text-base font-bold leading-snug">{selected.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(selected.created_at), 'EEEE, dd MMM yyyy · HH:mm')}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.message}</p>
              </div>

              {entity && (
                <div className="pt-2">
                  <Button
                    className="w-full gap-2"
                    onClick={() => navigate(entity.href)}
                  >
                    {entity.label}
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                {selected.read ? (
                  <Button
                    variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => {
                      markAsUnread(selected.id);
                      setSelected({ ...selected, read: false, read_at: null });
                    }}
                  >
                    <EyeOff className="w-3.5 h-3.5" /> Mark unread
                  </Button>
                ) : (
                  <Button
                    variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => {
                      markAsRead(selected.id);
                      setSelected({ ...selected, read: true, read_at: new Date().toISOString() });
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" /> Mark read
                  </Button>
                )}
                <Button
                  variant="outline" size="sm"
                  className="gap-1.5 text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    deleteNotification(selected.id);
                    setSelected(null);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ---------- List view ----------
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up ✨'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost" size="sm" onClick={handleMarkAllRead}
              className="gap-1.5 text-xs h-8"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </Button>
          )}
        </div>

        {/* Tabs (horizontally scrollable on small screens) */}
        <div
          className="flex gap-1.5 bg-muted/50 p-1 rounded-xl overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          {TABS.map(tab => {
            const tabUnread = tab.key === 'all' ? 0 : (unreadByType[tab.key] || 0);
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{tab.label}</span>
                {tabUnread > 0 && (
                  <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-foreground'
                  }`}>
                    {tabUnread > 99 ? '99+' : tabUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[78px] rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                <Bell className="w-7 h-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{emptyMessages[activeTab]}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Check back later for updates</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((n, idx) => {
              const Icon = getIcon(n.type);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleOpen(n)}
                  className={`w-full text-left group relative rounded-xl border transition-all duration-200 active:scale-[0.99] motion-reduce:active:scale-100 min-h-[64px] ${
                    !n.read
                      ? 'border-primary/30 bg-primary/[0.04] shadow-sm'
                      : 'border-border bg-card hover:bg-muted/30'
                  } ${idx === 0 ? 'animate-fade-in motion-reduce:animate-none' : ''}`}
                  style={
                    !n.read
                      ? { boxShadow: 'inset 3px 0 0 0 hsl(var(--primary))' }
                      : undefined
                  }
                >
                  <div className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getIconBg(n.type)}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm leading-snug truncate ${!n.read ? 'font-bold' : 'font-medium text-foreground/85'}`}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 line-clamp-2 ${!n.read ? 'text-muted-foreground' : 'text-muted-foreground/80'}`}>
                        {n.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                        {format(new Date(n.created_at), 'dd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={confirmAllRead} onOpenChange={setConfirmAllRead}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all as read?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {unreadCount} unread notifications as read. You can still view them in the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { markAllRead(); setConfirmAllRead(false); }}>
              Mark all read
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default DashboardNotifications;
