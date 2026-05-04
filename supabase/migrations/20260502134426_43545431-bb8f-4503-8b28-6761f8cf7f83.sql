-- =============================================================================
-- A1: Fix users_list to fall back to telegram_known_users for guest first_name
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_users_list(
  p_search text DEFAULT NULL,
  p_linked text DEFAULT NULL,
  p_active text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_size integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offset int := GREATEST((p_page-1)*p_size, 0);
  v_size int := LEAST(GREATEST(p_size, 1), 200);
  v_rows jsonb;
  v_total int;
  v_search text := NULLIF(trim(COALESCE(p_search,'')),'');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH
  universe AS (
    SELECT chat_id FROM telegram_links
    UNION SELECT chat_id FROM telegram_sessions
    UNION SELECT telegram_chat_id AS chat_id FROM orders WHERE telegram_chat_id IS NOT NULL
    UNION SELECT telegram_user_id AS chat_id FROM telegram_known_users
  ),
  ord_agg AS (
    SELECT telegram_chat_id AS chat_id,
           count(*) AS order_count,
           COALESCE(sum(amount_ghs) FILTER (WHERE payment_status='paid'),0) AS spent_ghs,
           min(created_at) AS first_order_at,
           max(created_at) AS last_order_at
    FROM orders WHERE telegram_chat_id IS NOT NULL GROUP BY telegram_chat_id
  ),
  sess_meta AS (
    SELECT chat_id, updated_at,
           NULLIF(data->>'username','')   AS s_username,
           NULLIF(data->>'first_name','') AS s_first_name
    FROM telegram_sessions
  ),
  known AS (
    SELECT telegram_user_id AS chat_id, first_name AS k_first_name, first_seen_at, last_seen_at
    FROM telegram_known_users
  ),
  base AS (
    SELECT
      u.chat_id,
      COALESCE(tl.username, sm.s_username) AS username,
      COALESCE(tl.first_name, sm.s_first_name, kn.k_first_name) AS first_name,
      tl.user_id,
      tl.phone,
      LEAST(
        COALESCE(tl.created_at, 'infinity'::timestamptz),
        COALESCE(sm.updated_at, 'infinity'::timestamptz),
        COALESCE(oa.first_order_at, 'infinity'::timestamptz),
        COALESCE(kn.first_seen_at, 'infinity'::timestamptz)
      ) AS created_at,
      GREATEST(
        COALESCE(tl.last_active_at, '-infinity'::timestamptz),
        COALESCE(sm.updated_at, '-infinity'::timestamptz),
        COALESCE(oa.last_order_at, '-infinity'::timestamptz),
        COALESCE(kn.last_seen_at, '-infinity'::timestamptz)
      ) AS last_active_at,
      COALESCE(oa.order_count, 0) AS order_count,
      COALESCE(oa.spent_ghs, 0) AS spent_ghs,
      COALESCE((SELECT balance FROM telegram_points_balances pb WHERE pb.user_id = tl.user_id), 0) AS points,
      COALESCE((SELECT count(*) FROM telegram_referrals r WHERE r.referrer_chat_id = u.chat_id), 0) AS refs_sent,
      COALESCE((SELECT count(*) FROM telegram_referrals r WHERE r.referrer_chat_id = u.chat_id AND r.status IN ('qualified','rewarded')), 0) AS refs_qualified
    FROM universe u
    LEFT JOIN telegram_links tl ON tl.chat_id = u.chat_id
    LEFT JOIN ord_agg oa        ON oa.chat_id = u.chat_id
    LEFT JOIN sess_meta sm      ON sm.chat_id = u.chat_id
    LEFT JOIN known kn          ON kn.chat_id = u.chat_id
  ),
  filtered AS (
    SELECT * FROM base
    WHERE
      (v_search IS NULL
        OR username   ILIKE '%'||v_search||'%'
        OR first_name ILIKE '%'||v_search||'%'
        OR phone      ILIKE '%'||v_search||'%'
        OR chat_id::text = v_search)
      AND (p_linked IS NULL
        OR (p_linked='linked'   AND user_id IS NOT NULL)
        OR (p_linked='unlinked' AND user_id IS NULL))
      AND (p_active IS NULL
        OR (p_active='active7'    AND last_active_at >= now() - interval '7 days')
        OR (p_active='inactive30' AND (last_active_at = '-infinity'::timestamptz OR last_active_at < now() - interval '30 days')))
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM filtered)
  INTO v_rows, v_total
  FROM (
    SELECT chat_id, username, first_name, user_id, phone,
      NULLIF(created_at, 'infinity'::timestamptz)      AS created_at,
      NULLIF(last_active_at, '-infinity'::timestamptz) AS last_active_at,
      order_count, spent_ghs, points, refs_sent, refs_qualified
    FROM filtered
    ORDER BY last_active_at DESC NULLS LAST, created_at DESC NULLS LAST
    OFFSET v_offset LIMIT v_size
  ) b;

  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_users_list(text,text,text,integer,integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_users_list(text,text,text,integer,integer) TO authenticated;

-- =============================================================================
-- B1/B4: Enrich user_detail (lifetime points, deposits, referrals stats, known)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_user_detail(p_chat_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  v_exists boolean;
  v_session_username text;
  v_session_first_name text;
  v_session_updated timestamptz;
  v_known_first_name text;
  v_known_first_seen timestamptz;
  v_first_order timestamptz;
  v_last_order timestamptz;
  v_user_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM telegram_links WHERE chat_id = p_chat_id
    UNION ALL SELECT 1 FROM telegram_sessions WHERE chat_id = p_chat_id
    UNION ALL SELECT 1 FROM orders WHERE telegram_chat_id = p_chat_id
    UNION ALL SELECT 1 FROM telegram_known_users WHERE telegram_user_id = p_chat_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object('link', NULL, 'profile', NULL, 'points', NULL, 'session', NULL,
      'banned', NULL, 'recent_orders', '[]'::jsonb, 'recent_deposits', '[]'::jsonb,
      'recent_ledger', '[]'::jsonb, 'referrals_sent', 0, 'referred_by', NULL,
      'stats', jsonb_build_object());
  END IF;

  SELECT NULLIF(data->>'username',''), NULLIF(data->>'first_name',''), updated_at
    INTO v_session_username, v_session_first_name, v_session_updated
  FROM telegram_sessions WHERE chat_id = p_chat_id;

  SELECT first_name, first_seen_at INTO v_known_first_name, v_known_first_seen
  FROM telegram_known_users WHERE telegram_user_id = p_chat_id;

  SELECT min(created_at), max(created_at) INTO v_first_order, v_last_order
  FROM orders WHERE telegram_chat_id = p_chat_id;

  SELECT user_id INTO v_user_id FROM telegram_links WHERE chat_id = p_chat_id;

  SELECT jsonb_build_object(
    'link', COALESCE(
      (SELECT to_jsonb(tl) FROM telegram_links tl WHERE tl.chat_id = p_chat_id),
      jsonb_build_object(
        'chat_id', p_chat_id,
        'username', v_session_username,
        'first_name', COALESCE(v_session_first_name, v_known_first_name),
        'user_id', NULL,
        'phone', NULL,
        'created_at', LEAST(
          COALESCE(v_session_updated,'infinity'::timestamptz),
          COALESCE(v_first_order,'infinity'::timestamptz),
          COALESCE(v_known_first_seen,'infinity'::timestamptz)),
        'last_active_at', GREATEST(
          COALESCE(v_session_updated,'-infinity'::timestamptz),
          COALESCE(v_last_order,'-infinity'::timestamptz)),
        'linked_at', NULL
      )
    ),
    'profile', (SELECT to_jsonb(p) FROM profiles p
                JOIN telegram_links tl ON tl.user_id = p.id WHERE tl.chat_id = p_chat_id),
    'points', (SELECT to_jsonb(b) FROM telegram_points_balances b
                WHERE b.user_id = v_user_id),
    'session', (SELECT to_jsonb(s) FROM telegram_sessions s WHERE s.chat_id = p_chat_id),
    'banned', (SELECT to_jsonb(b) FROM tg_admin_bans b WHERE b.chat_id = p_chat_id),
    'recent_orders', (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
                      FROM (SELECT order_id, network, bundle_size_gb, amount_ghs, status, payment_status, payment_method, created_at
                            FROM orders WHERE telegram_chat_id = p_chat_id ORDER BY created_at DESC LIMIT 20) o),
    'recent_deposits', (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
                        FROM (SELECT paystack_reference, total_payable, status, created_at
                              FROM telegram_payment_intents WHERE chat_id = p_chat_id AND purpose='deposit'
                              ORDER BY created_at DESC LIMIT 20) d),
    'recent_ledger', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                      FROM (SELECT l.delta, l.reason, l.reference_id, l.balance_after, l.created_at
                            FROM telegram_points_ledger l
                            WHERE l.user_id = v_user_id
                            ORDER BY l.created_at DESC LIMIT 50) l),
    'referrals_sent', (SELECT count(*) FROM telegram_referrals WHERE referrer_chat_id = p_chat_id),
    'referrals_qualified', (SELECT count(*) FROM telegram_referrals WHERE referrer_chat_id = p_chat_id AND status IN ('qualified','rewarded')),
    'referred_by', (SELECT to_jsonb(r) FROM telegram_referrals r WHERE r.referee_chat_id = p_chat_id LIMIT 1),
    'stats', jsonb_build_object(
      'orders_count', COALESCE((SELECT count(*) FROM orders WHERE telegram_chat_id = p_chat_id),0),
      'orders_spent_ghs', COALESCE((SELECT sum(amount_ghs) FROM orders WHERE telegram_chat_id = p_chat_id AND payment_status='paid'),0),
      'deposits_count', COALESCE((SELECT count(*) FROM telegram_payment_intents WHERE chat_id = p_chat_id AND purpose='deposit' AND status='success'),0),
      'deposits_total_ghs', COALESCE((SELECT sum(total_payable) FROM telegram_payment_intents WHERE chat_id = p_chat_id AND purpose='deposit' AND status='success'),0),
      'points_lifetime_earned', COALESCE((SELECT sum(delta) FROM telegram_points_ledger WHERE user_id = v_user_id AND delta > 0),0),
      'points_lifetime_redeemed', COALESCE((SELECT -sum(delta) FROM telegram_points_ledger WHERE user_id = v_user_id AND delta < 0 AND reason IN ('redemption','redeem')),0),
      'points_from_referrals', COALESCE((SELECT sum(delta) FROM telegram_points_ledger WHERE user_id = v_user_id AND delta > 0 AND reason IN ('referral_referrer','referral_referee')),0),
      'first_seen', v_known_first_seen
    )
  ) INTO v;
  RETURN v;
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_user_detail(bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_user_detail(bigint) TO authenticated;

-- =============================================================================
-- E1: Fix redemptions_list (payment_method='reward' AND ledger join)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_redemptions_list(
  p_status text DEFAULT NULL, p_network text DEFAULT NULL,
  p_from timestamp with time zone DEFAULT NULL, p_to timestamp with time zone DEFAULT NULL,
  p_page integer DEFAULT 1, p_size integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offset int := GREATEST((p_page-1)*p_size,0);
  v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT o.order_id, o.telegram_chat_id, o.network, o.bundle_size_gb, o.recipient_number,
           o.status, o.payment_status, o.created_at,
           COALESCE(l.points_spent, 0) AS points_spent
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT -delta AS points_spent FROM telegram_points_ledger
      WHERE reason IN ('redemption','redeem') AND reference_id LIKE 'redemption:'||o.order_id||'%'
      LIMIT 1
    ) l ON true
    WHERE (o.payment_method IN ('reward','points'))
      AND o.telegram_chat_id IS NOT NULL
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_network IS NULL OR o.network = p_network)
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to IS NULL OR o.created_at < p_to)
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows,'[]'::jsonb),
    'total', COALESCE(v_total,0),
    'page', p_page, 'size', v_size,
    'lifetime_points', COALESCE((SELECT -sum(delta) FROM telegram_points_ledger WHERE reason IN ('redemption','redeem')),0),
    'lifetime_gb', COALESCE((SELECT sum(bundle_size_gb) FROM orders WHERE payment_method IN ('reward','points') AND status='Delivered'),0)
  );
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_redemptions_list(text,text,timestamp with time zone,timestamp with time zone,integer,integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_redemptions_list(text,text,timestamp with time zone,timestamp with time zone,integer,integer) TO authenticated;

-- =============================================================================
-- C1: Fix points_overview to include reason='redemption' (not just 'redeem')
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_points_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'outstanding', (SELECT COALESCE(sum(balance),0) FROM telegram_points_balances WHERE NOT COALESCE(banned_from_points,false)),
    'granted_week',  (SELECT COALESCE(sum(delta),0) FROM telegram_points_ledger WHERE delta>0 AND created_at >= now() - interval '7 days'),
    'redeemed_week', (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta<0 AND reason IN ('redemption','redeem') AND created_at >= now() - interval '7 days'),
    'expired_week',  (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta<0 AND reason='expired' AND created_at >= now() - interval '7 days'),
    'lifetime_redeemed', (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta<0 AND reason IN ('redemption','redeem')),
    'breakdown_30d', (SELECT jsonb_object_agg(reason, total) FROM (SELECT reason, sum(delta) AS total FROM telegram_points_ledger WHERE delta>0 AND created_at >= now() - interval '30 days' GROUP BY reason) g),
    'top_earners', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (SELECT b.user_id, b.balance, tl.chat_id, tl.first_name, tl.username FROM telegram_points_balances b LEFT JOIN telegram_links tl ON tl.user_id = b.user_id ORDER BY balance DESC LIMIT 10) t),
    'top_referrers', (SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) FROM (SELECT referrer_chat_id, count(*) AS qualified FROM telegram_referrals WHERE status IN ('qualified','rewarded') GROUP BY referrer_chat_id ORDER BY qualified DESC LIMIT 10) r)
  ) INTO v;
  RETURN v;
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_points_overview() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_points_overview() TO authenticated;

