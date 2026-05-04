import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Crown, Medal, Trophy, TrendingUp, Flame, Sparkles, ChevronDown, Flag } from 'lucide-react';

/* ─── TYPES ──────────────────────────────────────────────────── */
interface LeaderboardEntry {
  user_id: string;
  username: string | null;
  qualified_count: number;
  rank: number;
}

interface UserRankInfo {
  user_rank: number;
  qualified_count: number;
  tenth_place_count: number;
}

/* ─── WEEK HELPERS (Ghana time = UTC+0) ──────────────────────── */
function getCurrentWeekKey(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekEndTime(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday, 23, 59, 59));
}

/* ─── COUNTDOWN HOOK ─────────────────────────────────────────── */
function useCountdown(targetDate: Date) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Ended'); return; }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (days > 0) setTimeLeft(`${days}d ${hours}h`);
      else if (hours > 0) setTimeLeft(`${hours}h ${mins}m`);
      else setTimeLeft(`${mins}m`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [targetDate]);
  return timeLeft;
}

/* ─── STYLES ─────────────────────────────────────────────────── */
const LEADERBOARD_STYLES = `
  @keyframes lb-shimmer {
    0% { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
  @keyframes lb-pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.7); }
  }
  @keyframes lb-fade-up {
    0% { opacity: 0; transform: translateY(16px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes lb-glow-pulse {
    0%, 100% { box-shadow: 0 0 12px 2px rgba(251,191,36,.15); }
    50% { box-shadow: 0 0 20px 5px rgba(251,191,36,.3); }
  }
  @keyframes lb-spark {
    0%, 100% { opacity: 0.3; transform: scale(0.8) rotate(0deg); }
    50% { opacity: 1; transform: scale(1.2) rotate(180deg); }
  }
  @keyframes lb-toast-in {
    0% { opacity: 0; transform: translateY(-16px) scale(0.95); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes lb-toast-out {
    0% { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-12px) scale(0.95); }
  }
`;

/* ─── RANK CONFIGS ───────────────────────────────────────────── */
const RANK_CONFIG = [
  { rank: 1, label: '1st', icon: Crown, color: '#fbbf24', glowRgb: '251,191,36', gradient: 'linear-gradient(135deg, #b45309, #f59e0b, #fbbf24)', rewardLabel: '+2GB' },
  { rank: 2, label: '2nd', icon: Medal, color: '#94a3b8', glowRgb: '148,163,184', gradient: 'linear-gradient(135deg, #475569, #94a3b8, #cbd5e1)', rewardLabel: '+1GB' },
  { rank: 3, label: '3rd', icon: Trophy, color: '#cd7f32', glowRgb: '205,127,50', gradient: 'linear-gradient(135deg, #92400e, #cd7f32, #d4a574)', rewardLabel: '+500MB' },
];

/* ─── RANK CHANGE TOAST ──────────────────────────────────────── */
const RankChangeToast = memo(({ message, visible }: { message: string; visible: boolean }) => {
  if (!message) return null;
  return (
    <div
      className="absolute top-2 left-1/2 z-50 pointer-events-none"
      style={{
        transform: 'translateX(-50%)',
        animation: visible ? 'lb-toast-in 0.3s ease-out forwards' : 'lb-toast-out 0.3s ease-out forwards',
      }}
    >
      <div className="px-4 py-2 rounded-xl text-[11px] font-black whitespace-nowrap"
        style={{
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(251,191,36,.25)',
          color: '#fbbf24',
          boxShadow: '0 4px 20px rgba(0,0,0,.3)',
        }}>
        {message}
      </div>
    </div>
  );
});
RankChangeToast.displayName = 'RankChangeToast';

