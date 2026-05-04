-- ============================================================
-- PHASE 1: Telegram bot points & referral system
-- All tables prefixed telegram_ to avoid collision with existing
-- website-side loyalty_* / point_transactions / referral_* tables.
-- ============================================================

-- 1. Balances table
CREATE TABLE public.telegram_points_balances (
  user_id uuid PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_points_balances ENABLE ROW LEVEL SECURITY;
-- No policies → service role only (bypasses RLS)

CREATE INDEX idx_telegram_points_balances_last_activity
  ON public.telegram_points_balances (last_activity_at)
  WHERE balance > 0;

-- 2. Immutable ledger
CREATE TABLE public.telegram_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'referral_referrer',
    'referral_referee',
    'purchase',
    'checkin',
    'streak_bonus',
    'redemption',
    'expiry',
    'admin_adjust'
  )),
  reference_id text,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_points_ledger ENABLE ROW LEVEL SECURITY;
-- No policies → service role only

CREATE INDEX idx_telegram_points_ledger_user_created
  ON public.telegram_points_ledger (user_id, created_at DESC);

CREATE INDEX idx_telegram_points_ledger_reference
  ON public.telegram_points_ledger (reason, reference_id)
  WHERE reference_id IS NOT NULL;

-- 3. Referrals
CREATE TABLE public.telegram_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid,
  referrer_chat_id bigint NOT NULL,
  referee_chat_id bigint NOT NULL UNIQUE,
  referee_user_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'qualified', 'rewarded', 'invalid')),
  qualifying_order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  CONSTRAINT no_self_referral CHECK (referrer_chat_id <> referee_chat_id)
);

ALTER TABLE public.telegram_referrals ENABLE ROW LEVEL SECURITY;
-- No policies → service role only

CREATE INDEX idx_telegram_referrals_referrer_chat
  ON public.telegram_referrals (referrer_chat_id);
CREATE INDEX idx_telegram_referrals_referee_user
  ON public.telegram_referrals (referee_user_id)
  WHERE referee_user_id IS NOT NULL;
CREATE INDEX idx_telegram_referrals_status
  ON public.telegram_referrals (status)
  WHERE status IN ('pending', 'qualified');

-- 4. Check-ins
CREATE TABLE public.telegram_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  checkin_date date NOT NULL,
  streak_count integer NOT NULL DEFAULT 1 CHECK (streak_count >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, checkin_date)
);

ALTER TABLE public.telegram_checkins ENABLE ROW LEVEL SECURITY;
-- No policies → service role only

CREATE INDEX idx_telegram_checkins_user_date
  ON public.telegram_checkins (user_id, checkin_date DESC);

-- 5. Config (singleton kill-switch)
CREATE TABLE public.telegram_points_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  points_system_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.telegram_points_config ENABLE ROW LEVEL SECURITY;

-- Admins can read config
CREATE POLICY "Admins can read telegram_points_config"
  ON public.telegram_points_config
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Admins can update config (kill-switch)
CREATE POLICY "Admins can update telegram_points_config"
  ON public.telegram_points_config
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed singleton row
INSERT INTO public.telegram_points_config (id, points_system_enabled)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ATOMIC RPC: grant_telegram_points
-- The ONLY way points can ever change. Bot calls this; never
-- writes the tables directly.
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_telegram_points(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_reference_id text DEFAULT NULL
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
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MISSING_USER_ID');
  END IF;

  IF p_delta = 0 OR p_delta IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_DELTA');
  END IF;

  IF p_reason NOT IN (
    'referral_referrer','referral_referee','purchase','checkin',
    'streak_bonus','redemption','expiry','admin_adjust'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REASON');
  END IF;

  -- Kill-switch: block earning actions when paused (still allows
  -- redemption / expiry / admin_adjust / negative deltas)
  v_is_earning := p_delta > 0 AND p_reason IN (
    'referral_referrer','referral_referee','purchase','checkin','streak_bonus'
  );

  IF v_is_earning THEN
    SELECT points_system_enabled INTO v_enabled
    FROM public.telegram_points_config
    WHERE id = true;

    IF v_enabled IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'EARNING_PAUSED');
    END IF;
  END IF;

  -- Lock or create balance row
  INSERT INTO public.telegram_points_balances (user_id, balance, last_activity_at, updated_at)
  VALUES (p_user_id, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_current_balance
  FROM public.telegram_points_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_new_balance := v_current_balance + p_delta;

  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_POINTS',
      'current_balance', v_current_balance,
      'requested_delta', p_delta
    );
  END IF;

  -- Update balance + activity timestamp
  UPDATE public.telegram_points_balances
  SET balance = v_new_balance,
      last_activity_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Write immutable ledger row
  INSERT INTO public.telegram_points_ledger (
    user_id, delta, reason, reference_id, balance_after
  )
  VALUES (
    p_user_id, p_delta, p_reason, p_reference_id, v_new_balance
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'previous_balance', v_current_balance,
    'delta', p_delta,
    'ledger_id', v_ledger_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'grant_telegram_points failed user=% delta=% reason=%: % %',
    p_user_id, p_delta, p_reason, SQLERRM, SQLSTATE;
  RETURN jsonb_build_object(
    'success', false,
    'error', 'SERVER_ERROR',
    'message', SQLERRM
  );
END;
$$;

-- Lock down: only service role and admins can call directly
REVOKE EXECUTE ON FUNCTION public.grant_telegram_points(uuid, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_telegram_points(uuid, integer, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_telegram_points(uuid, integer, text, text) FROM anon;

-- updated_at trigger for config
CREATE TRIGGER trg_telegram_points_config_updated
  BEFORE UPDATE ON public.telegram_points_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();