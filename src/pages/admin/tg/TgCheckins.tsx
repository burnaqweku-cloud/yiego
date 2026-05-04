import { useEffect, useState } from 'react';
import TgAdminLayout from './TgAdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { fmtDate } from './_utils';

interface Overview {
  today: number; week: number; month: number; lifetime: number; unique_users_30d: number;
  daily: Array<{ checkin_date: string; total: number }>;
  top_streaks: Array<{ user_id: string | null; streak: number; chat_id: number | null; first_name: string | null; username: string | null }>;
  recent: Array<{ user_id: string | null; checkin_date: string; streak_count: number; created_at: string; chat_id: number | null; first_name: string | null; username: string | null }>;
}

const TgCheckins = () => {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => { (async () => {
    const { data: d } = await supabase.rpc('tg_admin_checkins_overview', { p_days: 30 });
    if (d) setData(d as unknown as Overview);
  })(); }, []);

  const maxDaily = Math.max(1, ...((data?.daily || []).map(d => d.total) || [1]));

  return (
    <TgAdminLayout title="Daily Check-ins" description="Streaks, totals and recent check-in activity.">
      {!data ? <Skeleton className="h-40" /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Today</p><p className="text-lg font-bold mt-1">{data.today}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">7 days</p><p className="text-lg font-bold mt-1">{data.week}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">30 days</p><p className="text-lg font-bold mt-1">{data.month}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Lifetime</p><p className="text-lg font-bold mt-1">{data.lifetime}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[11px] uppercase text-muted-foreground">Unique (30d)</p><p className="text-lg font-bold mt-1">{data.unique_users_30d}</p></CardContent></Card>
          </div>

          <Card className="mt-3"><CardContent className="p-4">
            <p className="text-xs font-semibold mb-3">Daily check-ins (30 days)</p>
            <div className="flex items-end gap-1 h-24">
              {(data.daily || []).map(d => (
                <div key={d.checkin_date} title={`${d.checkin_date}: ${d.total}`}
                     className="flex-1 bg-primary rounded-t" style={{ height: `${(d.total/maxDaily)*100}%`, minHeight: '2px' }} />
              ))}
              {(!data.daily || data.daily.length === 0) && (
                <p className="text-xs text-muted-foreground self-center mx-auto">No check-ins yet</p>
              )}
            </div>
          </CardContent></Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <Card><CardContent className="p-4">
              <p className="text-xs font-semibold mb-2">Top streaks</p>
              <div className="space-y-1 text-xs">{(data.top_streaks || []).map((t, i) => {
                const label = t.first_name || t.username || (t.user_id ? String(t.user_id).slice(0,8) : (t.chat_id ? `#${t.chat_id}` : 'unknown'));
                return (
                  <div key={`${t.user_id ?? t.chat_id ?? i}`} className="flex justify-between items-center">
                    {t.chat_id ? <Link to={`/admin/tg/users/${t.chat_id}`} className="hover:underline">{label}</Link>
                               : <span className="font-mono">{label}</span>}
                    <span className="font-bold">{t.streak}🔥</span>
                  </div>
                );
              })}</div>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <p className="text-xs font-semibold mb-2">Recent check-ins</p>
              <div className="space-y-1 text-xs max-h-72 overflow-y-auto">{(data.recent || []).slice(0,30).map((r,i) => {
                const label = r.first_name || r.username || (r.user_id ? String(r.user_id).slice(0,8) : (r.chat_id ? `#${r.chat_id}` : 'unknown'));
                return (
                  <div key={i} className="flex justify-between items-center">
                    {r.chat_id ? <Link to={`/admin/tg/users/${r.chat_id}`} className="hover:underline">{label}</Link>
                               : <span className="font-mono">{label}</span>}
                    <span className="text-muted-foreground">{r.streak_count}🔥 · {fmtDate(r.created_at)}</span>
                  </div>
                );
              })}</div>
            </CardContent></Card>
          </div>
        </>
      )}
    </TgAdminLayout>
  );
};
export default TgCheckins;
