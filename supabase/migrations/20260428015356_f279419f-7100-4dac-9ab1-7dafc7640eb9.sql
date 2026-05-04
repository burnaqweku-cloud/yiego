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

  SELECT NULLIF(data->>'username',''), NULLIF(data->>'first_name',''), updated_at
    INTO v_session_username, v_session_first_name, v_session_updated
  FROM telegram_sessions WHERE chat_id = p_chat_id;

  SELECT min(created_at), max(created_at) INTO v_first_order, v_last_order
  FROM orders WHERE telegram_chat_id = p_chat_id;

  SELECT jsonb_build_object(
    'link', COALESCE(
      (SELECT to_jsonb(tl) FROM telegram_links tl WHERE tl.chat_id = p_chat_id),
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
    'profile', (SELECT to_jsonb(p) FROM profiles p
                JOIN telegram_links tl ON tl.user_id = p.id WHERE tl.chat_id = p_chat_id),
    'points', (SELECT to_jsonb(b) FROM telegram_points_balances b
                JOIN telegram_links tl ON tl.user_id = b.user_id WHERE tl.chat_id = p_chat_id),
    'session', (SELECT to_jsonb(s) FROM telegram_sessions s WHERE s.chat_id = p_chat_id),
    'banned', (SELECT to_jsonb(b) FROM tg_admin_bans b WHERE b.chat_id = p_chat_id),
    'recent_orders', (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
                      FROM (SELECT order_id, network, bundle_size_gb, amount_ghs, status, payment_status, created_at
                            FROM orders WHERE telegram_chat_id = p_chat_id ORDER BY created_at DESC LIMIT 20) o),
    'recent_deposits', (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
                        FROM (SELECT paystack_reference, total_payable, status, created_at
                              FROM telegram_payment_intents WHERE chat_id = p_chat_id AND purpose='deposit'
                              ORDER BY created_at DESC LIMIT 20) d),
    'recent_ledger', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                      FROM (SELECT l.delta, l.reason, l.reference_id, l.balance_after, l.created_at
                            FROM telegram_points_ledger l
                            JOIN telegram_links tl ON tl.user_id = l.user_id
                            WHERE tl.chat_id = p_chat_id
                            ORDER BY l.created_at DESC LIMIT 50) l),
    'referrals_sent', (SELECT count(*) FROM telegram_referrals WHERE referrer_chat_id = p_chat_id),
    'referred_by', (SELECT to_jsonb(r) FROM telegram_referrals r WHERE r.referee_chat_id = p_chat_id LIMIT 1)
  ) INTO v;
  RETURN v;
END;$function$;