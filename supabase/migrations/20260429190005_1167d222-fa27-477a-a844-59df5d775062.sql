
-- ============================================================
-- Manual Transfer Deposit feature
-- ============================================================

-- 1) Per-user access flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manual_deposit_enabled boolean NOT NULL DEFAULT false;

-- 2) Site-level payment details (admin editable). Stored as discrete keys
INSERT INTO public.site_settings (key, value)
VALUES
  ('manual_deposit_active', 'false'),
  ('manual_deposit_momo_number', ''),
  ('manual_deposit_account_name', ''),
  ('manual_deposit_network', ''),
  ('manual_deposit_instructions', 'Send the exact amount to the MoMo number above using your registered phone. After payment, submit a deposit request with the transaction reference. Your wallet will be credited after our team confirms the payment.')
ON CONFLICT (key) DO NOTHING;

-- 3) RPC: user submits manual deposit request
CREATE OR REPLACE FUNCTION public.submit_manual_deposit_request(
  p_amount numeric,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_enabled boolean;
  v_active text;
  v_recent_count int;
  v_ref text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  IF p_amount IS NULL OR p_amount < 10 OR p_amount > 50000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  -- Per-user flag
  SELECT manual_deposit_enabled INTO v_enabled FROM public.profiles WHERE id = v_uid;
  IF v_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  -- Global active flag
  SELECT value INTO v_active FROM public.site_settings WHERE key = 'manual_deposit_active';
  IF COALESCE(v_active, 'false') <> 'true' THEN
    RETURN jsonb_build_object('success', false, 'error', 'FEATURE_DISABLED');
  END IF;

  -- Anti-spam: max 3 pending_review manual deposits at once
  SELECT count(*) INTO v_recent_count
  FROM public.wallet_transactions
  WHERE user_id = v_uid
    AND type = 'deposit'
    AND provider = 'manual_transfer'
    AND status = 'pending_review';
  IF v_recent_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'TOO_MANY_PENDING');
  END IF;

  v_ref := 'MTD-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  INSERT INTO public.wallet_transactions (
    user_id, type, amount_ghs, status, reference, provider, description
  ) VALUES (
    v_uid,
    'deposit',
    p_amount,
    'pending_review',
    v_ref,
    'manual_transfer',
    COALESCE(NULLIF(trim(p_note), ''), 'Manual transfer deposit request')
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'reference', v_ref);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_manual_deposit_request(numeric, text) TO authenticated;

-- 4) RPC: admin approves manual deposit and credits wallet (atomic, idempotent)
CREATE OR REPLACE FUNCTION public.approve_manual_deposit(
  p_txn_id uuid,
  p_admin_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  -- Lock the row to prevent double-credit
  SELECT * INTO v_row
  FROM public.wallet_transactions
  WHERE id = p_txn_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_row.type <> 'deposit' OR v_row.provider <> 'manual_transfer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TYPE');
  END IF;

  IF v_row.status <> 'pending_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_PROCESSED', 'current_status', v_row.status);
  END IF;

  -- Mark confirmed first to lock idempotency
  UPDATE public.wallet_transactions
  SET status = 'confirmed',
      description = COALESCE(description, '') ||
        CASE WHEN p_admin_note IS NOT NULL AND length(trim(p_admin_note)) > 0
             THEN ' | Approved: ' || p_admin_note ELSE ' | Approved' END
  WHERE id = p_txn_id;

  -- Ensure wallet exists then credit
  INSERT INTO public.wallets (user_id, balance_ghs)
  VALUES (v_row.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
  SET balance_ghs = balance_ghs + v_row.amount_ghs,
      updated_at = now()
  WHERE user_id = v_row.user_id
  RETURNING balance_ghs INTO v_new_balance;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'credited', v_row.amount_ghs,
    'user_id', v_row.user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_manual_deposit(uuid, text) TO authenticated;

-- 5) RPC: admin rejects manual deposit
CREATE OR REPLACE FUNCTION public.reject_manual_deposit(
  p_txn_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row
  FROM public.wallet_transactions
  WHERE id = p_txn_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_row.type <> 'deposit' OR v_row.provider <> 'manual_transfer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TYPE');
  END IF;

  IF v_row.status <> 'pending_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_PROCESSED', 'current_status', v_row.status);
  END IF;

  UPDATE public.wallet_transactions
  SET status = 'rejected',
      description = COALESCE(description, '') ||
        CASE WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0
             THEN ' | Rejected: ' || p_reason ELSE ' | Rejected' END
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_manual_deposit(uuid, text) TO authenticated;
