
-- Fix 1: recent activity UNION ordering — use ordinal column for outer ORDER BY
CREATE OR REPLACE FUNCTION public.tg_admin_recent_activity(p_limit int DEFAULT 20)
RETURNS TABLE(kind text, occurred_at timestamptz, chat_id bigint, summary text, ref_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT * FROM (
    (
      SELECT 'order'::text AS kind, o.created_at AS occurred_at, o.telegram_chat_id AS chat_id,
             format('%s %sGB → %s · GHS %s', o.network, o.bundle_size_gb, o.recipient_number, o.amount_ghs) AS summary,
             o.order_id AS ref_id
      FROM orders o WHERE o.telegram_chat_id IS NOT NULL ORDER BY o.created_at DESC LIMIT p_limit
    )
    UNION ALL
    (
      SELECT 'deposit'::text, tpi.created_at, tpi.chat_id,
             format('Deposit GHS %s · %s', tpi.total_payable, tpi.status), tpi.paystack_reference
      FROM telegram_payment_intents tpi WHERE tpi.purpose = 'deposit' ORDER BY tpi.created_at DESC LIMIT p_limit
    )
    UNION ALL
    (
      SELECT 'signup'::text, tl.created_at, tl.chat_id,
             COALESCE(NULLIF(tl.first_name,''), tl.username, 'New user'), tl.chat_id::text
      FROM telegram_links tl ORDER BY tl.created_at DESC LIMIT p_limit
    )
  ) u
  ORDER BY 2 DESC
  LIMIT p_limit;
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_recent_activity(int) TO authenticated;

-- Fix 2a: user detail — profiles PK is `id`, not `user_id`
CREATE OR REPLACE FUNCTION public.tg_admin_user_detail(p_chat_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'link', (SELECT row_to_json(tl) FROM telegram_links tl WHERE tl.chat_id = p_chat_id),
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
END;$$;
GRANT EXECUTE ON FUNCTION public.tg_admin_user_detail(bigint) TO authenticated;

-- Fix 2b: audit list — same profiles column fix
CREATE OR REPLACE FUNCTION public.tg_admin_audit_list(
  p_action text DEFAULT NULL, p_target_type text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_page int DEFAULT 1, p_size int DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offset int; v_size int; v_rows jsonb; v_total bigint;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_size := LEAST(GREATEST(COALESCE(p_size,50),1),200);
  v_offset := GREATEST(COALESCE(p_page,1)-1,0) * v_size;
  WITH base AS (
    SELECT a.id, a.admin_user_id, a.action, a.target_type, a.target_id, a.details, a.ip_address, a.created_at,
           p.full_name AS admin_name
    FROM tg_admin_audit_log a
    LEFT JOIN profiles p ON p.id = a.admin_user_id
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
