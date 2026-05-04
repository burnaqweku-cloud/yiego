import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { formatPrice } from '@/data/bundles';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, Users, Globe, Smartphone, Monitor, Tablet, RefreshCw, TrendingUp, ShoppingCart } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const CHART_COLORS = [
  'hsl(45, 100%, 48%)',   // primary/gold
  'hsl(210, 85%, 55%)',   // info/blue
  'hsl(142, 70%, 45%)',   // success/green
  'hsl(0, 84%, 60%)',     // destructive/red
  'hsl(270, 60%, 55%)',   // purple
  'hsl(30, 90%, 55%)',    // orange
];

const AdminAnalytics = () => {
  const { user, isAdminOrStaff, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState(30);
  const { stats, dailyVisitors, topPages, devices, browsers, dailyRevenue, loading, refresh } = useAnalyticsData(range);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  if (authLoading || !user || !isAdminOrStaff) return null;

  const statCards = stats
    ? [
        { label: 'Total Page Views', value: stats.totalPageViews.toLocaleString(), icon: Eye, color: 'text-primary' },
        { label: 'Unique Visitors', value: stats.uniqueVisitors.toLocaleString(), icon: Users, color: 'text-info' },
        { label: 'Views Today', value: stats.pageViewsToday.toLocaleString(), icon: Globe, color: 'text-success' },
        { label: 'Live Now', value: stats.liveVisitors.toLocaleString(), icon: Smartphone, color: 'text-destructive', live: true },
      ]
    : [];

  const deviceIcons: Record<string, React.ReactNode> = {
    mobile: <Smartphone className="w-4 h-4" />,
    tablet: <Tablet className="w-4 h-4" />,
    desktop: <Monitor className="w-4 h-4" />,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold">Analytics</h2>
            <p className="text-muted-foreground text-sm">Visitor tracking & revenue insights</p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setRange(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  range === d ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-muted'
                }`}
              >
                {d}d
              </button>
            ))}
            <button onClick={() => refresh()} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statCards.map(stat => (
                <div key={stat.label} className="bg-card rounded-xl p-4 border border-border card-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</span>
                    {stat.live && <span className="w-2 h-2 rounded-full bg-destructive pulse-dot" />}
                  </div>
                  <p className="text-xl font-display font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Daily Visitors Chart */}
            <div className="bg-card rounded-xl border border-border card-shadow p-4">
              <h3 className="font-display font-semibold mb-4">Daily Visitors</h3>
              {dailyVisitors.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  No visitor data yet. Data will appear as users visit your site.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dailyVisitors}>
                    <defs>
                      <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(45, 100%, 48%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(45, 100%, 48%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="uniqueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(210, 85%, 55%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(210, 85%, 55%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 50% / 0.1)" />
                    <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11 }} stroke="hsl(0 0% 50% / 0.5)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 50% / 0.5)" />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="views" name="Page Views" stroke="hsl(45, 100%, 48%)" fill="url(#viewsGradient)" strokeWidth={2} />
                    <Area type="monotone" dataKey="unique" name="Unique Visitors" stroke="hsl(210, 85%, 55%)" fill="url(#uniqueGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue & Orders Chart */}
            <div className="bg-card rounded-xl border border-border card-shadow p-4">
              <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" /> Daily Revenue & Orders
              </h3>
              {dailyRevenue.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  No revenue data in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 50% / 0.1)" />
                    <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11 }} stroke="hsl(0 0% 50% / 0.5)" />
                    <YAxis yAxisId="rev" orientation="left" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50% / 0.5)" tickFormatter={(v) => `₵${v}`} />
                    <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(0 0% 50% / 0.5)" />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, name: string) => [
                        name === 'Revenue' ? formatPrice(value) : value,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="hsl(142, 70%, 45%)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="ord" dataKey="orders" name="Orders" fill="hsl(210, 85%, 55%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Bottom Row: Devices, Browsers, Top Pages */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Device Breakdown */}
              <div className="bg-card rounded-xl border border-border card-shadow p-4">
                <h3 className="font-display font-semibold mb-4 text-sm">Device Breakdown</h3>
                {devices.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No data</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={devices}
                          dataKey="count"
                          nameKey="device"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          innerRadius={40}
                          strokeWidth={2}
                          stroke="hsl(var(--card))"
                        >
                          {devices.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '0.5rem',
                            fontSize: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                      {devices.map((d, i) => (
                        <div key={d.device} className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="flex items-center gap-1.5">
                            {deviceIcons[d.device] || <Globe className="w-3.5 h-3.5" />}
                            <span className="capitalize">{d.device}</span>
                          </span>
                          <span className="ml-auto font-medium">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Browser Breakdown */}
              <div className="bg-card rounded-xl border border-border card-shadow p-4">
                <h3 className="font-display font-semibold mb-4 text-sm">Browser Breakdown</h3>
                {browsers.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No data</p>
                ) : (
                  <div className="space-y-3">
                    {browsers.map((b, i) => {
                      const total = browsers.reduce((s, x) => s + x.count, 0);
                      const pct = total > 0 ? (b.count / total) * 100 : 0;
                      return (
                        <div key={b.browser}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium">{b.browser}</span>
                            <span className="text-muted-foreground">{b.count} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                background: CHART_COLORS[i % CHART_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top Pages */}
              <div className="bg-card rounded-xl border border-border card-shadow p-4">
                <h3 className="font-display font-semibold mb-4 text-sm">Top Pages</h3>
                {topPages.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No data</p>
                ) : (
                  <div className="space-y-2">
                    {topPages.map((page, i) => (
                      <div key={page.path} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground font-mono w-5 text-right shrink-0">{i + 1}.</span>
                          <span className="font-medium truncate">{page.path}</span>
                        </div>
                        <span className="text-muted-foreground font-mono ml-2 shrink-0">{page.views}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAnalytics;
