DROP FUNCTION IF EXISTS public.telegram_points_weekly_leaderboard(integer);

CREATE OR REPLACE FUNCTION public.telegram_points_weekly_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE(
  rank bigint,
  telegram_user_id bigint,
  leader_user_id uuid,
  chat_id bigint,
  first_name text,
  username text,
  points_earned bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH week_start AS (
    SELECT (date_trunc('week', (now() AT TIME ZONE 'Africa/Accra')) AT TIME ZONE 'Africa/Accra') AS ws
  ),
  agg AS (
    SELECT
      COALESCE(l.telegram_user_id, (
        SELECT tl.chat_id FROM public.telegram_links tl WHERE tl.user_id = l.user_id LIMIT 1
      )) AS tg_uid,
      l.user_id AS uid,
      SUM(l.delta) AS earned
    FROM public.telegram_points_ledger l, week_start
    WHERE l.delta > 0 AND l.created_at >= week_start.ws
    GROUP BY 1, 2
  ),
  collapsed AS (
    SELECT tg_uid,
           (ARRAY_AGG(uid) FILTER (WHERE uid IS NOT NULL))[1] AS uid,
           SUM(earned)::bigint AS earned
    FROM agg
    WHERE tg_uid IS NOT NULL
    GROUP BY tg_uid
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY c.earned DESC, c.tg_uid) AS rank,
    c.tg_uid AS telegram_user_id,
    c.uid AS leader_user_id,
    c.tg_uid AS chat_id,
    tl.first_name,
    tl.username,
    c.earned
  FROM collapsed c
  LEFT JOIN public.telegram_links tl ON tl.chat_id = c.tg_uid
  LEFT JOIN public.telegram_points_balances b ON b.telegram_user_id = c.tg_uid
  WHERE COALESCE(b.banned_from_points, false) = false
  ORDER BY c.earned DESC, c.tg_uid
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$function$;