-- Same fix for dashboard KPIs
CREATE OR REPLACE FUNCTION public.tg_admin_dashboard_kpis()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; tz constant text := 'Africa/Accra';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH universe AS (
    SELECT chat_id, MIN(first_seen) AS first_seen, MAX(last_seen) AS last_seen, BOOL_OR(is_linked) AS is_linked
    FROM (
      SELECT chat_id, created_at AS first_seen, last_active_at AS last_seen, true AS is_linked FROM telegram_links
      UNION ALL SELECT chat_id, updated_at, updated_at, false FROM telegram_sessions
      UNION ALL SELECT telegram_chat_id, created_at, created_at, false FROM orders WHERE telegram_chat_id IS NOT NULL
      UNION ALL SELECT telegram_user_id, first_seen_at, last_seen_at, false FROM telegram_known_users
    ) s GROUP BY chat_id
  )
  SELECT jsonb_build_object(
    'users_total',    (SELECT count(*) FROM universe),
    'users_linked',   (SELECT count(*) FROM universe WHERE is_linked),
    'users_unlinked', (SELECT count(*) FROM universe WHERE NOT is_linked),
    'new_today',      (SELECT count(*) FROM universe WHERE first_seen >= date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz),
    'new_week',       (SELECT count(*) FROM universe WHERE first_seen >= now() - interval '7 days'),
    'new_month',      (SELECT count(*) FROM universe WHERE first_seen >= now() - interval '30 days'),
    'active_24h',     (SELECT count(*) FROM universe WHERE last_seen >= now() - interval '24 hours'),
    'active_7d',      (SELECT count(*) FROM universe WHERE last_seen >= now() - interval '7 days'),
    'active_30d',     (SELECT count(*) FROM universe WHERE last_seen >= now() - interval '30 days'),
    'orders_today_count', (SELECT count(*) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz),
    'orders_today_ghs',   (SELECT COALESCE(sum(amount_ghs),0) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz),
    'orders_week_count',  (SELECT count(*) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - interval '7 days'),
    'orders_week_ghs',    (SELECT COALESCE(sum(amount_ghs),0) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - interval '7 days'),
    'orders_month_count', (SELECT count(*) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - interval '30 days'),
    'orders_month_ghs',   (SELECT COALESCE(sum(amount_ghs),0) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - interval '30 days'),
    'orders_total_count', (SELECT count(*) FROM orders WHERE created_at >= now() - interval '30 days'),
    'pending_referrals',  (SELECT count(*) FROM telegram_referrals WHERE status = 'pending'),
    'points_outstanding', (SELECT COALESCE(sum(balance),0) FROM telegram_points_balances WHERE NOT COALESCE(banned_from_points,false)),
    'points_redeemed_month',    (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta < 0 AND reason IN ('redemption','redeem') AND created_at >= now() - interval '30 days'),
    'points_redeemed_lifetime', (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta < 0 AND reason IN ('redemption','redeem')),
    'pending_tickets', (SELECT count(*) FROM support_tickets_v2 WHERE status IN ('open','escalated') AND ticket_type = 'ai_support')
  ) INTO v;
  RETURN v;
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_dashboard_kpis() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_dashboard_kpis() TO authenticated;

