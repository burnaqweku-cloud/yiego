
-- 1) Add user_txn_id to wallet_transactions for manual deposits
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS user_txn_id text;

-- Prevent the same user from submitting the same transaction id twice for manual transfers
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txn_user_manual_user_txn_id
  ON public.wallet_transactions (user_id, user_txn_id)
  WHERE provider = 'manual_transfer' AND user_txn_id IS NOT NULL;

-- 2) Replace submit RPC with user_txn_id support (keep old signature for safety -> drop then recreate)
DROP FUNCTION IF EXISTS public.submit_manual_deposit_request(numeric, text);

CREATE OR REPLACE FUNCTION public.submit_manual_deposit_request(
  p_amount numeric,
  p_user_txn_id text,
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
  v_dup_count int;
  v_ref text;
  v_id uuid;
  v_txn text := nullif(trim(p_user_txn_id), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  IF p_amount IS NULL OR p_amount < 10 OR p_amount > 50000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  IF v_txn IS NULL OR length(v_txn) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'TXN_ID_REQUIRED');
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

  -- Duplicate transaction ID guard
  SELECT count(*) INTO v_dup_count
  FROM public.wallet_transactions
  WHERE user_id = v_uid
    AND provider = 'manual_transfer'
    AND user_txn_id = v_txn;
  IF v_dup_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'DUPLICATE_TXN_ID');
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
    user_id, type, amount_ghs, status, reference, provider, description, user_txn_id
  ) VALUES (
    v_uid,
    'deposit',
    p_amount,
    'pending_review',
    v_ref,
    'manual_transfer',
    COALESCE(NULLIF(trim(p_note), ''), 'Manual transfer deposit request'),
    v_txn
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'reference', v_ref, 'user_txn_id', v_txn);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_manual_deposit_request(numeric, text, text) TO authenticated;

-- 3) Enable realtime so user wallet page can react instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
