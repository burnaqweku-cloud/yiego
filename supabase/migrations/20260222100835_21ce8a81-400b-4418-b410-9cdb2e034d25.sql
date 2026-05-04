
-- Table: referral_qualified_events
-- Tracks each individual referral qualification event with week_key for leaderboard aggregation
CREATE TABLE public.referral_qualified_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  first_order_id text,
  qualified_at timestamptz NOT NULL DEFAULT now(),
  week_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_referred_user UNIQUE (referred_user_id),
  CONSTRAINT uq_referrer_referred UNIQUE (referrer_user_id, referred_user_id)
);

-- Index for weekly leaderboard queries
CREATE INDEX idx_rqe_week_key ON public.referral_qualified_events (week_key);
CREATE INDEX idx_rqe_referrer ON public.referral_qualified_events (referrer_user_id);

-- Enable RLS
ALTER TABLE public.referral_qualified_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admin can manage referral_qualified_events"
  ON public.referral_qualified_events FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users can view own referral_qualified_events"
  ON public.referral_qualified_events FOR SELECT
  USING (referrer_user_id = auth.uid());

CREATE POLICY "Admin or staff can view all referral_qualified_events"
  ON public.referral_qualified_events FOR SELECT
  USING (is_admin_or_staff());

-- Table: weekly_leaderboard_rewards
CREATE TABLE public.weekly_leaderboard_rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_key text NOT NULL,
  user_id uuid NOT NULL,
  rank integer NOT NULL,
  reward_mb integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_weekly_user UNIQUE (week_key, user_id),
  CONSTRAINT uq_weekly_rank UNIQUE (week_key, rank),
  CONSTRAINT chk_rank CHECK (rank >= 1 AND rank <= 3),
  CONSTRAINT chk_status CHECK (status IN ('pending', 'processed', 'failed'))
);

CREATE INDEX idx_wlr_week_key ON public.weekly_leaderboard_rewards (week_key);

-- Enable RLS
ALTER TABLE public.weekly_leaderboard_rewards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admin can manage weekly_leaderboard_rewards"
  ON public.weekly_leaderboard_rewards FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Users can view own weekly_leaderboard_rewards"
  ON public.weekly_leaderboard_rewards FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin or staff can view all weekly_leaderboard_rewards"
  ON public.weekly_leaderboard_rewards FOR SELECT
  USING (is_admin_or_staff());

-- Database function: get weekly leaderboard (Top 10)
CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard(p_week_key text)
RETURNS TABLE(
  user_id uuid,
  username text,
  qualified_count bigint,
  rank bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    rqe.referrer_user_id AS user_id,
    p.username,
    COUNT(*) AS qualified_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, MIN(rqe.qualified_at) ASC) AS rank
  FROM public.referral_qualified_events rqe
  INNER JOIN public.profiles p ON p.id = rqe.referrer_user_id
  WHERE rqe.week_key = p_week_key
    AND p.suspended = false
  GROUP BY rqe.referrer_user_id, p.username
  ORDER BY qualified_count DESC, MIN(rqe.qualified_at) ASC
  LIMIT 10;
$$;

-- Database function: get user's weekly rank
CREATE OR REPLACE FUNCTION public.get_user_weekly_rank(p_user_id uuid, p_week_key text)
RETURNS TABLE(
  user_rank bigint,
  qualified_count bigint,
  tenth_place_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ranked AS (
    SELECT
      rqe.referrer_user_id,
      COUNT(*) AS cnt,
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, MIN(rqe.qualified_at) ASC) AS rk
    FROM public.referral_qualified_events rqe
    INNER JOIN public.profiles p ON p.id = rqe.referrer_user_id
    WHERE rqe.week_key = p_week_key
      AND p.suspended = false
    GROUP BY rqe.referrer_user_id
  ),
  tenth AS (
    SELECT COALESCE((SELECT cnt FROM ranked WHERE rk = 10), 0) AS tenth_cnt
  )
  SELECT
    COALESCE((SELECT rk FROM ranked WHERE referrer_user_id = p_user_id), 0) AS user_rank,
    COALESCE((SELECT cnt FROM ranked WHERE referrer_user_id = p_user_id), 0) AS qualified_count,
    (SELECT tenth_cnt FROM tenth) AS tenth_place_count;
$$;
