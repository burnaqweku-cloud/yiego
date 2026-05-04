-- Fix admin RPCs to surface points/checkins/ledger for unlinked Telegram users.
-- Tables (telegram_points_balances, telegram_points_ledger, telegram_checkins) carry a
-- telegram_user_id (chat_id) column that is populated for guests who never linked a website
-- account. Previous RPCs only joined on user_id, hiding all unlinked balances.

-- 1) Points overview ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_admin_points_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Top earners now resolve identity via either linked user_id OR telegram_user_id (chat_id)
    'top_earners', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT
          b.user_id,
          b.balance,
          COALESCE(tl_link.chat_id, b.telegram_user_id, tl_chat.chat_id) AS chat_id,
          COALESCE(tl_link.first_name, tl_chat.first_name, ku.first_name) AS first_name,
          COALESCE(tl_link.username,   tl_chat.username)                  AS username
        FROM telegram_points_balances b
        LEFT JOIN telegram_links tl_link ON tl_link.user_id = b.user_id
        LEFT JOIN telegram_links tl_chat ON tl_chat.chat_id = b.telegram_user_id
        LEFT JOIN telegram_known_users ku ON ku.telegram_user_id = b.telegram_user_id
        WHERE NOT COALESCE(b.banned_from_points,false) AND b.balance > 0
        ORDER BY b.balance DESC LIMIT 10
      ) t),
    'top_referrers', (SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) FROM (SELECT referrer_chat_id, count(*) AS qualified FROM telegram_referrals WHERE status IN ('qualified','rewarded') GROUP BY referrer_chat_id ORDER BY qualified DESC LIMIT 10) r)
  ) INTO v;
  RETURN v;
END;$function$;

-- 2) Users list: include points stored against telegram_user_id for unlinked chats -----
CREATE OR REPLACE FUNCTION public.tg_admin_users_list(p_search text DEFAULT NULL::text, p_linked text DEFAULT NULL::text, p_active text DEFAULT NULL::text, p_page integer DEFAULT 1, p_size integer DEFAULT 50)
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
  universe AS (
    SELECT chat_id FROM telegram_links
    UNION SELECT chat_id FROM telegram_sessions
    UNION SELECT telegram_chat_id AS chat_id FROM orders WHERE telegram_chat_id IS NOT NULL
    UNION SELECT telegram_user_id AS chat_id FROM telegram_known_users
    UNION SELECT telegram_user_id AS chat_id FROM telegram_points_balances WHERE telegram_user_id IS NOT NULL
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
      -- Points: try linked user_id first, fall back to telegram_user_id (chat_id) for unlinked users
      COALESCE(
        (SELECT balance FROM telegram_points_balances pb WHERE pb.user_id = tl.user_id AND tl.user_id IS NOT NULL),
        (SELECT balance FROM telegram_points_balances pb WHERE pb.telegram_user_id = u.chat_id),
        0
      ) AS points,
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
END;$function$;

-- 3) User detail: lookup points + ledger by either user_id OR chat_id ----------
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
    UNION ALL SELECT 1 FROM telegram_points_balances WHERE telegram_user_id = p_chat_id
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
    -- Points: lookup by linked user_id OR by telegram_user_id (chat_id)
    'points', (SELECT to_jsonb(b) FROM telegram_points_balances b
                WHERE (v_user_id IS NOT NULL AND b.user_id = v_user_id)
                   OR b.telegram_user_id = p_chat_id
                ORDER BY b.balance DESC NULLS LAST LIMIT 1),
    'session', (SELECT to_jsonb(s) FROM telegram_sessions s WHERE s.chat_id = p_chat_id),
    'banned', (SELECT to_jsonb(b) FROM tg_admin_bans b WHERE b.chat_id = p_chat_id),
    'recent_orders', (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
                      FROM (SELECT order_id, network, bundle_size_gb, amount_ghs, status, payment_status, payment_method, created_at
                            FROM orders WHERE telegram_chat_id = p_chat_id ORDER BY created_at DESC LIMIT 20) o),
    'recent_deposits', (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
                        FROM (SELECT paystack_reference, total_payable, status, created_at
                              FROM telegram_payment_intents WHERE chat_id = p_chat_id AND purpose='deposit'
                              ORDER BY created_at DESC LIMIT 20) d),
    -- Recent ledger: union linked + chat_id-keyed entries
    'recent_ledger', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                      FROM (SELECT l.delta, l.reason, l.reference_id, l.balance_after, l.created_at
                            FROM telegram_points_ledger l
                            WHERE (v_user_id IS NOT NULL AND l.user_id = v_user_id)
                               OR l.telegram_user_id = p_chat_id
                            ORDER BY l.created_at DESC LIMIT 50) l),
    'referrals_sent', (SELECT count(*) FROM telegram_referrals WHERE referrer_chat_id = p_chat_id),
    'referrals_qualified', (SELECT count(*) FROM telegram_referrals WHERE referrer_chat_id = p_chat_id AND status IN ('qualified','rewarded')),
    'referred_by', (SELECT to_jsonb(r) FROM telegram_referrals r WHERE r.referee_chat_id = p_chat_id LIMIT 1),
    'stats', jsonb_build_object(
      'orders_count', COALESCE((SELECT count(*) FROM orders WHERE telegram_chat_id = p_chat_id),0),
      'orders_paid_total_ghs', COALESCE((SELECT sum(amount_ghs) FROM orders WHERE telegram_chat_id = p_chat_id AND payment_status='paid'),0),
      'deposits_total_ghs', COALESCE((SELECT sum(total_payable) FROM telegram_payment_intents WHERE chat_id = p_chat_id AND purpose='deposit' AND status='success'),0),
      'lifetime_points_earned', COALESCE((SELECT sum(delta) FROM telegram_points_ledger WHERE ((v_user_id IS NOT NULL AND user_id=v_user_id) OR telegram_user_id=p_chat_id) AND delta>0),0),
      'lifetime_points_redeemed', COALESCE((SELECT -sum(delta) FROM telegram_points_ledger WHERE ((v_user_id IS NOT NULL AND user_id=v_user_id) OR telegram_user_id=p_chat_id) AND delta<0 AND reason IN ('redemption','redeem')),0),
      'referrals_qualified_count', COALESCE((SELECT count(*) FROM telegram_referrals WHERE referrer_chat_id=p_chat_id AND status IN ('qualified','rewarded')),0)
    )
  ) INTO v;

  RETURN v;
