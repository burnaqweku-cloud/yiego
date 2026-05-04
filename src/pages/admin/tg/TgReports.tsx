import { useEffect, useState } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { downloadCsv, fmtGhs } from './_utils';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

interface DailyPoint { day: string; orders: number; revenue: number; }
interface SplitPoint { network?: string; method?: string; orders?: number; revenue?: number; }
interface Customer { telegram_chat_id: number; first_name: string | null; username: string | null; orders: number; spent: number; }

const TgReports = () => {
  const [days, setDays] = useState(30);
  const [daily, setDaily] = useState<DailyPoint[] | null>(null);
  const [networks, setNetworks] = useState<SplitPoint[] | null>(null);
  const [methods, setMethods] = useState<SplitPoint[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);

  useEffect(() => {
    (async () => {
      setDaily(null); setNetworks(null); setMethods(null); setCustomers(null);
      const [d, n, m, c] = await Promise.all([
        supabase.rpc('tg_admin_report_daily_revenue', { p_days: days }),
        supabase.rpc('tg_admin_report_network_split', { p_days: days }),
        supabase.rpc('tg_admin_report_payment_mix', { p_days: days }),
        supabase.rpc('tg_admin_report_top_customers', { p_days: days, p_limit: 20 }),
      ]);
      setDaily((d.data as unknown as DailyPoint[]) ?? []);
      setNetworks((n.data as unknown as SplitPoint[]) ?? []);
      setMethods((m.data as unknown as SplitPoint[]) ?? []);
      setCustomers((c.data as unknown as Customer[]) ?? []);
    })();
  }, [days]);

  return (
    <TgAdminLayout title="Reports" description="Revenue, network split, payment mix and top customers.">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Range:</span>
        {[7, 30, 90].map(d => (
          <Button key={d} size="sm" variant={days===d?'default':'outline'} className="h-7 text-xs" onClick={()=>setDays(d)}>{d}d</Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">Daily revenue (GHS)</p>
            {daily && <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => downloadCsv('daily-revenue.csv', daily as unknown as Record<string, unknown>[])}>CSV</Button>}
          </div>
          {!daily ? <Skeleton className="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={daily}><XAxis dataKey="day" tick={{fontSize:10}} /><YAxis tick={{fontSize:10}} /><Tooltip /><Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" /></LineChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold mb-2">Network split</p>
          {!networks ? <Skeleton className="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={networks} dataKey="orders" nameKey="network" cx="50%" cy="50%" outerRadius={70}>
                {networks.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Legend wrapperStyle={{fontSize:10}} /><Tooltip /></PieChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold mb-2">Payment method mix</p>
          {!methods ? <Skeleton className="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={methods}><XAxis dataKey="method" tick={{fontSize:10}} /><YAxis tick={{fontSize:10}} /><Tooltip /><Bar dataKey="orders" fill="hsl(var(--primary))" /></BarChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">Top customers (by spend)</p>
            {customers && <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => downloadCsv('top-customers.csv', customers as unknown as Record<string, unknown>[])}>CSV</Button>}
          </div>
          {!customers ? <Skeleton className="h-48" /> : (
            <div className="space-y-1 text-xs max-h-48 overflow-y-auto">
              {customers.map(c => (
                <div key={c.telegram_chat_id} className="flex justify-between">
                  <span className="truncate">{c.first_name || c.username || c.telegram_chat_id}</span>
                  <span className="font-bold">{fmtGhs(c.spent)} <span className="text-muted-foreground">({c.orders})</span></span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>
    </TgAdminLayout>
  );
};
export default TgReports;
