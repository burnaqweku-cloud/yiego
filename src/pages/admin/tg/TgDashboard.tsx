import { useEffect, useState } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Send, LifeBuoy, Activity, Users, ShoppingCart, Sparkles, Download, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const fmtGhs = (n: number | string | null | undefined) =>
  `GHS ${(Number(n ?? 0)).toFixed(2)}`;

interface Kpis {
  users_total: number;
  users_linked: number;
  users_unlinked: number;
  new_today: number;
  new_week: number;
  new_month: number;
  active_24h: number;
  active_7d: number;
  active_30d: number;
  orders_today_count: number;
  orders_today_ghs: number;
  orders_week_count: number;
  orders_week_ghs: number;
  orders_month_count: number;
  orders_month_ghs: number;
  orders_total_count: number;
  pending_referrals: number;
  points_outstanding: number;
  points_redeemed_month: number;
  points_redeemed_lifetime: number;
  pending_tickets: number;
}

interface ActivityRow {
  kind: string;
  occurred_at: string;
  chat_id: number;
  summary: string;
  ref_id: string;
}

const Stat = ({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon: typeof Users }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
          <p className="text-lg font-display font-bold mt-1 truncate">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const TgDashboard = () => {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [k, a] = await Promise.all([
          supabase.rpc('tg_admin_dashboard_kpis'),
          supabase.rpc('tg_admin_recent_activity', { p_limit: 20 }),
        ]);
        if (cancelled) return;
        if (k.error) throw k.error;
        if (a.error) throw a.error;
        setKpis(k.data as unknown as Kpis);
        setActivity((a.data as unknown as ActivityRow[]) ?? []);
      } catch (e: unknown) {
        toast.error('Failed to load dashboard', {
          description: (e as Error).message,
        });
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const botShare = kpis && kpis.orders_total_count > 0
    ? Math.round((kpis.orders_month_count / Math.max(kpis.orders_total_count, 1)) * 100)
    : 0;

  return (
    <TgAdminLayout title="Telegram Bot Dashboard" description="Live overview of bot users, orders, points and health.">
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : kpis ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={Users} label="Bot users" value={kpis.users_total} sub={`${kpis.users_linked} linked · ${kpis.users_unlinked} guest`} />
            <Stat icon={Users} label="New today" value={kpis.new_today} sub={`${kpis.new_week}/wk · ${kpis.new_month}/mo`} />
            <Stat icon={Activity} label="Active 24h" value={kpis.active_24h} sub={`${kpis.active_7d}/7d · ${kpis.active_30d}/30d`} />
            <Stat icon={ShoppingCart} label="Orders today" value={kpis.orders_today_count} sub={fmtGhs(kpis.orders_today_ghs)} />
            <Stat icon={ShoppingCart} label="Orders week" value={kpis.orders_week_count} sub={fmtGhs(kpis.orders_week_ghs)} />
            <Stat icon={ShoppingCart} label="Orders month" value={kpis.orders_month_count} sub={fmtGhs(kpis.orders_month_ghs)} />
            <Stat icon={Sparkles} label="Bot share (30d)" value={`${botShare}%`} sub="of total orders" />
            <Stat icon={LifeBuoy} label="Pending tickets" value={kpis.pending_tickets} />
            <Stat icon={Share2} label="Pending referrals" value={kpis.pending_referrals} />
            <Stat icon={Sparkles} label="Points outstanding" value={kpis.points_outstanding.toLocaleString()} />
            <Stat icon={Download} label="Points redeemed (mo)" value={kpis.points_redeemed_month.toLocaleString()} />
            <Stat icon={Sparkles} label="Points redeemed (lifetime)" value={kpis.points_redeemed_lifetime.toLocaleString()} />
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <Link to="/admin/tg/broadcasts" className="rounded-lg border border-border p-3 flex items-center gap-2 hover:bg-muted transition-colors">
              <Send className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Send broadcast</span>
            </Link>
            <Link to="/admin/tg/support" className="rounded-lg border border-border p-3 flex items-center gap-2 hover:bg-muted transition-colors">
              <LifeBuoy className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">View pending tickets</span>
            </Link>
            <Link to="/admin/tg/health" className="rounded-lg border border-border p-3 flex items-center gap-2 hover:bg-muted transition-colors">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Bot health check</span>
            </Link>
          </div>

          {/* Recent activity */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold mb-2">Recent activity</h2>
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4">No recent activity.</p>
                ) : activity.map((a, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        a.kind === 'order' ? 'bg-primary/10 text-primary' :
                        a.kind === 'deposit' ? 'bg-amber-500/10 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>{a.kind}</span>
                      <Link to={`/admin/tg/users/${a.chat_id}`} className="hover:underline truncate">{a.summary}</Link>
                    </div>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {format(new Date(a.occurred_at), 'MMM d, HH:mm')}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </TgAdminLayout>
  );
};

export default TgDashboard;