/* ─── TOP 3 PODIUM CARD ─────────────────────────────────────── */
const PodiumCard = memo(({ entry, config, delay }: { entry: LeaderboardEntry | null; config: typeof RANK_CONFIG[0]; delay: number }) => {
  const isFirst = config.rank === 1;
  const Icon = config.icon;

  if (!entry) {
    return (
      <div
        className="relative rounded-2xl p-3 flex flex-col items-center gap-1.5"
        style={{
          background: 'rgba(255,255,255,.02)',
          border: '1px dashed rgba(255,255,255,.08)',
          animation: `lb-fade-up 0.5s ${delay}s ease-out both`,
          minHeight: isFirst ? 140 : 120,
        }}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `rgba(${config.glowRgb},.1)` }}>
          <Icon className="w-5 h-5" style={{ color: `rgba(${config.glowRgb},.3)` }} />
        </div>
        <span className="text-[10px] font-black" style={{ color: 'rgba(255,255,255,.25)' }}>{config.label} Place</span>
        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,.15)' }}>Open</span>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: `rgba(${config.glowRgb},.06)`,
        border: `1px solid rgba(${config.glowRgb},.25)`,
        animation: `lb-fade-up 0.5s ${delay}s ease-out both`,
        boxShadow: isFirst ? `0 0 24px 4px rgba(${config.glowRgb},.12)` : `0 0 12px 2px rgba(${config.glowRgb},.06)`,
      }}
    >
      {isFirst && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
          background: `linear-gradient(90deg, transparent 30%, rgba(${config.glowRgb},.15) 50%, transparent 70%)`,
          backgroundSize: '200% 100%',
          animation: 'lb-shimmer 3s linear infinite',
        }} />
      )}
      <div className="relative z-10 p-3 flex flex-col items-center gap-1.5">
        <div
          className={`rounded-full flex items-center justify-center ${isFirst ? 'w-12 h-12' : 'w-10 h-10'}`}
          style={{
            background: config.gradient,
            boxShadow: `0 0 16px 3px rgba(${config.glowRgb},.3)`,
          }}
        >
          <Icon className={isFirst ? 'w-6 h-6' : 'w-5 h-5'} style={{ color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.4))' }} />
        </div>
        <p className={`font-black truncate max-w-full text-center ${isFirst ? 'text-sm' : 'text-xs'}`} style={{ color: config.color }}>
          @{entry.username || 'user'}
        </p>
        <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,.55)' }}>
          {entry.qualified_count} qualified referrals
        </p>
        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: `rgba(${config.glowRgb},.18)`, color: config.color, border: `1px solid rgba(${config.glowRgb},.3)` }}>
          {config.rewardLabel}
        </span>
      </div>
    </div>
  );
});
PodiumCard.displayName = 'PodiumCard';

