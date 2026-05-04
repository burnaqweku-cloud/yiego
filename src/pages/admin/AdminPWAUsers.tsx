import { useEffect, useState } from 'react';
import { Smartphone, Users, Activity, TrendingUp, Monitor, Clock } from 'lucide-react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow, subDays, subHours } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PWAUserRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  is_pwa_user: boolean;
  pwa_first_detected_at: string | null;
  pwa_last_seen_at: string | null;
}

interface PWADeviceRow {
  id: string;
  device_fingerprint: string;
  platform: string;
  first_seen_at: string;
  last_seen_at: string;
  first_pwa_detected_at: string | null;
  last_pwa_seen_at: string | null;
}

interface Stats {
  totalPWAUsers: number;
  totalGuestPWADevices: number;
  activePWAToday: number;
  activePWA7Days: number;
  totalVisitsToday: number;
  percentLoggedInPWA: number;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

const KPICard = ({
  icon: Icon,
  label,
  value,
  sub,
  color = 'primary',
}: {
  icon: typeof Smartphone;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) => (
  <div className="bg-card border border-border rounded-2xl p-5 flex gap-4 items-start shadow-sm">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-primary/10`}>
      <Icon className="w-5 h-5 text-primary" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  </div>
);

// ─── Platform badge ───────────────────────────────────────────────────────────

const PlatformBadge = ({ platform }: { platform: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    ios: { label: 'iOS', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    android: { label: 'Android', cls: 'bg-green-100 text-green-700 border-green-200' },
    desktop: { label: 'Desktop', cls: 'bg-muted text-muted-foreground border-border' },
    unknown: { label: 'Unknown', cls: 'bg-muted text-muted-foreground border-border' },
  };
  const { label, cls } = map[platform] ?? map.unknown;
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (d: string | null) =>
  d ? format(new Date(d), 'dd MMM yyyy, HH:mm') : '—';

const rel = (d: string | null) =>
  d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : '—';

const isActive7Days = (d: string | null) => {
  if (!d) return false;
  return new Date(d) >= subDays(new Date(), 7);
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const AdminPWAUsers = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pwaUsers, setPwaUsers] = useState<PWAUserRow[]>([]);
  const [guestDevices, setGuestDevices] = useState<PWADeviceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const todayStart = subDays(new Date(), 1).toISOString();
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();

      // Fetch logged-in PWA users (limit 100 for table)
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, is_pwa_user, pwa_first_detected_at, pwa_last_seen_at')
        .eq('is_pwa_user', true)
        .order('pwa_last_seen_at', { ascending: false })
        .limit(100);

      // Total user count for percentage
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch guest PWA devices
      const { data: devices } = await supabase
        .from('pwa_devices' as any)
        .select('*')
        .not('first_pwa_detected_at', 'is', null)
        .order('last_pwa_seen_at', { ascending: false })
        .limit(100) as any;

      // All devices (for today's visit count)
      const { data: todayDevices } = await supabase
        .from('pwa_devices' as any)
        .select('id, last_seen_at')
        .gte('last_seen_at', todayStart) as any;

      const pwaUsersData: PWAUserRow[] = (users ?? []) as any;
      const guestData: PWADeviceRow[] = (devices ?? []) as any;

      const activePWAToday = pwaUsersData.filter(
        u => u.pwa_last_seen_at && new Date(u.pwa_last_seen_at) >= new Date(todayStart)
      ).length;

      const activePWA7Days = pwaUsersData.filter(
        u => u.pwa_last_seen_at && new Date(u.pwa_last_seen_at) >= new Date(sevenDaysAgo)
      ).length;

      const percentLoggedInPWA = totalUsers
        ? Math.round((pwaUsersData.length / totalUsers) * 100)
        : 0;

      setStats({
        totalPWAUsers: pwaUsersData.length,
        totalGuestPWADevices: guestData.length,
        activePWAToday,
        activePWA7Days,
        totalVisitsToday: (todayDevices ?? []).length,
        percentLoggedInPWA,
      });
      setPwaUsers(pwaUsersData);
      setGuestDevices(guestData);
      setLoading(false);
    };

    load();
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-primary" />
            Home Screen Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track users who installed the DataSika PWA to their home screen.
          </p>
        </div>

        {/* KPI Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-5 h-24 animate-pulse" />
            ))}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard icon={Users} label="Total PWA Users (Logged-in)" value={stats.totalPWAUsers} />
            <KPICard icon={Monitor} label="Guest PWA Devices" value={stats.totalGuestPWADevices} />
            <KPICard icon={Activity} label="Active PWA Users Today" value={stats.activePWAToday} />
            <KPICard icon={TrendingUp} label="Active PWA — Last 7 Days" value={stats.activePWA7Days} />
            <KPICard icon={Clock} label="Total Device Visits Today" value={stats.totalVisitsToday} sub="(all devices, guest + logged-in)" />
            <KPICard
              icon={Smartphone}
              label="% of Users Using PWA"
              value={`${stats.percentLoggedInPWA}%`}
              sub="of all registered users"
            />
          </div>
        )}

        {/* Logged-in PWA Users Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-base">Logged-in PWA Users</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Last 100 detected. Sorted by most recent activity.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Phone</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">First Detected</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Last Seen</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : pwaUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      No PWA users detected yet. Users will appear here once they install the app.
                    </td>
                  </tr>
                ) : (
                  pwaUsers.map(u => (
                    <tr key={u.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.full_name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.phone || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(u.pwa_first_detected_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{rel(u.pwa_last_seen_at)}</td>
                      <td className="px-4 py-3">
                        {isActive7Days(u.pwa_last_seen_at) ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                            Active
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Guest Device Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-base">Guest PWA Devices</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Anonymous devices where PWA install was detected. Last 100.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Fingerprint</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Platform</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">First Seen</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Last Seen</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">First PWA Detected</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground">Last PWA Seen</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : guestDevices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      No guest PWA devices detected yet.
                    </td>
                  </tr>
                ) : (
                  guestDevices.map(d => (
                    <tr key={d.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.device_fingerprint}</td>
                      <td className="px-4 py-3">
                        <PlatformBadge platform={d.platform} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(d.first_seen_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{rel(d.last_seen_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(d.first_pwa_detected_at)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{rel(d.last_pwa_seen_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminPWAUsers;
