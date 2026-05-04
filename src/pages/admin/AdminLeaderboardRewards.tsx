import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import SEOHead from '@/components/seo/SEOHead';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy, Crown, Medal, Gift } from 'lucide-react';

interface LeaderboardReward {
  id: string;
  week_key: string;
  user_id: string;
  rank: number;
  reward_mb: number;
  status: string;
  processed_at: string | null;
  meta: any;
  created_at: string;
}

function getCurrentWeekKey(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getRecentWeeks(count: number): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() - i * 7 * 86400000);
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    const key = `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    if (!weeks.includes(key)) weeks.push(key);
  }
  return weeks;
}

const RANK_ICONS: Record<number, typeof Crown> = { 1: Crown, 2: Medal, 3: Trophy };
const RANK_COLORS: Record<number, string> = { 1: '#fbbf24', 2: '#94a3b8', 3: '#cd7f32' };

const AdminLeaderboardRewards = () => {
  const [rewards, setRewards] = useState<LeaderboardReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekKey());
  const weeks = useMemo(() => getRecentWeeks(12), []);

  useEffect(() => {
    const fetchRewards = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('weekly_leaderboard_rewards')
        .select('*')
        .eq('week_key', selectedWeek)
        .order('rank', { ascending: true });
      setRewards((data as LeaderboardReward[]) || []);
      setLoading(false);
    };
    fetchRewards();
  }, [selectedWeek]);

  return (
    <AdminLayout>
      <SEOHead title="Leaderboard Rewards | Admin" description="Weekly referral leaderboard rewards" />
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Leaderboard Rewards</h1>
          </div>
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map(w => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div>
        ) : rewards.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No leaderboard rewards for {selectedWeek}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rewards.map(r => {
              const Icon = RANK_ICONS[r.rank] || Gift;
              const color = RANK_COLORS[r.rank] || '#fbbf24';
              const rewardLabel = r.reward_mb >= 1024 ? `${r.reward_mb / 1024}GB` : `${r.reward_mb}MB`;
              const username = r.meta?.username || 'Unknown';
              const orderId = r.meta?.order_id || '—';

              return (
                <Card key={r.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold">Rank #{r.rank}</span>
                          <Badge variant={r.status === 'processed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                            {r.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">@{username} · {rewardLabel} bonus</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Order: {orderId} · Qualified: {r.meta?.qualified_count ?? '?'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminLeaderboardRewards;
