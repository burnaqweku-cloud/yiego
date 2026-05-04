import { useEffect, useState } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ShoppingCart, CheckCircle, XCircle, AlertTriangle, Bell, X } from 'lucide-react';

interface AgentNotificationsProps {
  onClose: () => void;
}

interface Notification {
  id: string;
  icon: typeof Bell;
  iconColor: string;
  title: string;
  time: string;
}

const AgentNotifications = ({ onClose }: AgentNotificationsProps) => {
  const { agent } = useAgent();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!agent) return;
    fetchNotifications();
  }, [agent]);

  const fetchNotifications = async () => {
    if (!agent) return;
    const items: Notification[] = [];

    // Recent orders as notifications
    const { data: orders } = await supabase
      .from('agent_orders' as any)
      .select('id, order_id, status, created_at, network, bundle_size_gb')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (orders) {
      orders.forEach((o: any) => {
        const statusIcon = o.status === 'Delivered' ? CheckCircle
          : o.status === 'Failed' ? XCircle
          : ShoppingCart;
        const statusColor = o.status === 'Delivered' ? 'text-success'
          : o.status === 'Failed' ? 'text-destructive'
          : 'text-primary';
        items.push({
          id: o.id,
          icon: statusIcon,
          iconColor: statusColor,
          title: `${o.network} ${o.bundle_size_gb}GB order ${o.status?.toLowerCase()}`,
          time: o.created_at ? format(new Date(o.created_at), 'dd MMM, HH:mm') : '',
        });
      });
    }

    // Recent withdrawals
    const { data: withdrawals } = await supabase
      .from('agent_withdrawals' as any)
      .select('id, amount_ghs, status, created_at')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(3);

    if (withdrawals) {
      withdrawals.forEach((w: any) => {
        const icon = w.status === 'paid' ? CheckCircle : w.status === 'rejected' ? XCircle : AlertTriangle;
        const color = w.status === 'paid' ? 'text-success' : w.status === 'rejected' ? 'text-destructive' : 'text-primary';
        items.push({
          id: w.id,
          icon,
          iconColor: color,
          title: `Withdrawal GHS ${Number(w.amount_ghs).toFixed(2)} ${w.status}`,
          time: w.created_at ? format(new Date(w.created_at), 'dd MMM, HH:mm') : '',
        });
      });
    }

    // Sort by time
    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    setNotifications(items.slice(0, 8));
  };

  return (
    <div className="absolute right-2 top-14 z-50 w-80 max-h-96 bg-card border border-border rounded-2xl card-shadow-elevated overflow-hidden animate-scale-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-bold">Notifications</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-y-auto max-h-72">
        {notifications.length === 0 ? (
          <div className="p-6 text-center">
            <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0">
              <n.icon className={`w-4 h-4 mt-0.5 shrink-0 ${n.iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">{n.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{n.time}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AgentNotifications;
