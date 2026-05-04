-- ============================================================
-- WITHDRAWAL FEE (GHS 1.00) + AUTO PAYSTACK PAYOUT SUPPORT
-- ============================================================
-- Backwards compatible:
--   * existing withdrawals get withdrawal_fee_ghs = 0  → no behavior change
--   * amount_ghs continues to mean the amount the AGENT RECEIVES
--   * total wallet deduction = amount_ghs + withdrawal_fee_ghs
-- ============================================================

-- 1. Add fee + total_deducted columns
ALTER TABLE public.agent_withdrawals
  ADD COLUMN IF NOT EXISTS withdrawal_fee_ghs numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deducted_ghs numeric
    GENERATED ALWAYS AS (amount_ghs + COALESCE(withdrawal_fee_ghs, 0)) STORED;

-- 2. Replace request_agent_withdrawal RPC: enforce GHS 1 fee + balance check
CREATE OR REPLACE FUNCTION public.request_agent_withdrawal(
  p_amount numeric,
  p_momo_number text,
  p_momo_network text,
  p_payout_momo_name text DEFAULT NULL::text,
  p_payout_network text DEFAULT NULL::text,
  p_payout_profile_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_agent_id uuid;
  v_available_balance numeric;
  v_withdrawal_id uuid;
  v_cleaned_phone text;
  v_min_withdrawal numeric := 10;
  v_fee numeric := 1.00;       -- flat GHS 1.00 fee
  v_total_deduct numeric;
  v_paystack_enabled boolean := false;
BEGIN
  -- 1. Authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- 2. Active agent
  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_NOT_AGENT');
  END IF;

  -- 3. Suspension guard
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND suspended = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_SUSPENDED');
  END IF;

  -- 4. Amount bounds
  IF p_amount IS NULL OR p_amount < v_min_withdrawal THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'INVALID_AMOUNT',
      'message', format('Minimum withdrawal is GHS %s', v_min_withdrawal)
    );
  END IF;

  IF p_amount > 10000 THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'INVALID_AMOUNT',
      'message', 'Maximum withdrawal is GHS 10,000'
    );
  END IF;

  -- 5. Phone validation
  v_cleaned_phone := regexp_replace(trim(COALESCE(p_momo_number, '')), '[^0-9]', '', 'g');
  IF length(v_cleaned_phone) = 12 AND v_cleaned_phone LIKE '233%' THEN
    v_cleaned_phone := '0' || substring(v_cleaned_phone from 4);
  END IF;
  IF length(v_cleaned_phone) != 10 OR v_cleaned_phone !~ '^0[235][0-9]{8}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_MOMO_NUMBER');
  END IF;

  -- 6. Network
  IF p_momo_network NOT IN ('MTN', 'Telecel', 'AirtelTigo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_NETWORK');
  END IF;

  -- 7. Pending guard (covers payout_processing too — never two live payouts)
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

  -- 8. Balance check INCLUDING fee — atomic via row lock
  SELECT available_balance INTO v_available_balance
  FROM public.agent_wallets
  WHERE agent_id = v_agent_id
  FOR UPDATE;

  v_total_deduct := p_amount + v_fee;

  IF v_available_balance IS NULL OR v_available_balance < v_total_deduct THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_BALANCE',
      'message', format(
        'Insufficient balance. You need GHS %s (GHS %s + GHS %s fee).',
        to_char(v_total_deduct, 'FM999990.00'),
        to_char(p_amount, 'FM999990.00'),
        to_char(v_fee, 'FM999990.00')
      )
    );
  END IF;

  -- 9a. Insert withdrawal (amount_ghs = receivable, fee separate)
  INSERT INTO public.agent_withdrawals (
    agent_id, amount_ghs, withdrawal_fee_ghs, momo_number, momo_network, status,
    payout_momo_name, payout_network, payout_profile_id
  )
  VALUES (
    v_agent_id, p_amount, v_fee, v_cleaned_phone, p_momo_network, 'pending',
    NULLIF(trim(COALESCE(p_payout_momo_name, '')), ''),
    NULLIF(trim(COALESCE(p_payout_network, '')), ''),
    p_payout_profile_id
  )
  RETURNING id INTO v_withdrawal_id;

  -- 9b. Debit available_balance by total (amount + fee)
  UPDATE public.agent_wallets
  SET available_balance = available_balance - v_total_deduct,
      updated_at = now()
  WHERE agent_id = v_agent_id;

  -- 9c. Ledger row reflects FULL deduction
  INSERT INTO public.agent_wallet_transactions (agent_id, type, amount_ghs, description, reference, status)
  VALUES (
    v_agent_id,
    'withdrawal_request',
    -v_total_deduct,
    format('Withdrawal request — GHS %s + GHS %s fee — %s %s',
      to_char(p_amount, 'FM999990.00'),
      to_char(v_fee, 'FM999990.00'),
      p_momo_network, v_cleaned_phone),
    format('wd-req-%s', v_withdrawal_id),
    'completed'
  );

  -- 10. Tell client whether Paystack auto mode is on (so it can trigger edge fn)
  SELECT (value = 'true') INTO v_paystack_enabled
  FROM public.site_settings
  WHERE key = 'withdrawals_paystack_enabled';

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'status', 'pending',
    'amount', p_amount,
    'fee', v_fee,
    'total_deducted', v_total_deduct,
    'paystack_auto', COALESCE(v_paystack_enabled, false)
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'request_agent_withdrawal error: % %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('success', false, 'error', 'SERVER_ERROR', 'message', SQLERRM);
END;
$function$;

-- 3. Drop the obsolete 3-arg overload (the 6-arg version is the only caller)
DROP FUNCTION IF EXISTS public.request_agent_withdrawal(numeric, text, text);
