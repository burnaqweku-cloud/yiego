
CREATE OR REPLACE FUNCTION public.request_agent_withdrawal(
  p_amount numeric,
  p_momo_number text,
  p_momo_network text,
  p_payout_momo_name text DEFAULT NULL,
  p_payout_network text DEFAULT NULL,
  p_payout_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_agent_id uuid;
  v_available_balance numeric;
  v_withdrawal_id uuid;
  v_cleaned_phone text;
  v_min_withdrawal numeric := 10;
BEGIN
  -- 1. Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- 2. Find agent record
  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE user_id = v_user_id AND status = 'active'
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_NOT_AGENT');
  END IF;

  -- 3. Check if user is suspended
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND suspended = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNT_SUSPENDED');
  END IF;

  -- 4. Validate amount
  IF p_amount IS NULL OR p_amount < v_min_withdrawal THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT', 'message', format('Minimum withdrawal is GHS %s', v_min_withdrawal));
  END IF;

  IF p_amount > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT', 'message', 'Maximum withdrawal is GHS 10,000');
  END IF;

  -- 5. Validate MoMo number
  v_cleaned_phone := regexp_replace(trim(COALESCE(p_momo_number, '')), '[^0-9]', '', 'g');
  IF length(v_cleaned_phone) = 12 AND v_cleaned_phone LIKE '233%' THEN
    v_cleaned_phone := '0' || substring(v_cleaned_phone from 4);
  END IF;
  IF length(v_cleaned_phone) != 10 OR v_cleaned_phone !~ '^0[235][0-9]{8}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_MOMO_NUMBER');
  END IF;

  -- 6. Validate network
  IF p_momo_network NOT IN ('MTN', 'Telecel', 'AirtelTigo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_NETWORK');
  END IF;

  -- 7. Check for existing pending withdrawal
  IF EXISTS (
    SELECT 1 FROM public.agent_withdrawals
    WHERE agent_id = v_agent_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PENDING_WITHDRAWAL_EXISTS', 'message', 'You already have a pending withdrawal request');
  END IF;

  -- 8. Get available balance
  SELECT available_balance INTO v_available_balance
  FROM public.agent_wallets
  WHERE agent_id = v_agent_id;

  IF v_available_balance IS NULL OR v_available_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_BALANCE');
  END IF;

  -- 9. Atomic: create withdrawal + debit wallet + log transaction
  INSERT INTO public.agent_withdrawals (
    agent_id, amount_ghs, momo_number, momo_network, status,
    payout_momo_name, payout_network, payout_profile_id
  )
  VALUES (
    v_agent_id, p_amount, v_cleaned_phone, p_momo_network, 'pending',
    NULLIF(trim(COALESCE(p_payout_momo_name, '')), ''),
    NULLIF(trim(COALESCE(p_payout_network, '')), ''),
    p_payout_profile_id
  )
  RETURNING id INTO v_withdrawal_id;

  -- 9b. Debit available_balance
  UPDATE public.agent_wallets
  SET available_balance = available_balance - p_amount,
      updated_at = now()
  WHERE agent_id = v_agent_id;

  -- 9c. Create ledger entry
  INSERT INTO public.agent_wallet_transactions (agent_id, type, amount_ghs, description, reference, status)
  VALUES (
    v_agent_id,
    'withdrawal_request',
    -p_amount,
    format('Withdrawal request — %s %s', p_momo_network, v_cleaned_phone),
    format('wd-req-%s', v_withdrawal_id),
    'completed'
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'status', 'pending',
    'amount', p_amount
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'request_agent_withdrawal error: % %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('success', false, 'error', 'SERVER_ERROR', 'message', SQLERRM);
END;
$$;
