CREATE OR REPLACE FUNCTION public.grant_telegram_points_v2(p_telegram_user_id bigint, p_delta integer, p_reason text, p_reference_id text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
  v_enabled boolean;
  v_ledger_id uuid;
  v_is_earning boolean;
  v_existing_id uuid;
BEGIN
  IF p_telegram_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_USER_ID');
  END IF;
  IF p_delta = 0 OR p_delta IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_DELTA');
  END IF;
  IF p_reason NOT IN (
    'referral_referrer','referral_referee','purchase','checkin',
    'streak_bonus','redemption','expiry','admin_adjust','admin_revoke'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REASON');
  END IF;

  v_is_earning := p_delta > 0 AND p_reason IN (
    'referral_referrer','referral_referee','purchase','checkin','streak_bonus'
  );
  IF v_is_earning THEN
    SELECT points_system_enabled INTO v_enabled
      FROM public.telegram_points_config WHERE id = true;
    IF v_enabled IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'EARNING_PAUSED');
    END IF;
  END IF;

  -- Idempotency
  IF p_reference_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.telegram_points_ledger
      WHERE telegram_user_id = p_telegram_user_id
        AND reason = p_reason
        AND reference_id = p_reference_id
      LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      SELECT balance INTO v_current_balance
        FROM public.telegram_points_balances
        WHERE telegram_user_id = p_telegram_user_id;
      RETURN jsonb_build_object(
        'success', true, 'idempotent', true,
        'ledger_id', v_existing_id,
        'previous_balance', COALESCE(v_current_balance,0),
        'new_balance', COALESCE(v_current_balance,0),
        'delta', 0
      );
    END IF;
  END IF;

  -- Architecture: bot points belong to TELEGRAM USER ONLY.
  -- We never merge legacy user_id-keyed rows. Linking is a pure no-op on balance.
  -- Only operate on telegram_user_id-keyed rows.

  -- Upsert tg-keyed row
  INSERT INTO public.telegram_points_balances (telegram_user_id, user_id, balance, last_activity_at, updated_at)
  VALUES (p_telegram_user_id, p_user_id, 0, now(), now())
  ON CONFLICT (telegram_user_id) WHERE telegram_user_id IS NOT NULL
    DO UPDATE SET user_id = COALESCE(public.telegram_points_balances.user_id, EXCLUDED.user_id);

  SELECT balance INTO v_current_balance
    FROM public.telegram_points_balances
    WHERE telegram_user_id = p_telegram_user_id
    FOR UPDATE;

  v_new_balance := v_current_balance + p_delta;
  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS',
      'current_balance', v_current_balance, 'requested_delta', p_delta);
  END IF;

  UPDATE public.telegram_points_balances
    SET balance = v_new_balance,
        last_activity_at = now(),
        updated_at = now(),
        user_id = COALESCE(user_id, p_user_id)
    WHERE telegram_user_id = p_telegram_user_id;

  INSERT INTO public.telegram_points_ledger
    (telegram_user_id, user_id, delta, reason, reference_id, balance_after)
  VALUES
    (p_telegram_user_id, p_user_id, p_delta, p_reason, p_reference_id, v_new_balance)
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance,
    'delta', p_delta
  );
END;
$function$;