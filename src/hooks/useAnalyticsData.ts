import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AnalyticsStats {
  totalPageViews: number;
  uniqueVisitors: number;
  pageViewsToday: number;
  liveVisitors: number;
}

export interface DailyVisitors {
  date: string;
  views: number;
  unique: number;
}

export interface TopPage {
  path: string;
  views: number;
}

export interface DeviceBreakdown {
  device: string;
  count: number;
}

export interface BrowserBreakdown {
  browser: string;
  count: number;
}

export interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

async function fetchAnalyticsData(dateRange: number) {
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - dateRange);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeISO = rangeStart.toISOString();
  const rangeDate = rangeISO.slice(0, 10);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayDate = todayStart.toISOString().slice(0, 10);

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // 1. Read pre-aggregated metrics (fast, no scanning)
  // 2. Live visitors from page_views (small query, last 5 min)
  // 3. Today's page views count
  // 4. Top pages, devices, browsers from page_views (current range)
  const [metricsRes, liveRes, todayCountRes] = await Promise.all([
    supabase
      .from('analytics_daily_metrics')
      .select('*')
      .gte('date', rangeDate)
      .order('date', { ascending: true }),
    supabase
      .from('page_views')
      .select('session_id')
      .gte('created_at', fiveMinAgo),
    supabase
      .from('page_views')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString()),
  ]);

  const metrics = (metricsRes.data || []) as any[];
  const liveSessions = new Set((liveRes.data || []).map((d: any) => d.session_id));

  // Aggregate stats from pre-computed daily metrics
  let totalPageViews = 0;
  let totalUniqueVisitors = 0;
  const dailyVisitors: DailyVisitors[] = [];
  const dailyRevenue: DailyRevenue[] = [];

  for (const m of metrics) {
    totalPageViews += m.page_views || 0;
    totalUniqueVisitors += m.unique_visitors || 0;
    dailyVisitors.push({ date: m.date, views: m.page_views || 0, unique: m.unique_visitors || 0 });
    if ((m.total_orders || 0) > 0 || (m.total_revenue || 0) > 0) {
      dailyRevenue.push({ date: m.date, revenue: Number(m.total_revenue) || 0, orders: m.total_orders || 0 });
    }
  }

  const stats: AnalyticsStats = {
    totalPageViews,
    uniqueVisitors: totalUniqueVisitors,
    pageViewsToday: todayCountRes.count || 0,
    liveVisitors: liveSessions.size,
  };

  // For top pages, devices, browsers — use a single limited query
  // Only fetch the most recent records (capped) instead of looping through ALL page_views
  const MAX_DETAIL_ROWS = 1000;
  const { data: pvData, error: pvError } = await supabase
    .from('page_views')
    .select('page_path, device_type, browser')
    .gte('created_at', rangeISO)
    .order('created_at', { ascending: false })
    .limit(MAX_DETAIL_ROWS);

  if (pvError) console.error('[analytics] pv detail fetch error:', pvError);
  const allPV = pvData || [];

  // Top pages
  const pathCounts = new Map<string, number>();
  allPV.forEach(pv => { pathCounts.set(pv.page_path, (pathCounts.get(pv.page_path) || 0) + 1); });
  const topPages: TopPage[] = Array.from(pathCounts.entries())
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Device breakdown
  const deviceCounts = new Map<string, number>();
  allPV.forEach(pv => { const d = pv.device_type || 'unknown'; deviceCounts.set(d, (deviceCounts.get(d) || 0) + 1); });
  const devices: DeviceBreakdown[] = Array.from(deviceCounts.entries()).map(([device, count]) => ({ device, count }));

  // Browser breakdown
  const browserCounts = new Map<string, number>();
  allPV.forEach(pv => { const b = pv.browser || 'Unknown'; browserCounts.set(b, (browserCounts.get(b) || 0) + 1); });
  const browsers: BrowserBreakdown[] = Array.from(browserCounts.entries())
    .map(([browser, count]) => ({ browser, count }))
    .sort((a, b) => b.count - a.count);

  return { stats, dailyVisitors, topPages, devices, browsers, dailyRevenue };
}

export function useAnalyticsData(dateRange: number = 30) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'analytics', dateRange],
    queryFn: () => fetchAnalyticsData(dateRange),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    stats: data?.stats ?? null,
    dailyVisitors: data?.dailyVisitors ?? [],
    topPages: data?.topPages ?? [],
    devices: data?.devices ?? [],
    browsers: data?.browsers ?? [],
    dailyRevenue: data?.dailyRevenue ?? [],
    loading: isLoading,
    refresh: refetch,
  };
}
