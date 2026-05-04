-- =========================================================================
-- Phases 2–8: Telegram Bot admin — backend
-- =========================================================================

-- ---------- Tables ----------

CREATE TABLE public.tg_admin_bans (
  chat_id bigint PRIMARY KEY,
  banned_by uuid NOT NULL,
  reason text,
  banned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tg_admin_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bans" ON public.tg_admin_bans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.tg_admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text NOT NULL,
  button_label text,
  button_url text,
  status text NOT NULL DEFAULT 'queued', -- queued|running|completed|cancelled|failed
  scheduled_for timestamptz,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  total_count int NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tg_admin_broadcasts_status ON public.tg_admin_broadcasts (status, scheduled_for);
ALTER TABLE public.tg_admin_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage broadcasts" ON public.tg_admin_broadcasts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.tg_admin_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.tg_admin_broadcasts(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|sent|failed|skipped
  error text,
  sent_at timestamptz,
  UNIQUE (broadcast_id, chat_id)
);
CREATE INDEX idx_tg_admin_broadcast_recipients_pending
  ON public.tg_admin_broadcast_recipients (broadcast_id, status);
ALTER TABLE public.tg_admin_broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read broadcast recipients" ON public.tg_admin_broadcast_recipients
  FOR SELECT USING (public.is_admin());

CREATE TABLE public.tg_admin_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  button_label text,
  button_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tg_admin_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage templates" ON public.tg_admin_message_templates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.tg_admin_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type text NOT NULL, -- bonus_points|discount|free_bundle
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  usage_limit int,
  used_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tg_admin_promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage promo codes" ON public.tg_admin_promo_codes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.tg_admin_promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id uuid NOT NULL REFERENCES public.tg_admin_promo_codes(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tg_admin_promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read promo redemptions" ON public.tg_admin_promo_redemptions
  FOR SELECT USING (public.is_admin());

-- ---------- Bot-side settings reader (SECURITY DEFINER, accessible to anon for bot) ----------

CREATE OR REPLACE FUNCTION public.get_tg_setting(p_key text, p_fallback jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value FROM public.tg_admin_settings WHERE key = p_key), p_fallback);
$$;
GRANT EXECUTE ON FUNCTION public.get_tg_setting(text, jsonb) TO anon, authenticated, service_role;

-- ---------- Dashboard ----------

