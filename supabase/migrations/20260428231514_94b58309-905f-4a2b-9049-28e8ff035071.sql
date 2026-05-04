-- ============================================================
-- Withdrawal payout-mode debugging + server-authoritative mode
-- ============================================================

ALTER TABLE public.agent_withdrawals
  ADD COLUMN IF NOT EXISTS payout_mode text,
  ADD COLUMN IF NOT EXISTS automation_attempted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automation_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS automation_error text,
  ADD COLUMN IF NOT EXISTS created_from_flow text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_withdrawals_payout_mode_chk'
  ) THEN
    ALTER TABLE public.agent_withdrawals
      ADD CONSTRAINT agent_withdrawals_payout_mode_chk
      CHECK (payout_mode IS NULL OR payout_mode IN ('paystack', 'manual'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_agent_withdrawals_pending_paystack
  ON public.agent_withdrawals (created_at)
  WHERE status IN ('pending', 'pending_review') AND payout_mode = 'paystack';

-- Backfill (use only columns that exist: payout_initiated_at, processed_at, created_at)
UPDATE public.agent_withdrawals
SET payout_mode = CASE
  WHEN paystack_transfer_reference IS NOT NULL THEN 'paystack'
  ELSE 'manual'
END
WHERE payout_mode IS NULL;

UPDATE public.agent_withdrawals
SET automation_attempted = true,
    automation_attempted_at = COALESCE(payout_initiated_at, processed_at, created_at)
WHERE paystack_transfer_reference IS NOT NULL
  AND automation_attempted = false;

-- Replace request_agent_withdrawal RPC: server-authoritative payout_mode + fee only in Paystack mode
CREATE OR REPLACE FUNCTION public.request_agent_withdrawal(
  p_amount numeric,
  p_momo_number text,
  p_momo_network text,
  p_payout_momo_name text DEFAULT NULL,
  p_payout_network text DEFAULT NULL,
  p_payout_profile_id uuid DEFAULT NULL,
  p_created_from_flow text DEFAULT 'agent_dashboard'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid;
  v_agent_id uuid;
  v_available_balance numeric;
  v_withdrawal_id uuid;
  v_cleaned_phone text;
  v_min_withdrawal numeric := 10;
  v_fee_paystack numeric := 1.00;
  v_fee numeric;
  v_total_deduct numeric;
  v_paystack_enabled boolean := false;
  v_payout_mode text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;
  IF v_agent_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_NOT_AGENT');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND COALESCE(suspended,false) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_SUSPENDED');
  END IF;

  IF p_amount IS NULL OR p_amount < v_min_withdrawal THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  v_cleaned_phone := regexp_replace(COALESCE(p_momo_number,''), '[^0-9]', '', 'g');
  IF length(v_cleaned_phone) NOT IN (10, 12) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_MOMO_NUMBER');
  END IF;

  IF p_momo_network NOT IN ('MTN', 'Telecel', 'AirtelTigo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_NETWORK');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_withdrawals
    WHERE agent_id = v_agent_id
      AND status IN ('pending', 'pending_review', 'approved', 'payout_processing')
  ) THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'PENDING_WITHDRAWAL_EXISTS',
      'message', 'You already have a withdrawal in progress'
    );
  END IF;

  -- Server-authoritative mode read (inside same transaction)
  SELECT (value = 'true') INTO v_paystack_enabled
  FROM public.site_settings
  WHERE key = 'withdrawals_paystack_enabled';
  v_paystack_enabled := COALESCE(v_paystack_enabled, false);

  v_payout_mode := CASE WHEN v_paystack_enabled THEN 'paystack' ELSE 'manual' END;
  v_fee := CASE WHEN v_paystack_enabled THEN v_fee_paystack ELSE 0 END;
  v_total_deduct := p_amount + v_fee;

  SELECT available_balance INTO v_available_balance
  FROM public.agent_wallets
  WHERE agent_id = v_agent_id
  FOR UPDATE;

  IF v_available_balance IS NULL OR v_available_balance < v_total_deduct THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_BALANCE',
      'message', CASE
        WHEN v_fee > 0 THEN format(
          'Insufficient balance. You need GHS %s (GHS %s + GHS %s fee).',
          to_char(v_total_deduct, 'FM999990.00'),
          to_char(p_amount, 'FM999990.00'),
          to_char(v_fee, 'FM999990.00'))
        ELSE format('Insufficient balance. You need GHS %s.', to_char(v_total_deduct, 'FM999990.00'))
      END
    );
  END IF;

  INSERT INTO public.agent_withdrawals (
    agent_id, amount_ghs, withdrawal_fee_ghs, momo_number, momo_network, status,
    payout_momo_name, payout_network, payout_profile_id,
    payout_mode, created_from_flow
  )
  VALUES (
    v_agent_id, p_amount, v_fee, v_cleaned_phone, p_momo_network, 'pending',
    NULLIF(trim(COALESCE(p_payout_momo_name, '')), ''),
    NULLIF(trim(COALESCE(p_payout_network, '')), ''),
    p_payout_profile_id,
    v_payout_mode,
    COALESCE(NULLIF(trim(p_created_from_flow), ''), 'agent_dashboard')
  )
  RETURNING id INTO v_withdrawal_id;

  UPDATE public.agent_wallets
  SET available_balance = available_balance - v_total_deduct,
      updated_at = now()
  WHERE agent_id = v_agent_id;

  INSERT INTO public.agent_wallet_transactions (agent_id, type, amount_ghs, description, reference, status)
  VALUES (
    v_agent_id,
    'withdrawal_request',
    -v_total_deduct,
    CASE WHEN v_fee > 0 THEN
      format('Withdrawal request — GHS %s + GHS %s fee — %s %s',
        to_char(p_amount, 'FM999990.00'), to_char(v_fee, 'FM999990.00'),
        p_momo_network, v_cleaned_phone)
    ELSE
      format('Withdrawal request — GHS %s — %s %s',
        to_char(p_amount, 'FM999990.00'), p_momo_network, v_cleaned_phone)
    END,
    format('wd-req-%s', v_withdrawal_id),
    'completed'
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'status', 'pending',
    'amount', p_amount,
    'fee', v_fee,
    'total_deducted', v_total_deduct,
    'payout_mode', v_payout_mode,
    'paystack_auto', v_paystack_enabled
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'request_agent_withdrawal error: % %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('success', false, 'error', 'SERVER_ERROR', 'message', SQLERRM);
END;
$function$;

-- Sweeper: flags stuck pending Paystack withdrawals so admins see them
CREATE OR REPLACE FUNCTION public.sweep_stuck_paystack_withdrawals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count int := 0;
BEGIN
  WITH stuck AS (
    UPDATE public.agent_withdrawals
    SET automation_attempted = true,
        automation_attempted_at = now(),
        automation_error = 'client_did_not_invoke_within_window'
    WHERE payout_mode = 'paystack'
      AND status IN ('pending', 'pending_review')
      AND automation_attempted = false
      AND paystack_transfer_reference IS NULL
      AND created_at < now() - interval '90 seconds'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM stuck;

  RETURN jsonb_build_object('flagged', v_count, 'ran_at', now());
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_stuck_paystack_withdrawals() FROM PUBLIC, anon, authenticated;