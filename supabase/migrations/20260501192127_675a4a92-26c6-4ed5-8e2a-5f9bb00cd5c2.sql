-- ============== 1. Known users table ==============
CREATE TABLE IF NOT EXISTS public.telegram_known_users (
  telegram_user_id bigint PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_referrer_telegram_user_id bigint,
  first_name text
);
ALTER TABLE public.telegram_known_users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_known_users'
      AND policyname='Service role full access on telegram_known_users'
  ) THEN
    CREATE POLICY "Service role full access on telegram_known_users"
      ON public.telegram_known_users FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============== 2. telegram_points_balances ==============
-- Drop old PK on user_id; make telegram_user_id the new identity.
ALTER TABLE public.telegram_points_balances
  ADD COLUMN IF NOT EXISTS telegram_user_id bigint;

ALTER TABLE public.telegram_points_balances
  DROP CONSTRAINT IF EXISTS telegram_points_balances_pkey;

-- Add a surrogate id only if needed (keep existing rows valid).
ALTER TABLE public.telegram_points_balances
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.telegram_points_balances
  ADD CONSTRAINT telegram_points_balances_pkey PRIMARY KEY (id);

ALTER TABLE public.telegram_points_balances
  ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tpb_telegram_user_id
  ON public.telegram_points_balances(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tpb_user_id
  ON public.telegram_points_balances(user_id)
  WHERE user_id IS NOT NULL;

-- ============== 3. telegram_points_ledger ==============
ALTER TABLE public.telegram_points_ledger
  ADD COLUMN IF NOT EXISTS telegram_user_id bigint;
ALTER TABLE public.telegram_points_ledger
  ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpl_telegram_user_id_created
  ON public.telegram_points_ledger(telegram_user_id, created_at DESC)
  WHERE telegram_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tpl_tg_reason_ref
  ON public.telegram_points_ledger(telegram_user_id, reason, reference_id)
  WHERE telegram_user_id IS NOT NULL AND reference_id IS NOT NULL;

-- ============== 4. telegram_referrals ==============
ALTER TABLE public.telegram_referrals
  ADD COLUMN IF NOT EXISTS referrer_telegram_user_id bigint,
  ADD COLUMN IF NOT EXISTS referee_telegram_user_id bigint;
CREATE INDEX IF NOT EXISTS idx_tr_referrer_tg_uid
  ON public.telegram_referrals(referrer_telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_tr_referee_tg_uid
  ON public.telegram_referrals(referee_telegram_user_id);

-- ============== 5. telegram_checkins ==============
ALTER TABLE public.telegram_checkins
  ADD COLUMN IF NOT EXISTS telegram_user_id bigint;
ALTER TABLE public.telegram_checkins
  ALTER COLUMN user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tc_tg_user_date
  ON public.telegram_checkins(telegram_user_id, checkin_date)
  WHERE telegram_user_id IS NOT NULL;

-- ============== 6. RPC grant_telegram_points_v2 ==============
CREATE OR REPLACE FUNCTION public.grant_telegram_points_v2(
  p_telegram_user_id bigint,
  p_delta integer,
  p_reason text,
  p_reference_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ============== 7. RPC claim_telegram_referral_v2 ==============
CREATE OR REPLACE FUNCTION public.claim_telegram_referral_v2(
  p_referral_id uuid,
  p_qualifying_order_id text,
  p_referee_user_id uuid DEFAULT NULL,
  p_referee_telegram_user_id bigint DEFAULT NULL
)
RETURNS TABLE (
  referrer_telegram_user_id bigint,
  referee_telegram_user_id bigint,
  referrer_user_id uuid,
  referee_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.telegram_referrals r
     SET status = 'qualified',
         qualified_at = now(),
         qualifying_order_id = p_qualifying_order_id,
         referee_user_id = COALESCE(r.referee_user_id, p_referee_user_id),
         referee_telegram_user_id = COALESCE(r.referee_telegram_user_id, p_referee_telegram_user_id, r.referee_chat_id),
         referrer_telegram_user_id = COALESCE(r.referrer_telegram_user_id, r.referrer_chat_id)
   WHERE r.id = p_referral_id
     AND r.status = 'pending'
  RETURNING r.referrer_telegram_user_id, r.referee_telegram_user_id, r.referrer_user_id, r.referee_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_telegram_points_v2(bigint, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_telegram_referral_v2(uuid, text, uuid, bigint) TO service_role;