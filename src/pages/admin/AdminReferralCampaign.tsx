import { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Users, Gift, Trophy, AlertTriangle, ToggleLeft, ToggleRight, RefreshCw, XCircle } from 'lucide-react';

interface ReferralActivity {
  id: string;
  referrer_id: string;
  referee_id: string;
  status: string;
  created_at: string;
  first_success_order_id: string | null;
  referrer_profile?: { username: string | null; full_name: string; referral_success_count: number };
  referee_profile?: { username: string | null; full_name: string };
}

interface ReferralReward {
  id: string;
  user_id: string;
  type: string;
  status: string;
  created_at: string;
  claimed_at: string | null;
  user_profile?: { username: string | null; full_name: string };
}

interface LeaderboardEntry {
  id: string;
  full_name: string;
  username: string | null;
  referral_success_count: number;
  referral_signup_count: number;
}

const AdminReferralCampaign = () => {
  const [tab, setTab] = useState<'activity' | 'rewards' | 'leaderboard'>('activity');
  const [activities, setActivities] = useState<ReferralActivity[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [campaignActive, setCampaignActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [activityRes, rewardsRes, settingsRes, leaderboardRes] = await Promise.all([
        supabase
          .from('referral_activity')
          .select('id, referrer_id, referee_id, status, created_at, first_success_order_id')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('referral_rewards')
          .select('id, user_id, type, status, created_at, claimed_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('referral_campaign_settings')
          .select('active')
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('id, full_name, username, referral_success_count, referral_signup_count')
          .gt('referral_success_count', 0)
          .order('referral_success_count', { ascending: false })
          .limit(50),
      ]);

      if (settingsRes.data) setCampaignActive(settingsRes.data.active);

      // Enrich activities
      if (activityRes.data) {
        const enriched = await Promise.all(
          activityRes.data.slice(0, 50).map(async (a) => {
            const [rr, re] = await Promise.all([
              supabase.from('profiles').select('username, full_name, referral_success_count').eq('id', a.referrer_id).maybeSingle(),
              supabase.from('profiles').select('username, full_name').eq('id', a.referee_id).maybeSingle(),
            ]);
            return {
              ...a,
              referrer_profile: rr.data || { username: null, full_name: 'Unknown', referral_success_count: 0 },
              referee_profile: re.data || { username: null, full_name: 'Unknown' },
            };
          })
        );
        setActivities(enriched as ReferralActivity[]);
      }

      // Enrich rewards
      if (rewardsRes.data) {
        const enriched = await Promise.all(
          rewardsRes.data.slice(0, 50).map(async (r) => {
            const { data: p } = await supabase.from('profiles').select('username, full_name').eq('id', r.user_id).maybeSingle();
            return { ...r, user_profile: p || { username: null, full_name: 'Unknown' } };
          })
        );
        setRewards(enriched as ReferralReward[]);
      }

      if (leaderboardRes.data) setLeaderboard(leaderboardRes.data as LeaderboardEntry[]);
    } finally {
      setLoading(false);
    }
  };

  const toggleCampaign = async () => {
    const newActive = !campaignActive;
    const { error } = await supabase
      .from('referral_campaign_settings')
      .update({ active: newActive })
      .eq('active', campaignActive);
    if (error) {
      toast.error('Failed to update campaign status');
    } else {
      setCampaignActive(newActive);
      toast.success(`Campaign ${newActive ? 'activated' : 'deactivated'}`);
    }
  };

  const revokeReward = async (rewardId: string) => {
    if (!confirm('Revoke this reward? This action cannot be undone.')) return;
    setRevoking(rewardId);
    const { error } = await supabase
      .from('referral_rewards')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', rewardId)
      .in('status', ['claimable', 'claimed']);
    if (error) {
      toast.error('Failed to revoke reward');
    } else {
      toast.success('Reward revoked');
      await loadData();
    }
    setRevoking(null);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const displayName = (profile?: { username: string | null; full_name: string }) =>
    profile?.username ? `@${profile.username}` : profile?.full_name || 'Unknown';

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-display font-bold">Referral Campaign</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Invite 5 Friends → Unlock FREE 1GB</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
              campaignActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'
            }`}>
              <span className={`w-2 h-2 rounded-full ${campaignActive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
              {campaignActive ? 'Campaign Active' : 'Campaign Inactive'}
            </div>
            <Button variant="outline" size="sm" onClick={toggleCampaign}>
              {campaignActive ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4" />}
              {campaignActive ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Referrals', value: activities.length, icon: Users, color: 'text-blue-500' },
            { label: 'Successful', value: activities.filter(a => a.status === 'successful').length, icon: Trophy, color: 'text-emerald-500' },
            { label: 'Claimable', value: rewards.filter(r => r.status === 'claimable').length, icon: Gift, color: 'text-primary' },
            { label: 'Claimed', value: rewards.filter(r => r.status === 'claimed').length, icon: Gift, color: 'text-amber-500' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-card rounded-xl p-4 border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex bg-secondary rounded-xl p-1">
          {(['activity', 'rewards', 'leaderboard'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg capitalize transition-all ${
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Activity Tab */}
        {tab === 'activity' && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Referrer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Referee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map(a => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{displayName(a.referrer_profile)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{displayName(a.referee_profile)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          a.status === 'successful' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'
                        }`}>
                          {a.status === 'successful' ? '✓ Successful' : 'Registered'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(a.created_at)}</td>
                    </tr>
                  ))}
                  {activities.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No referral activity yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Rewards Tab */}
        {tab === 'rewards' && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Claimed</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rewards.map(r => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{displayName(r.user_profile)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.type}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          r.status === 'claimed' ? 'bg-emerald-500/10 text-emerald-600' :
                          r.status === 'claimable' ? 'bg-primary/10 text-primary' :
                          r.status === 'revoked' ? 'bg-destructive/10 text-destructive' :
                          'bg-secondary text-muted-foreground'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{r.claimed_at ? formatDate(r.claimed_at) : '—'}</td>
                      <td className="px-4 py-3">
                        {['claimable', 'claimed'].includes(r.status) && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => revokeReward(r.id)}
                            disabled={revoking === r.id}
                          >
                            <XCircle className="w-3 h-3" /> Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rewards.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No rewards issued yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Leaderboard Tab */}
        {tab === 'leaderboard' && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Successful</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Signups</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((u, i) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`font-bold ${i === 0 ? 'text-primary' : i === 1 ? 'text-muted-foreground' : i === 2 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {u.username ? `@${u.username}` : u.full_name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-primary">{u.referral_success_count}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.referral_signup_count}</td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No referrers yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Anti-abuse note */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
          <AlertTriangle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Anti-Abuse Measures Active</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Self-referrals are blocked. Each referee can only count toward one referrer. Rewards cannot be converted to wallet cash.
              Use the Revoke button on the Rewards tab if you detect fraudulent activity.
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminReferralCampaign;