/* ─── EXPANDED CONTENT (lazy rendered) ───────────────────────── */
const LeaderboardExpandedContent = memo(({ leaderboard, userRank }: {
  leaderboard: LeaderboardEntry[];
  userRank: UserRankInfo | null;
}) => {
  const top3 = useMemo(() => leaderboard.filter(e => e.rank <= 3), [leaderboard]);
  const rest = useMemo(() => leaderboard.filter(e => e.rank > 3), [leaderboard]);
  const hasParticipants = leaderboard.length > 0;

  const motivMessage = useMemo(() => {
    if (!userRank) return null;
    if (userRank.user_rank === 0 || userRank.qualified_count === 0) {
      return 'Start sharing your link to enter the board';
    }
    if (userRank.user_rank <= 3) return '🏆 You\'re in the Top 3!';
    if (userRank.user_rank <= 10) return '🔥 You\'re in the Top 10!';
    if (userRank.tenth_place_count > 0) {
      const delta = userRank.tenth_place_count - userRank.qualified_count + 1;
      if (delta <= 2 && delta > 0) return `Only ${delta} more to enter Top 10 🔥`;
    }
    return null;
  }, [userRank]);

  const showHoldPosition = userRank && userRank.user_rank > 0 && userRank.user_rank <= 3;

  return (
    <div style={{ animation: 'lb-fade-up 0.25s ease-out both' }}>
      {/* Clarity header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <Flag className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: '#fbbf24' }}>
          Weekly Competition (Bonus Rewards Only)
        </span>
      </div>

      {/* ── TOP 3 PODIUM ──────────────────────────────────── */}
      {!hasParticipants ? (
        <div className="text-center py-6 mb-4 rounded-2xl" style={{
          background: 'rgba(255,255,255,.02)',
          border: '1px dashed rgba(255,255,255,.08)',
        }}>
          <Trophy className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(251,191,36,.25)' }} />
          <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,.4)' }}>
            Be among the first this week
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,.25)' }}>
            Refer friends to climb the leaderboard
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {RANK_CONFIG.map((config, i) => (
            <PodiumCard
              key={config.rank}
              entry={top3.find(e => e.rank === config.rank) || null}
              config={config}
              delay={i * 0.1}
            />
          ))}
        </div>
      )}

      {/* ── RANKS 4-10 ──────────────────────────────────── */}
      {rest.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-4" style={{
          background: 'rgba(255,255,255,.02)',
          border: '1px solid rgba(255,255,255,.06)',
        }}>
          {rest.map((entry, i) => (
            <div
              key={entry.user_id}
              className="flex items-center gap-3 px-3 py-2.5 transition-all duration-200"
              style={{
                borderBottom: i < rest.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                animation: `lb-fade-up 0.4s ${0.3 + i * 0.05}s ease-out both`,
              }}
            >
              <span className="text-xs font-black w-6 text-center" style={{ color: 'rgba(255,255,255,.35)' }}>
                #{entry.rank}
              </span>
              <p className="flex-1 text-xs font-black truncate" style={{ color: 'rgba(255,255,255,.75)' }}>
                @{entry.username || 'user'}
              </p>
              <span className="text-[10px] font-bold shrink-0" style={{ color: 'rgba(255,255,255,.45)' }}>
                {entry.qualified_count} qualified referrals
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── YOUR RANK CARD ──────────────────────────────── */}
      <div className="rounded-2xl p-3.5" style={{
        background: 'rgba(251,191,36,.04)',
        border: '1px solid rgba(251,191,36,.15)',
      }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: '#fbbf24' }} />
            <span className="text-xs font-black" style={{ color: 'rgba(255,255,255,.8)' }}>
              Your Rank This Week
            </span>
          </div>
          <span className="text-sm font-black" style={{ color: '#fbbf24' }}>
            {userRank && userRank.user_rank > 0 ? `#${userRank.user_rank}` : '—'}
          </span>
        </div>
        <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,.45)' }}>
          {userRank?.qualified_count ?? 0} qualified referrals this week
        </p>
        {motivMessage && (
          <p className="text-[10px] font-black mt-1.5" style={{ color: '#fbbf24' }}>
            {motivMessage}
          </p>
        )}
        {showHoldPosition && (
          <p className="text-[9px] font-bold mt-1" style={{ color: 'rgba(251,191,36,.65)' }}>
            Hold your position before week ends 🔥
          </p>
        )}
      </div>

      {/* ── WEEKLY BONUS REWARDS ────────────────────────── */}
      <div className="mt-3 rounded-2xl p-3.5 relative overflow-hidden" style={{
        background: 'rgba(251,191,36,.03)',
        border: '1px solid rgba(251,191,36,.12)',
      }}>
        <div className="absolute top-2 right-3 pointer-events-none">
          <Sparkles className="w-3.5 h-3.5" style={{
            color: 'rgba(251,191,36,.25)',
            animation: 'lb-spark 4s ease-in-out infinite',
          }} />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Flame className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#fbbf24' }}>
            Weekly Bonus Rewards
          </span>
        </div>
        <div className="space-y-1.5">
          {[
            { rank: '1st', reward: '+2GB', color: '#fbbf24' },
            { rank: '2nd', reward: '+1GB', color: '#94a3b8' },
            { rank: '3rd', reward: '+500MB', color: '#cd7f32' },
          ].map(r => (
            <div key={r.rank} className="flex items-center justify-between">
              <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,.5)' }}>{r.rank} Place</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{
                background: `${r.color}15`,
                color: r.color,
                border: `1px solid ${r.color}30`,
              }}>
                {r.reward}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[9px] mt-2 font-medium" style={{ color: 'rgba(255,255,255,.3)' }}>
          Bonus rewards are granted automatically at week end.
        </p>
        <p className="text-[9px] mt-0.5 font-medium" style={{ color: 'rgba(255,255,255,.22)' }}>
          These bonuses are separate from your milestone rewards.
        </p>
      </div>
    </div>
  );
});
LeaderboardExpandedContent.displayName = 'LeaderboardExpandedContent';