CREATE OR REPLACE FUNCTION public.tg_admin_dashboard_kpis()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  tz constant text := 'Africa/Accra';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'users_total', (SELECT count(*) FROM telegram_links),
    'users_linked', (SELECT count(*) FROM telegram_links WHERE user_id IS NOT NULL),
    'users_unlinked', (SELECT count(*) FROM telegram_links WHERE user_id IS NULL),
    'new_today', (SELECT count(*) FROM telegram_links WHERE created_at >= date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz),
    'new_week', (SELECT count(*) FROM telegram_links WHERE created_at >= now() - interval '7 days'),
    'new_month', (SELECT count(*) FROM telegram_links WHERE created_at >= now() - interval '30 days'),
    'active_24h', (SELECT count(*) FROM telegram_links WHERE last_active_at >= now() - interval '24 hours'),
    'active_7d', (SELECT count(*) FROM telegram_links WHERE last_active_at >= now() - interval '7 days'),
    'active_30d', (SELECT count(*) FROM telegram_links WHERE last_active_at >= now() - interval '30 days'),
    'orders_today_count', (SELECT count(*) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz),
    'orders_today_ghs', (SELECT COALESCE(sum(amount_ghs),0) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz),
    'orders_week_count', (SELECT count(*) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - interval '7 days'),
    'orders_week_ghs', (SELECT COALESCE(sum(amount_ghs),0) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - interval '7 days'),
    'orders_month_count', (SELECT count(*) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - interval '30 days'),
    'orders_month_ghs', (SELECT COALESCE(sum(amount_ghs),0) FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - interval '30 days'),
    'orders_total_count', (SELECT count(*) FROM orders WHERE created_at >= now() - interval '30 days'),
    'pending_referrals', (SELECT count(*) FROM telegram_referrals WHERE status = 'pending'),
    'points_outstanding', (SELECT COALESCE(sum(balance),0) FROM telegram_points_balances WHERE NOT COALESCE(banned_from_points,false)),
    'points_redeemed_month', (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta < 0 AND reason = 'redeem' AND created_at >= now() - interval '30 days'),
    'points_redeemed_lifetime', (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta < 0 AND reason = 'redeem'),
    'pending_tickets', (SELECT count(*) FROM support_tickets_v2 WHERE status IN ('open','escalated') AND ticket_type = 'ai_support')
  ) INTO v;

  RETURN v;
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_dashboard_kpis() TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_recent_activity(p_limit int DEFAULT 20)
RETURNS TABLE(kind text, occurred_at timestamptz, chat_id bigint, summary text, ref_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  (
    SELECT 'order'::text, o.created_at, o.telegram_chat_id, format('%s %sGB → %s · GHS %s', o.network, o.bundle_size_gb, o.recipient_number, o.amount_ghs), o.order_id
    FROM orders o WHERE o.telegram_chat_id IS NOT NULL ORDER BY created_at DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'deposit', tpi.created_at, tpi.chat_id, format('Deposit GHS %s · %s', tpi.total_payable, tpi.status), tpi.paystack_reference
    FROM telegram_payment_intents tpi WHERE tpi.purpose = 'deposit' ORDER BY created_at DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'signup', tl.created_at, tl.chat_id, COALESCE(NULLIF(tl.first_name,''), tl.username, 'New user'), tl.chat_id::text
    FROM telegram_links tl ORDER BY created_at DESC LIMIT p_limit
  )
  ORDER BY occurred_at DESC LIMIT p_limit;
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_recent_activity(int) TO authenticated;

-- ---------- Users ----------

CREATE OR REPLACE FUNCTION public.tg_admin_users_list(
  p_search text DEFAULT NULL,
  p_linked text DEFAULT NULL,   -- 'linked'|'unlinked'|null
  p_active text DEFAULT NULL,   -- 'active7'|'inactive30'|null
  p_page int DEFAULT 1,
  p_size int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offset int := GREATEST((p_page-1)*p_size, 0);
  v_size int := LEAST(GREATEST(p_size, 1), 200);
  v_rows jsonb;
  v_total int;
  v_search text := NULLIF(trim(COALESCE(p_search,'')),'');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH base AS (
    SELECT tl.chat_id, tl.username, tl.first_name, tl.user_id, tl.phone, tl.created_at, tl.last_active_at,
           (SELECT count(*) FROM orders o WHERE o.telegram_chat_id = tl.chat_id) AS order_count,
           (SELECT COALESCE(sum(amount_ghs),0) FROM orders o WHERE o.telegram_chat_id = tl.chat_id AND o.payment_status = 'paid') AS spent_ghs,
           COALESCE((SELECT balance FROM telegram_points_balances pb WHERE pb.user_id = tl.user_id), 0) AS points,
           COALESCE((SELECT count(*) FROM telegram_referrals r WHERE r.referrer_chat_id = tl.chat_id), 0) AS refs_sent,
           COALESCE((SELECT count(*) FROM telegram_referrals r WHERE r.referrer_chat_id = tl.chat_id AND r.status='qualified'), 0) AS refs_qualified
    FROM telegram_links tl
    WHERE
      (v_search IS NULL
        OR tl.username ILIKE '%'||v_search||'%'
        OR tl.first_name ILIKE '%'||v_search||'%'
        OR tl.phone ILIKE '%'||v_search||'%'
        OR tl.chat_id::text = v_search)
      AND (p_linked IS NULL
        OR (p_linked='linked' AND tl.user_id IS NOT NULL)
        OR (p_linked='unlinked' AND tl.user_id IS NULL))
      AND (p_active IS NULL
        OR (p_active='active7' AND tl.last_active_at >= now() - interval '7 days')
        OR (p_active='inactive30' AND (tl.last_active_at IS NULL OR tl.last_active_at < now() - interval '30 days')))
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;

  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_users_list(text,text,text,int,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_user_detail(p_chat_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'link', (SELECT row_to_json(tl) FROM telegram_links tl WHERE tl.chat_id = p_chat_id),
    'profile', (SELECT row_to_json(p) FROM profiles p
                JOIN telegram_links tl ON tl.user_id = p.user_id WHERE tl.chat_id = p_chat_id),
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
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_user_detail(bigint) TO authenticated;

-- ---------- Orders / Deposits / Redemptions ----------

CREATE OR REPLACE FUNCTION public.tg_admin_orders_list(
  p_status text DEFAULT NULL,
  p_network text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_page int DEFAULT 1,
  p_size int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset int := GREATEST((p_page-1)*p_size,0); v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int; v_search text := NULLIF(trim(COALESCE(p_search,'')),'');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT o.order_id, o.telegram_chat_id, o.customer_name, o.network, o.bundle_size_gb,
           o.recipient_number, o.amount_ghs, o.payment_method, o.status, o.payment_status,
           o.created_at, o.updated_at
    FROM orders o
    WHERE o.telegram_chat_id IS NOT NULL
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_network IS NULL OR o.network = p_network)
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to IS NULL OR o.created_at < p_to)
      AND (v_search IS NULL OR o.order_id ILIKE '%'||v_search||'%' OR o.recipient_number ILIKE '%'||v_search||'%' OR COALESCE(o.customer_name,'') ILIKE '%'||v_search||'%')
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_orders_list(text,text,text,timestamptz,timestamptz,int,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_deposits_list(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_page int DEFAULT 1,
  p_size int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset int := GREATEST((p_page-1)*p_size,0); v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int; v_search text := NULLIF(trim(COALESCE(p_search,'')),'');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT tpi.id, tpi.paystack_reference, tpi.chat_id, tpi.total_payable, tpi.base_amount,
           tpi.status, tpi.created_at, tpi.notified_at
    FROM telegram_payment_intents tpi
    WHERE tpi.purpose = 'deposit'
      AND (p_status IS NULL OR tpi.status = p_status)
      AND (p_from IS NULL OR tpi.created_at >= p_from)
      AND (p_to IS NULL OR tpi.created_at < p_to)
      AND (v_search IS NULL OR tpi.paystack_reference ILIKE '%'||v_search||'%' OR tpi.chat_id::text = v_search)
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_deposits_list(text,text,timestamptz,timestamptz,int,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_redemptions_list(
  p_status text DEFAULT NULL,
  p_network text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_page int DEFAULT 1,
  p_size int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset int := GREATEST((p_page-1)*p_size,0); v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT o.order_id, o.telegram_chat_id, o.network, o.bundle_size_gb, o.recipient_number,
           o.status, o.payment_status, o.created_at
    FROM orders o
    WHERE o.payment_method = 'points'
      AND o.telegram_chat_id IS NOT NULL
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_network IS NULL OR o.network = p_network)
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to IS NULL OR o.created_at < p_to)
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_redemptions_list(text,text,timestamptz,timestamptz,int,int) TO authenticated;

-- ---------- Points ----------

CREATE OR REPLACE FUNCTION public.tg_admin_points_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'outstanding', (SELECT COALESCE(sum(balance),0) FROM telegram_points_balances WHERE NOT COALESCE(banned_from_points,false)),
    'granted_week', (SELECT COALESCE(sum(delta),0) FROM telegram_points_ledger WHERE delta>0 AND created_at >= now() - interval '7 days'),
    'redeemed_week', (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta<0 AND reason='redeem' AND created_at >= now() - interval '7 days'),
    'expired_week', (SELECT COALESCE(-sum(delta),0) FROM telegram_points_ledger WHERE delta<0 AND reason='expired' AND created_at >= now() - interval '7 days'),
    'breakdown_30d', (SELECT jsonb_object_agg(reason, total) FROM (SELECT reason, sum(delta) AS total FROM telegram_points_ledger WHERE delta>0 AND created_at >= now() - interval '30 days' GROUP BY reason) g),
    'top_earners', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (SELECT b.user_id, b.balance, tl.chat_id, tl.first_name, tl.username FROM telegram_points_balances b LEFT JOIN telegram_links tl ON tl.user_id = b.user_id ORDER BY balance DESC LIMIT 10) t),
    'top_referrers', (SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) FROM (SELECT referrer_chat_id, count(*) AS qualified FROM telegram_referrals WHERE status='qualified' GROUP BY referrer_chat_id ORDER BY qualified DESC LIMIT 10) r)
  ) INTO v;
  RETURN v;
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_points_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_points_ledger(
  p_chat_id bigint DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_page int DEFAULT 1,
  p_size int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset int := GREATEST((p_page-1)*p_size,0); v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int; v_user uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_chat_id IS NOT NULL THEN
    SELECT user_id INTO v_user FROM telegram_links WHERE chat_id = p_chat_id;
  END IF;
  WITH base AS (
    SELECT l.id, l.user_id, l.delta, l.reason, l.reference_id, l.balance_after, l.created_at,
           tl.chat_id, tl.first_name, tl.username
    FROM telegram_points_ledger l
    LEFT JOIN telegram_links tl ON tl.user_id = l.user_id
    WHERE (v_user IS NULL OR l.user_id = v_user)
      AND (p_reason IS NULL OR l.reason = p_reason)
      AND (p_from IS NULL OR l.created_at >= p_from)
      AND (p_to IS NULL OR l.created_at < p_to)
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_points_ledger(bigint,text,timestamptz,timestamptz,int,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_set_kill_switch(p_enabled boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE telegram_points_config SET points_system_enabled = p_enabled, updated_at = now(), updated_by = v_uid WHERE id = true;
  IF NOT FOUND THEN
    INSERT INTO telegram_points_config (id, points_system_enabled, updated_at, updated_by) VALUES (true, p_enabled, now(), v_uid);
  END IF;
  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'points.kill_switch', 'telegram_points_config', 'singleton', jsonb_build_object('enabled', p_enabled, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'enabled', p_enabled);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_set_kill_switch(boolean,text) TO authenticated;

-- ---------- Referrals ----------

CREATE OR REPLACE FUNCTION public.tg_admin_referrals_list(
  p_status text DEFAULT NULL, p_page int DEFAULT 1, p_size int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset int := GREATEST((p_page-1)*p_size,0); v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT r.id, r.referrer_chat_id, r.referee_chat_id, r.status, r.qualifying_order_id,
           r.created_at, r.qualified_at, r.rewarded_at,
           rl.first_name AS referrer_name, el.first_name AS referee_name
    FROM telegram_referrals r
    LEFT JOIN telegram_links rl ON rl.chat_id = r.referrer_chat_id
    LEFT JOIN telegram_links el ON el.chat_id = r.referee_chat_id
    WHERE (p_status IS NULL OR r.status = p_status)
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_referrals_list(text,int,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_invalidate_referral(p_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row record;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_row FROM telegram_referrals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE telegram_referrals SET status = 'invalid' WHERE id = p_id;
  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'referral.invalidate', 'telegram_referrals', p_id::text, jsonb_build_object('reason', p_reason, 'previous_status', v_row.status));
  RETURN jsonb_build_object('ok', true);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_invalidate_referral(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_force_qualify_referral(p_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE telegram_referrals SET status = 'qualified', qualified_at = COALESCE(qualified_at, now()) WHERE id = p_id;
  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'referral.force_qualify', 'telegram_referrals', p_id::text, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_force_qualify_referral(uuid,text) TO authenticated;

-- ---------- Check-ins ----------

CREATE OR REPLACE FUNCTION public.tg_admin_checkins_summary(p_days int DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'daily', (SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
              FROM (SELECT checkin_date, count(*) AS total FROM telegram_checkins
                    WHERE checkin_date >= (now() AT TIME ZONE 'Africa/Accra')::date - (p_days||' days')::interval
                    GROUP BY checkin_date ORDER BY checkin_date) d),
    'top_streaks', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
              FROM (SELECT user_id, max(streak_count) AS streak FROM telegram_checkins
                    GROUP BY user_id ORDER BY streak DESC LIMIT 10) t)
  ) INTO v;
  RETURN v;
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_checkins_summary(int) TO authenticated;

-- ---------- Support tickets (bot-channel) ----------

CREATE OR REPLACE FUNCTION public.tg_admin_support_tickets_list(
  p_status text DEFAULT NULL, p_page int DEFAULT 1, p_size int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset int := GREATEST((p_page-1)*p_size,0); v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT id, subject, category, status, customer_phone, related_order_id, created_at, updated_at
    FROM support_tickets_v2
    WHERE ticket_type = 'ai_support'
      AND (p_status IS NULL OR status = p_status)
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_support_tickets_list(text,int,int) TO authenticated;

-- ---------- Moderation actions ----------

CREATE OR REPLACE FUNCTION public.tg_admin_force_unlink(p_chat_id bigint, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_prev jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT to_jsonb(tl) INTO v_prev FROM telegram_links tl WHERE chat_id = p_chat_id;
  UPDATE telegram_links SET user_id = NULL, phone = NULL, linked_at = NULL WHERE chat_id = p_chat_id;
  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'user.force_unlink', 'telegram_links', p_chat_id::text, jsonb_build_object('reason', p_reason, 'previous', v_prev));
  RETURN jsonb_build_object('ok', true);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_force_unlink(bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_reset_session(p_chat_id bigint, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM telegram_sessions WHERE chat_id = p_chat_id;
  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'user.reset_session', 'telegram_sessions', p_chat_id::text, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_reset_session(bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_set_full_ban(p_chat_id bigint, p_banned boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_banned THEN
    INSERT INTO tg_admin_bans (chat_id, banned_by, reason) VALUES (p_chat_id, v_uid, p_reason)
      ON CONFLICT (chat_id) DO UPDATE SET banned_by=v_uid, reason=p_reason, banned_at=now();
  ELSE
    DELETE FROM tg_admin_bans WHERE chat_id = p_chat_id;
  END IF;
  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, CASE WHEN p_banned THEN 'user.ban' ELSE 'user.unban' END, 'tg_admin_bans', p_chat_id::text, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'banned', p_banned);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_set_full_ban(bigint,boolean,text) TO authenticated;

-- ---------- Broadcasts ----------

CREATE OR REPLACE FUNCTION public.tg_admin_create_broadcast(
  p_segment jsonb,
  p_message text,
  p_button_label text DEFAULT NULL,
  p_button_url text DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_broadcast_id uuid;
  v_inserted int := 0;
  v_seg_kind text := COALESCE(p_segment->>'kind', 'all');
  v_chat_id bigint;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN RAISE EXCEPTION 'message_required'; END IF;
  IF length(p_message) > 4096 THEN RAISE EXCEPTION 'message_too_long'; END IF;

  INSERT INTO tg_admin_broadcasts (segment, message, button_label, button_url, scheduled_for, created_by)
  VALUES (p_segment, p_message, NULLIF(p_button_label,''), NULLIF(p_button_url,''), p_scheduled_for, v_uid)
  RETURNING id INTO v_broadcast_id;

  IF v_seg_kind = 'single' THEN
    v_chat_id := (p_segment->>'chat_id')::bigint;
    INSERT INTO tg_admin_broadcast_recipients (broadcast_id, chat_id) VALUES (v_broadcast_id, v_chat_id);
    v_inserted := 1;
  ELSIF v_seg_kind = 'linked' THEN
    INSERT INTO tg_admin_broadcast_recipients (broadcast_id, chat_id)
    SELECT v_broadcast_id, chat_id FROM telegram_links WHERE user_id IS NOT NULL;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  ELSIF v_seg_kind = 'active7' THEN
    INSERT INTO tg_admin_broadcast_recipients (broadcast_id, chat_id)
    SELECT v_broadcast_id, chat_id FROM telegram_links WHERE last_active_at >= now() - interval '7 days';
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  ELSE
    INSERT INTO tg_admin_broadcast_recipients (broadcast_id, chat_id)
    SELECT v_broadcast_id, chat_id FROM telegram_links;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  UPDATE tg_admin_broadcasts SET total_count = v_inserted WHERE id = v_broadcast_id;

  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'broadcast.create', 'tg_admin_broadcasts', v_broadcast_id::text,
          jsonb_build_object('segment', p_segment, 'recipients', v_inserted, 'scheduled_for', p_scheduled_for));

  RETURN jsonb_build_object('ok', true, 'id', v_broadcast_id, 'recipients', v_inserted);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_create_broadcast(jsonb,text,text,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_cancel_broadcast(p_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE tg_admin_broadcasts SET status='cancelled', completed_at=now() WHERE id=p_id AND status IN ('queued','running');
  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'broadcast.cancel', 'tg_admin_broadcasts', p_id::text, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_cancel_broadcast(uuid,text) TO authenticated;

-- Used by edge runner with service role; admin-only RLS still applies via SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.tg_admin_claim_broadcast()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM tg_admin_broadcasts
   WHERE status='queued' AND (scheduled_for IS NULL OR scheduled_for <= now())
   ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  UPDATE tg_admin_broadcasts SET status='running', started_at=COALESCE(started_at, now()) WHERE id=v_id;
  RETURN v_id;
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_claim_broadcast() TO service_role;

-- ---------- Audit log list ----------

CREATE OR REPLACE FUNCTION public.tg_admin_audit_list(
  p_action text DEFAULT NULL, p_target_type text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_page int DEFAULT 1, p_size int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset int := GREATEST((p_page-1)*p_size,0); v_size int := LEAST(GREATEST(p_size,1), 200);
  v_rows jsonb; v_total int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (
    SELECT a.id, a.admin_user_id, a.action, a.target_type, a.target_id, a.details, a.ip_address, a.created_at,
           p.full_name AS admin_name
    FROM tg_admin_audit_log a
    LEFT JOIN profiles p ON p.user_id = a.admin_user_id
    WHERE (p_action IS NULL OR a.action = p_action)
      AND (p_target_type IS NULL OR a.target_type = p_target_type)
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at < p_to)
  )
  SELECT jsonb_agg(row_to_json(b)), (SELECT count(*) FROM base)
  INTO v_rows, v_total
  FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_offset LIMIT v_size) b;
  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total', COALESCE(v_total,0), 'page', p_page, 'size', v_size);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_audit_list(text,text,timestamptz,timestamptz,int,int) TO authenticated;

-- ---------- Reports ----------

CREATE OR REPLACE FUNCTION public.tg_admin_report_daily_revenue(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_agg(row_to_json(r)) INTO v FROM (
    SELECT (created_at AT TIME ZONE 'Africa/Accra')::date AS day,
           count(*) AS orders,
           sum(amount_ghs) AS revenue
    FROM orders
    WHERE telegram_chat_id IS NOT NULL
      AND payment_status='paid'
      AND created_at >= now() - (p_days||' days')::interval
    GROUP BY 1 ORDER BY 1
  ) r;
  RETURN COALESCE(v, '[]'::jsonb);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_report_daily_revenue(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_report_network_split(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_agg(row_to_json(r)) INTO v FROM (
    SELECT network, count(*) AS orders, sum(amount_ghs) AS revenue
    FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - (p_days||' days')::interval
    GROUP BY network
  ) r;
  RETURN COALESCE(v, '[]'::jsonb);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_report_network_split(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_report_payment_mix(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_agg(row_to_json(r)) INTO v FROM (
    SELECT COALESCE(payment_method,'unknown') AS method, count(*) AS orders
    FROM orders WHERE telegram_chat_id IS NOT NULL AND created_at >= now() - (p_days||' days')::interval
    GROUP BY 1
  ) r;
  RETURN COALESCE(v, '[]'::jsonb);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_report_payment_mix(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_admin_report_top_customers(p_days int DEFAULT 30, p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_agg(row_to_json(r)) INTO v FROM (
    SELECT o.telegram_chat_id, tl.first_name, tl.username,
           count(*) AS orders, sum(o.amount_ghs) AS spent
    FROM orders o
    LEFT JOIN telegram_links tl ON tl.chat_id = o.telegram_chat_id
    WHERE o.telegram_chat_id IS NOT NULL
      AND o.payment_status='paid'
      AND o.created_at >= now() - (p_days||' days')::interval
    GROUP BY o.telegram_chat_id, tl.first_name, tl.username
    ORDER BY spent DESC NULLS LAST LIMIT p_limit
  ) r;
  RETURN COALESCE(v, '[]'::jsonb);
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_report_top_customers(int,int) TO authenticated;