END;$function$;

-- 4) Points ledger admin list: support chat-keyed entries ----------------------
CREATE OR REPLACE FUNCTION public.tg_admin_points_ledger(p_chat_id bigint DEFAULT NULL::bigint, p_reason text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_page integer DEFAULT 1, p_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_offset int := GREATEST((p_page-1)*p_size,0); v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int; v_user uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_chat_id IS NOT NULL THEN
    SELECT user_id INTO v_user FROM telegram_links WHERE chat_id = p_chat_id;
  END IF;
  WITH base AS (
    SELECT l.id, l.user_id, l.delta, l.reason, l.reference_id, l.balance_after, l.created_at,
           COALESCE(tl_link.chat_id, l.telegram_user_id, tl_chat.chat_id) AS chat_id,
           COALESCE(tl_link.first_name, tl_chat.first_name) AS first_name,
           COALESCE(tl_link.username,   tl_chat.username)   AS username
    FROM telegram_points_ledger l
    LEFT JOIN telegram_links tl_link ON tl_link.user_id = l.user_id
    LEFT JOIN telegram_links tl_chat ON tl_chat.chat_id = l.telegram_user_id
    WHERE (p_chat_id IS NULL
           OR (v_user IS NOT NULL AND l.user_id = v_user)
           OR l.telegram_user_id = p_chat_id)
      AND (p_reason IS NULL OR l.reason = p_reason)
      AND (p_from IS NULL OR l.created_at >= p_from)
      AND (p_to IS NULL OR l.created_at < p_to)
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$function$;

-- 5) Check-ins overview: resolve chat identity through both linked + chat_id ---
CREATE OR REPLACE FUNCTION public.tg_admin_checkins_overview(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; tz constant text := 'Africa/Accra';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'today',  (SELECT count(*) FROM telegram_checkins WHERE checkin_date = (now() AT TIME ZONE tz)::date),
    'week',   (SELECT count(*) FROM telegram_checkins WHERE checkin_date >= (now() AT TIME ZONE tz)::date - interval '7 days'),
    'month',  (SELECT count(*) FROM telegram_checkins WHERE checkin_date >= (now() AT TIME ZONE tz)::date - interval '30 days'),
    'lifetime', (SELECT count(*) FROM telegram_checkins),
    'unique_users_30d', (SELECT count(DISTINCT COALESCE(user_id::text, telegram_user_id::text)) FROM telegram_checkins WHERE checkin_date >= (now() AT TIME ZONE tz)::date - interval '30 days'),
    'daily', (SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY checkin_date),'[]'::jsonb)
              FROM (SELECT checkin_date, count(*) AS total FROM telegram_checkins
                    WHERE checkin_date >= (now() AT TIME ZONE tz)::date - (p_days||' days')::interval
                    GROUP BY checkin_date) d),
    'top_streaks', (SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb)
                    FROM (SELECT
                            COALESCE(c.user_id::text, c.telegram_user_id::text) AS user_id,
                            max(c.streak_count) AS streak,
                            COALESCE(tl_link.chat_id, c.telegram_user_id, tl_chat.chat_id) AS chat_id,
                            COALESCE(tl_link.first_name, tl_chat.first_name) AS first_name,
                            COALESCE(tl_link.username,   tl_chat.username)   AS username
                          FROM telegram_checkins c
                          LEFT JOIN telegram_links tl_link ON tl_link.user_id = c.user_id
                          LEFT JOIN telegram_links tl_chat ON tl_chat.chat_id = c.telegram_user_id
                          GROUP BY 1, 3, 4, 5
                          ORDER BY streak DESC LIMIT 20) t),
    'recent', (SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC),'[]'::jsonb)
               FROM (SELECT
                        COALESCE(c.user_id::text, c.telegram_user_id::text) AS user_id,
                        c.checkin_date, c.streak_count, c.created_at,
                        COALESCE(tl_link.chat_id, c.telegram_user_id, tl_chat.chat_id) AS chat_id,
                        COALESCE(tl_link.first_name, tl_chat.first_name) AS first_name,
                        COALESCE(tl_link.username,   tl_chat.username)   AS username
                     FROM telegram_checkins c
                     LEFT JOIN telegram_links tl_link ON tl_link.user_id = c.user_id
                     LEFT JOIN telegram_links tl_chat ON tl_chat.chat_id = c.telegram_user_id
                     ORDER BY c.created_at DESC LIMIT 100) r)
  ) INTO v;
  RETURN v;
END;$function$;