/* ─── MAIN COMPONENT ─────────────────────────────────────────── */
const WeeklyLeaderboard = () => {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<UserRankInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Toast state
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastCooldownRef = useRef(0);
  const prevTop3Ref = useRef<string[]>([]);

  const weekKey = useMemo(() => getCurrentWeekKey(), []);
  const weekEnd = useMemo(() => getWeekEndTime(), []);
  const countdown = useCountdown(weekEnd);

  const showToast = useCallback((msg: string) => {
    const now = Date.now();
    if (now - toastCooldownRef.current < 20000) return;
    toastCooldownRef.current = now;
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2700);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const [lbResult, rankResult] = await Promise.all([
        supabase.rpc('get_weekly_leaderboard', { p_week_key: weekKey }),
        user ? supabase.rpc('get_user_weekly_rank', { p_user_id: user.id, p_week_key: weekKey }) : null,
      ]);

      if (lbResult.data) {
        const entries: LeaderboardEntry[] = lbResult.data.map((r: any) => ({
          user_id: r.user_id,
          username: r.username,
          qualified_count: Number(r.qualified_count),
          rank: Number(r.rank),
        }));
        setLeaderboard(entries);

        // Check for rank changes in top 3
        const newTop3 = entries.filter(e => e.rank <= 3).map(e => e.user_id);
        const prev = prevTop3Ref.current;
        if (prev.length > 0) {
          const newEntry = newTop3.find(id => !prev.includes(id));
          if (newEntry) {
            const entry = entries.find(e => e.user_id === newEntry);
            if (entry) showToast(`@${entry.username || 'user'} just entered Top 3 🔥`);
          }
        }
        prevTop3Ref.current = newTop3;
      }

      if (rankResult?.data) {
        const d = Array.isArray(rankResult.data) ? rankResult.data[0] : rankResult.data;
        if (d) {
          setUserRank({
            user_rank: Number(d.user_rank),
            qualified_count: Number(d.qualified_count),
            tenth_place_count: Number(d.tenth_place_count),
          });
        }
      }
    } catch (err) {
      console.error('[leaderboard] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [weekKey, user, showToast]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const darkCard: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(15,10,25,.95), rgba(10,10,20,.98))',
    border: '1px solid rgba(255,255,255,.06)',
    boxShadow: '0 8px 32px rgba(0,0,0,.3)',
  };

  return (
    <>
      <style>{LEADERBOARD_STYLES}</style>
      <div className="relative overflow-hidden rounded-3xl" style={darkCard}>
        {/* Toast notification */}
        <RankChangeToast message={toastMsg} visible={toastVisible} />

        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 pointer-events-none" style={{
          background: 'radial-gradient(circle, rgba(251,191,36,.06) 0%, transparent 70%)',
        }} />
        <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)' }} />

        {/* ── COLLAPSED HEADER (always visible) ──────────── */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="relative z-10 w-full text-left p-5"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,.15)' }}>
                  <Trophy className="w-4 h-4" style={{ color: '#fbbf24' }} />
                </div>
                <h3 className="font-black text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  🏁 Weekly Referral Competition
                </h3>
              </div>
              <p className="text-[10px] font-bold ml-10" style={{ color: 'rgba(255,255,255,.4)' }}>
                Compete for bonus rewards.
              </p>
              <p className="text-[9px] mt-1 ml-10" style={{ color: 'rgba(255,255,255,.25)' }}>
                Bonus rewards are separate from your 25GB milestone rewards.
              </p>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-2">
              {/* Countdown badge */}
              <div className="px-3 py-1.5 rounded-xl flex items-center gap-2"
                style={{
                  background: 'rgba(251,191,36,.08)',
                  border: '1px solid rgba(251,191,36,.2)',
                  animation: 'lb-glow-pulse 3s ease-in-out infinite',
                }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{
                  background: '#4ade80',
                  animation: 'lb-pulse-dot 2s ease-in-out infinite',
                  boxShadow: '0 0 4px #4ade80',
                }} />
                <span className="text-[10px] font-black" style={{ color: '#fbbf24' }}>
                  {loading ? '...' : `Ends in ${countdown}`}
                </span>
              </div>

              {/* Toggle chevron */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold" style={{ color: 'rgba(255,255,255,.35)' }}>
                  {expanded ? 'Hide' : 'View Leaderboard'}
                </span>
                <ChevronDown
                  className="w-3.5 h-3.5 transition-transform duration-300"
                  style={{
                    color: 'rgba(255,255,255,.35)',
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </div>
            </div>
          </div>
        </button>

        {/* ── EXPANDED CONTENT (lazy rendered) ────────────── */}
        {expanded && !loading && (
          <div className="relative z-10 px-5 pb-5">
            <LeaderboardExpandedContent leaderboard={leaderboard} userRank={userRank} />
          </div>
        )}

        {expanded && loading && (
          <div className="flex items-center justify-center py-8 px-5 pb-5">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'rgba(251,191,36,.4)', borderTopColor: 'transparent' }} />
          </div>
        )}
      </div>
    </>
  );
};

export default WeeklyLeaderboard;