-- =============================================================================
-- C2: Check-ins overview
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_checkins_overview(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; tz constant text := 'Africa/Accra';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'today',  (SELECT count(*) FROM telegram_checkins WHERE checkin_date = (now() AT TIME ZONE tz)::date),
    'week',   (SELECT count(*) FROM telegram_checkins WHERE checkin_date >= (now() AT TIME ZONE tz)::date - interval '7 days'),
    'month',  (SELECT count(*) FROM telegram_checkins WHERE checkin_date >= (now() AT TIME ZONE tz)::date - interval '30 days'),
    'lifetime', (SELECT count(*) FROM telegram_checkins),
    'unique_users_30d', (SELECT count(DISTINCT user_id) FROM telegram_checkins WHERE checkin_date >= (now() AT TIME ZONE tz)::date - interval '30 days'),
    'daily', (SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY checkin_date),'[]'::jsonb)
              FROM (SELECT checkin_date, count(*) AS total FROM telegram_checkins
                    WHERE checkin_date >= (now() AT TIME ZONE tz)::date - (p_days||' days')::interval
                    GROUP BY checkin_date) d),
    'top_streaks', (SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb)
                    FROM (SELECT c.user_id, max(c.streak_count) AS streak,
                                 tl.chat_id, tl.first_name, tl.username
                          FROM telegram_checkins c
                          LEFT JOIN telegram_links tl ON tl.user_id = c.user_id
                          GROUP BY c.user_id, tl.chat_id, tl.first_name, tl.username
                          ORDER BY streak DESC LIMIT 20) t),
    'recent', (SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC),'[]'::jsonb)
               FROM (SELECT c.user_id, c.checkin_date, c.streak_count, c.created_at,
                            tl.chat_id, tl.first_name, tl.username
                     FROM telegram_checkins c
                     LEFT JOIN telegram_links tl ON tl.user_id = c.user_id
                     ORDER BY c.created_at DESC LIMIT 100) r)
  ) INTO v;
  RETURN v;
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_checkins_overview(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_checkins_overview(integer) TO authenticated;

-- =============================================================================
-- D1: Referrals overview (totals, conversion, leaderboard, suspicious)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_referrals_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_total int; v_qualified int; v_pending int; v_invalid int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT count(*) FILTER (WHERE true),
         count(*) FILTER (WHERE status IN ('qualified','rewarded')),
         count(*) FILTER (WHERE status = 'pending'),
         count(*) FILTER (WHERE status = 'invalid')
  INTO v_total, v_qualified, v_pending, v_invalid FROM telegram_referrals;

  SELECT jsonb_build_object(
    'total', v_total,
    'qualified', v_qualified,
    'pending', v_pending,
    'invalid', v_invalid,
    'conversion_rate', CASE WHEN v_total > 0 THEN ROUND((v_qualified::numeric/v_total)*100, 1) ELSE 0 END,
    'points_granted', COALESCE((SELECT sum(delta) FROM telegram_points_ledger
                                WHERE delta > 0 AND reason IN ('referral_referrer','referral_referee')),0),
    'leaderboard', (SELECT COALESCE(jsonb_agg(row_to_json(l)),'[]'::jsonb) FROM (
      SELECT r.referrer_chat_id,
             tl.first_name, tl.username,
             count(*) AS total,
             count(*) FILTER (WHERE r.status IN ('qualified','rewarded')) AS qualified,
             COALESCE((SELECT sum(p.delta) FROM telegram_points_ledger p
                       JOIN telegram_links tl2 ON tl2.user_id = p.user_id
                       WHERE tl2.chat_id = r.referrer_chat_id
                         AND p.reason = 'referral_referrer'),0) AS points_earned
      FROM telegram_referrals r
      LEFT JOIN telegram_links tl ON tl.chat_id = r.referrer_chat_id
      GROUP BY r.referrer_chat_id, tl.first_name, tl.username
      ORDER BY qualified DESC, total DESC LIMIT 20) l),
    'suspicious_phones', (SELECT COALESCE(jsonb_agg(row_to_json(s)),'[]'::jsonb) FROM (
      SELECT o.recipient_number, count(DISTINCT o.telegram_chat_id) AS distinct_chats,
             count(*) AS orders
      FROM orders o
      WHERE o.telegram_chat_id IS NOT NULL
      GROUP BY o.recipient_number
      HAVING count(DISTINCT o.telegram_chat_id) >= 3
      ORDER BY distinct_chats DESC LIMIT 20) s),
    'high_velocity', (SELECT COALESCE(jsonb_agg(row_to_json(h)),'[]'::jsonb) FROM (
      SELECT referrer_chat_id, count(*) AS refs_24h
      FROM telegram_referrals
      WHERE created_at >= now() - interval '24 hours'
      GROUP BY referrer_chat_id HAVING count(*) >= 5
      ORDER BY refs_24h DESC LIMIT 20) h)
  ) INTO v;
  RETURN v;
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_referrals_overview() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_referrals_overview() TO authenticated;

-- =============================================================================
-- B3: Reset points & Delete user
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_reset_points(p_chat_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_target_uid uuid; v_old_balance int;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'reason_required_min_5_chars'; END IF;

  SELECT user_id INTO v_target_uid FROM telegram_links WHERE chat_id = p_chat_id;
  IF v_target_uid IS NULL THEN RAISE EXCEPTION 'user_not_linked'; END IF;

  SELECT balance INTO v_old_balance FROM telegram_points_balances WHERE user_id = v_target_uid;
  IF v_old_balance IS NULL OR v_old_balance = 0 THEN
    RETURN jsonb_build_object('ok', true, 'message', 'Balance already zero');
  END IF;

  -- Write a RESET ledger entry; preserve history
  INSERT INTO telegram_points_ledger (user_id, delta, reason, reference_id, balance_after)
  VALUES (v_target_uid, -v_old_balance, 'admin_reset', 'admin_reset:'||v_uid::text, 0);

  UPDATE telegram_points_balances SET balance = 0, updated_at = now() WHERE user_id = v_target_uid;

  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'tg_user.reset_points', 'telegram_links', p_chat_id::text,
          jsonb_build_object('reason', p_reason, 'old_balance', v_old_balance));

  RETURN jsonb_build_object('ok', true, 'old_balance', v_old_balance, 'new_balance', 0);
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_reset_points(bigint,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_reset_points(bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_delete_user(p_chat_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target_uid uuid;
  v_old_balance int := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'reason_required_min_5_chars'; END IF;

  SELECT user_id INTO v_target_uid FROM telegram_links WHERE chat_id = p_chat_id;
  IF v_target_uid IS NOT NULL THEN
    SELECT COALESCE(balance,0) INTO v_old_balance FROM telegram_points_balances WHERE user_id = v_target_uid;
    -- zero out & record reset
    IF v_old_balance <> 0 THEN
      INSERT INTO telegram_points_ledger (user_id, delta, reason, reference_id, balance_after)
      VALUES (v_target_uid, -v_old_balance, 'admin_reset', 'admin_delete:'||v_uid::text, 0);
    END IF;
    UPDATE telegram_points_balances SET balance = 0, updated_at = now() WHERE user_id = v_target_uid;
  END IF;

  -- Purge sessions and link
  DELETE FROM telegram_sessions WHERE chat_id = p_chat_id;
  DELETE FROM telegram_links WHERE chat_id = p_chat_id;
  -- Keep telegram_known_users to avoid re-referral abuse
  -- Cancel any open AI support tickets they own
  UPDATE support_tickets_v2 SET status = 'closed'
   WHERE telegram_chat_id = p_chat_id AND status IN ('open','escalated','pending');

  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'tg_user.delete', 'telegram_links', p_chat_id::text,
          jsonb_build_object('reason', p_reason, 'reset_balance', v_old_balance));

  RETURN jsonb_build_object('ok', true, 'reset_balance', v_old_balance);
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_delete_user(bigint,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_delete_user(bigint,text) TO authenticated;

-- =============================================================================
-- F1: Send Now broadcast — flips status from queued to running immediately
-- (the runner edge function then picks it up; we also explicitly set scheduled_for=null)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_admin_send_now_broadcast(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE tg_admin_broadcasts
     SET scheduled_for = NULL,
         status = CASE WHEN status IN ('queued','running') THEN status ELSE 'queued' END
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'broadcast_not_found'; END IF;
  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'broadcast.send_now', 'tg_admin_broadcasts', p_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END;$$;

REVOKE EXECUTE ON FUNCTION public.tg_admin_send_now_broadcast(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_admin_send_now_broadcast(uuid) TO authenticated;