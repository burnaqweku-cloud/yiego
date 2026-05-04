-- Unify "bot users" across telegram_links + telegram_sessions + orders.telegram_chat_id.
-- No schema changes; only redefining 3 admin read RPCs.

CREATE OR REPLACE FUNCTION public.tg_admin_users_list(
  p_search text DEFAULT NULL,
  p_linked text DEFAULT NULL,
  p_active text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset int := GREATEST((p_page-1)*p_size, 0);
  v_size int := LEAST(GREATEST(p_size, 1), 200);
  v_rows jsonb;
  v_total int;
  v_search text := NULLIF(trim(COALESCE(p_search,'')),'');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH
  -- Universe of every chat_id that has ever touched the bot
  universe AS (
    SELECT chat_id FROM telegram_links
    UNION
    SELECT chat_id FROM telegram_sessions
    UNION
    SELECT telegram_chat_id AS chat_id FROM orders WHERE telegram_chat_id IS NOT NULL
  ),
  -- Per-chat order aggregates
  ord_agg AS (
    SELECT telegram_chat_id AS chat_id,
           count(*) AS order_count,
           COALESCE(sum(amount_ghs) FILTER (WHERE payment_status='paid'),0) AS spent_ghs,
           min(created_at) AS first_order_at,
           max(created_at) AS last_order_at
    FROM orders
    WHERE telegram_chat_id IS NOT NULL
    GROUP BY telegram_chat_id
  ),
  -- Latest guest identity from sessions.data (best-effort; may be empty for old rows)
  sess_meta AS (
    SELECT chat_id, updated_at,
           NULLIF(data->>'username','')   AS s_username,
           NULLIF(data->>'first_name','') AS s_first_name
    FROM telegram_sessions
  ),
  base AS (
    SELECT
      u.chat_id,
      COALESCE(tl.username, sm.s_username)       AS username,
      COALESCE(tl.first_name, sm.s_first_name)   AS first_name,
      tl.user_id,
      tl.phone,
      LEAST(
        COALESCE(tl.created_at, 'infinity'::timestamptz),
        COALESCE(sm.updated_at, 'infinity'::timestamptz),
        COALESCE(oa.first_order_at, 'infinity'::timestamptz)
      ) AS created_at,
      GREATEST(
        COALESCE(tl.last_active_at, '-infinity'::timestamptz),
        COALESCE(sm.updated_at, '-infinity'::timestamptz),
        COALESCE(oa.last_order_at, '-infinity'::timestamptz)
      ) AS last_active_at,
      COALESCE(oa.order_count, 0) AS order_count,
      COALESCE(oa.spent_ghs, 0) AS spent_ghs,
      COALESCE((SELECT balance FROM telegram_points_balances pb WHERE pb.user_id = tl.user_id), 0) AS points,
      COALESCE((SELECT count(*) FROM telegram_referrals r WHERE r.referrer_chat_id = u.chat_id), 0) AS refs_sent,
      COALESCE((SELECT count(*) FROM telegram_referrals r WHERE r.referrer_chat_id = u.chat_id AND r.status='qualified'), 0) AS refs_qualified
    FROM universe u
    LEFT JOIN telegram_links tl ON tl.chat_id = u.chat_id
    LEFT JOIN ord_agg oa        ON oa.chat_id = u.chat_id
    LEFT JOIN sess_meta sm      ON sm.chat_id = u.chat_id
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
        OR (p_active='active7'   AND last_active_at >= now() - interval '7 days')
        OR (p_active='inactive30' AND (last_active_at = '-infinity'::timestamptz OR last_active_at < now() - interval '30 days')))
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM filtered)
  INTO v_rows, v_total
  FROM (
    SELECT
      chat_id, username, first_name, user_id, phone,
      NULLIF(created_at, 'infinity'::timestamptz)        AS created_at,
      NULLIF(last_active_at, '-infinity'::timestamptz)   AS last_active_at,
      order_count, spent_ghs, points, refs_sent, refs_qualified
    FROM filtered
    ORDER BY last_active_at DESC NULLS LAST, created_at DESC NULLS LAST
    OFFSET v_offset LIMIT v_size
  ) b;

  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$function$;


