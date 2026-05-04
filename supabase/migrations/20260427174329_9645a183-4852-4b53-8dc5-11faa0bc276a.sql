-- 1. Ban + warning columns
ALTER TABLE public.telegram_points_balances
  ADD COLUMN IF NOT EXISTS banned_from_points boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_reason text,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_at timestamptz;

ALTER TABLE public.telegram_points_ledger
  DROP CONSTRAINT IF EXISTS telegram_points_ledger_reason_check;
ALTER TABLE public.telegram_points_ledger
  ADD CONSTRAINT telegram_points_ledger_reason_check CHECK (
    reason = ANY (ARRAY[
      'referral_referrer','referral_referee','purchase','checkin','streak_bonus',
      'redemption','expiry','admin_adjust','admin_revoke'
    ])
  );

CREATE OR REPLACE FUNCTION public.admin_adjust_telegram_points(
  p_target_user_id uuid, p_delta integer, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_admin uuid; v_balance int; v_new int; v_reason text;
BEGIN
  v_admin := auth.uid();
  IF v_admin IS NULL OR NOT public.is_admin() THEN RETURN jsonb_build_object('success', false, 'error', 'NOT_ADMIN'); END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN RETURN jsonb_build_object('success', false, 'error', 'REASON_REQUIRED'); END IF;
  IF p_delta = 0 OR p_delta IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_DELTA'); END IF;

  INSERT INTO public.telegram_points_balances (user_id, balance) VALUES (p_target_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.telegram_points_balances WHERE user_id = p_target_user_id FOR UPDATE;

  v_new := v_balance + p_delta;
  IF v_new < 0 THEN RETURN jsonb_build_object('success', false, 'error', 'WOULD_GO_NEGATIVE', 'balance', v_balance); END IF;

  UPDATE public.telegram_points_balances SET balance = v_new, last_activity_at = now(), updated_at = now()
  WHERE user_id = p_target_user_id;

  v_reason := CASE WHEN p_delta > 0 THEN 'admin_adjust' ELSE 'admin_revoke' END;
  INSERT INTO public.telegram_points_ledger (user_id, delta, reason, reference_id, balance_after)
  VALUES (p_target_user_id, p_delta, v_reason,
          format('admin:%s:%s', v_admin, extract(epoch from now())::bigint), v_new);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'delta', p_delta);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_telegram_points_ban(
  p_target_user_id uuid, p_banned boolean, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RETURN jsonb_build_object('success', false, 'error', 'NOT_ADMIN'); END IF;
  INSERT INTO public.telegram_points_balances (user_id, balance) VALUES (p_target_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.telegram_points_balances
  SET banned_from_points = p_banned,
      banned_reason = CASE WHEN p_banned THEN NULLIF(trim(COALESCE(p_reason,'')), '') ELSE NULL END,
      banned_at = CASE WHEN p_banned THEN now() ELSE NULL END,
      updated_at = now()
  WHERE user_id = p_target_user_id;
  RETURN jsonb_build_object('success', true, 'banned', p_banned);
END; $$;

CREATE OR REPLACE FUNCTION public.telegram_points_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_staff() THEN RETURN jsonb_build_object('error', 'NOT_ADMIN'); END IF;
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.telegram_points_balances),
    'users_with_points', (SELECT count(*) FROM public.telegram_points_balances WHERE balance > 0),
    'banned_users', (SELECT count(*) FROM public.telegram_points_balances WHERE banned_from_points),
    'outstanding_points', (SELECT COALESCE(SUM(balance), 0) FROM public.telegram_points_balances),
    'points_issued_total', (SELECT COALESCE(SUM(delta), 0) FROM public.telegram_points_ledger WHERE delta > 0),
    'points_redeemed_total', (SELECT COALESCE(SUM(-delta), 0) FROM public.telegram_points_ledger WHERE delta < 0 AND reason IN ('redemption','expiry','admin_revoke')),
    'redemptions_count', (SELECT count(*) FROM public.telegram_points_ledger WHERE reason = 'redemption'),
    'redemptions_gb', (SELECT COALESCE(SUM(-delta), 0) / 1000 FROM public.telegram_points_ledger WHERE reason = 'redemption'),
    'issued_7d', (SELECT COALESCE(SUM(delta), 0) FROM public.telegram_points_ledger WHERE delta > 0 AND created_at >= now() - interval '7 days'),
    'redeemed_7d', (SELECT COALESCE(SUM(-delta), 0) FROM public.telegram_points_ledger WHERE delta < 0 AND reason = 'redemption' AND created_at >= now() - interval '7 days'),
    'active_24h', (SELECT count(*) FROM public.telegram_points_balances WHERE last_activity_at >= now() - interval '24 hours'),
    'breakdown_30d', (
      SELECT jsonb_object_agg(reason, total) FROM (
        SELECT reason, SUM(delta) AS total FROM public.telegram_points_ledger
        WHERE created_at >= now() - interval '30 days' GROUP BY reason
      ) t
    )
  ) INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.telegram_points_top_earners(p_limit int DEFAULT 25)
RETURNS TABLE(user_id uuid, balance int, lifetime_earned bigint, lifetime_redeemed bigint, banned boolean,
  last_activity_at timestamptz, chat_id bigint, phone text, username text, first_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT b.user_id, b.balance,
    COALESCE((SELECT SUM(delta) FROM public.telegram_points_ledger l WHERE l.user_id = b.user_id AND l.delta > 0), 0)::bigint,
    COALESCE((SELECT -SUM(delta) FROM public.telegram_points_ledger l WHERE l.user_id = b.user_id AND l.delta < 0), 0)::bigint,
    b.banned_from_points, b.last_activity_at,
    tl.chat_id, tl.phone, tl.username, tl.first_name
  FROM public.telegram_points_balances b
  LEFT JOIN public.telegram_links tl ON tl.user_id = b.user_id
  ORDER BY b.balance DESC, b.last_activity_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

CREATE OR REPLACE FUNCTION public.telegram_points_weekly_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE(rank bigint, leader_user_id uuid, chat_id bigint, first_name text, username text, points_earned bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH week_start AS (
    SELECT (date_trunc('week', (now() AT TIME ZONE 'Africa/Accra')) AT TIME ZONE 'Africa/Accra') AS ws
  ),
  agg AS (
    SELECT l.user_id AS uid, SUM(l.delta) AS earned
    FROM public.telegram_points_ledger l, week_start
    WHERE l.delta > 0 AND l.created_at >= week_start.ws
    GROUP BY l.user_id
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY a.earned DESC, a.uid) AS rank,
    a.uid AS leader_user_id,
    tl.chat_id, tl.first_name, tl.username,
    a.earned::bigint
  FROM agg a
  LEFT JOIN public.telegram_links tl ON tl.user_id = a.uid
  LEFT JOIN public.telegram_points_balances b ON b.user_id = a.uid
  WHERE COALESCE(b.banned_from_points, false) = false
  ORDER BY a.earned DESC, a.uid
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

CREATE OR REPLACE FUNCTION public.expire_telegram_inactive_points(p_days int DEFAULT 180, p_max int DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_count int := 0; v_total bigint := 0;
BEGIN
  FOR r IN
    SELECT user_id, balance FROM public.telegram_points_balances
    WHERE balance > 0 AND last_activity_at < now() - (p_days || ' days')::interval
    ORDER BY last_activity_at ASC LIMIT GREATEST(1, LEAST(p_max, 5000))
  LOOP
    UPDATE public.telegram_points_balances SET balance = 0, last_activity_at = now(), updated_at = now()
    WHERE user_id = r.user_id;
    INSERT INTO public.telegram_points_ledger (user_id, delta, reason, reference_id, balance_after)
    VALUES (r.user_id, -r.balance, 'expiry', format('expiry:%s:%s', r.user_id, extract(epoch from now())::bigint), 0);
    v_count := v_count + 1; v_total := v_total + r.balance;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'expired_users', v_count, 'expired_points', v_total);
END; $$;

CREATE OR REPLACE FUNCTION public.telegram_points_expiry_warnings(p_days int DEFAULT 180, p_warn_days int DEFAULT 30, p_max int DEFAULT 200)
RETURNS TABLE(user_id uuid, chat_id bigint, balance int, last_activity_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT b.user_id, tl.chat_id, b.balance, b.last_activity_at
  FROM public.telegram_points_balances b
  JOIN public.telegram_links tl ON tl.user_id = b.user_id
  WHERE b.balance > 0
    AND COALESCE(b.banned_from_points, false) = false
    AND b.last_activity_at < now() - ((p_days - p_warn_days) || ' days')::interval
    AND b.last_activity_at >= now() - (p_days || ' days')::interval
    AND (b.expiry_warning_sent_at IS NULL OR b.expiry_warning_sent_at < b.last_activity_at)
  ORDER BY b.last_activity_at ASC
  LIMIT GREATEST(1, LEAST(p_max, 1000));
$$;

CREATE OR REPLACE FUNCTION public.mark_telegram_expiry_warning_sent(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.telegram_points_balances SET expiry_warning_sent_at = now() WHERE user_id = p_user_id;
$$;