-- Detail RPC: also resolve from the unified universe so guest chat_ids work.
CREATE OR REPLACE FUNCTION public.tg_admin_user_detail(p_chat_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_exists boolean;
  v_session_username text;
  v_session_first_name text;
  v_session_updated timestamptz;
  v_first_order timestamptz;
  v_last_order timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Make sure the chat_id is known anywhere (links / sessions / orders)
  SELECT EXISTS (
    SELECT 1 FROM telegram_links WHERE chat_id = p_chat_id
    UNION ALL SELECT 1 FROM telegram_sessions WHERE chat_id = p_chat_id
    UNION ALL SELECT 1 FROM orders WHERE telegram_chat_id = p_chat_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object('link', NULL, 'profile', NULL, 'points', NULL, 'session', NULL,
      'banned', NULL, 'recent_orders', '[]'::jsonb, 'recent_deposits', '[]'::jsonb,
      'recent_ledger', '[]'::jsonb, 'referrals_sent', 0, 'referred_by', NULL);
  END IF;

  -- Pull guest identity hints from session + earliest/latest order timestamps
  SELECT NULLIF(data->>'username',''), NULLIF(data->>'first_name',''), updated_at
    INTO v_session_username, v_session_first_name, v_session_updated
  FROM telegram_sessions WHERE chat_id = p_chat_id;

  SELECT min(created_at), max(created_at) INTO v_first_order, v_last_order
  FROM orders WHERE telegram_chat_id = p_chat_id;

  SELECT jsonb_build_object(
    -- Synthetic 'link' row: real link if present, otherwise a guest stub so the UI renders cleanly
    'link', COALESCE(
      (SELECT row_to_json(tl) FROM telegram_links tl WHERE tl.chat_id = p_chat_id),
      jsonb_build_object(
        'chat_id', p_chat_id,
        'username', v_session_username,
        'first_name', v_session_first_name,
        'user_id', NULL,
        'phone', NULL,
        'created_at', LEAST(COALESCE(v_session_updated,'infinity'::timestamptz), COALESCE(v_first_order,'infinity'::timestamptz)),
        'last_active_at', GREATEST(COALESCE(v_session_updated,'-infinity'::timestamptz), COALESCE(v_last_order,'-infinity'::timestamptz)),
        'linked_at', NULL
      )
    ),
    'profile', (SELECT row_to_json(p) FROM profiles p
                JOIN telegram_links tl ON tl.user_id = p.id WHERE tl.chat_id = p_chat_id),
    'points', (SELECT row_to_json(b) FROM telegram_points_balances b
                JOIN telegram_links tl ON tl.user_id = b.user_id WHERE tl.chat_id = p_chat_id),
    'session', (SELECT row_to_json(s) FROM telegram_sessions s WHERE s.chat_id = p_chat_id),
    'banned', (SELECT row_to_json(b) FROM tg_admin_bans b WHERE b.chat_id = p_chat_id),
    'recent_orders', (SELECT COALESCE(jsonb_agg(row_to_json(o)), '[]'::jsonb)
                      FROM (SELECT order_id, network, bundle_size_gb, amount_ghs, status, payment_status, created_at
                            FROM orders WHERE telegram_chat_id = p_chat_id ORDER BY created_at DESC LIMIT 20) o),
    'recent_deposits', (SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
                        FROM (SELECT paystack_reference, total_payable, status, created_at
                              FROM telegram_payment_intents WHERE chat_id = p_chat_id AND purpose='deposit'
                              ORDER BY created_at DESC LIMIT 20) d),
    'recent_ledger', (SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb)
                      FROM (SELECT l.delta, l.reason, l.reference_id, l.balance_after, l.created_at
                            FROM telegram_points_ledger l
                            JOIN telegram_links tl ON tl.user_id = l.user_id
                            WHERE tl.chat_id = p_chat_id
                            ORDER BY l.created_at DESC LIMIT 50) l),
    'referrals_sent', (SELECT count(*) FROM telegram_referrals WHERE referrer_chat_id = p_chat_id),
    'referred_by', (SELECT row_to_json(r) FROM telegram_referrals r WHERE r.referee_chat_id = p_chat_id LIMIT 1)
  ) INTO v;
  RETURN v;
END;$function$;


-- Dashboard KPIs: count over the unified universe.
CREATE OR REPLACE FUNCTION public.tg_admin_dashboard_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  tz constant text := 'Africa/Accra';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH universe AS (
    SELECT chat_id, MIN(first_seen) AS first_seen, MAX(last_seen) AS last_seen, BOOL_OR(is_linked) AS is_linked
    FROM (
      SELECT chat_id, created_at AS first_seen, last_active_at AS last_seen, true AS is_linked FROM telegram_links
      UNION ALL
      SELECT chat_id, updated_at, updated_at, false FROM telegram_sessions
      UNION ALL
      SELECT telegram_chat_id, created_at, created_at, false FROM orders WHERE telegram_chat_id IS NOT NULL
    ) s
    GROUP BY chat_id
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
    'points_redeemed_month',    (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta < 0 AND reason = 'redeem' AND created_at >= now() - interval '30 days'),
    'points_redeemed_lifetime', (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta < 0 AND reason = 'redeem'),
    'pending_tickets', (SELECT count(*) FROM support_tickets_v2 WHERE status IN ('open','escalated') AND ticket_type = 'ai_support')
  ) INTO v;

  RETURN v;
END;$function$;