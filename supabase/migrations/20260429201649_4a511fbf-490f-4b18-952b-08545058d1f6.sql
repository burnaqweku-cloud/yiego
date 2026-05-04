-- Fix: use existing valid 'pending' status (constraint allows: pending, confirmed, rejected)
-- Manual transfer deposits are still distinguishable via provider='manual_transfer'

CREATE OR REPLACE FUNCTION public.submit_manual_deposit_request(p_amount numeric, p_user_txn_id text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT manual_deposit_enabled INTO v_enabled FROM public.profiles WHERE id = v_uid;
  IF v_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  SELECT value INTO v_active FROM public.site_settings WHERE key = 'manual_deposit_active';
  IF v_active IS NULL OR lower(v_active) NOT IN ('true','1','yes','on') THEN
    RETURN jsonb_build_object('success', false, 'error', 'FEATURE_DISABLED');
  END IF;

  -- Limit pending requests per user
  SELECT count(*) INTO v_recent_count
  FROM public.wallet_transactions
  WHERE user_id = v_uid
    AND provider = 'manual_transfer'
    AND status = 'pending';
  IF v_recent_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'TOO_MANY_PENDING');
  END IF;

  -- Duplicate txn id guard
  SELECT count(*) INTO v_dup_count
  FROM public.wallet_transactions
  WHERE user_id = v_uid
    AND provider = 'manual_transfer'
    AND user_txn_id = v_txn;
  IF v_dup_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'DUPLICATE_TXN_ID');
  END IF;

  v_ref := 'MTD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.wallet_transactions
    (user_id, type, amount_ghs, status, provider, reference, user_txn_id, description)
  VALUES
    (v_uid, 'deposit', p_amount, 'pending', 'manual_transfer', v_ref, v_txn,
     COALESCE(nullif(trim(p_note), ''), 'Manual transfer deposit'))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'reference', v_ref);
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_manual_deposit(p_txn_id uuid, p_admin_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row FROM public.wallet_transactions WHERE id = p_txn_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_row.type <> 'deposit' OR v_row.provider <> 'manual_transfer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TYPE');
  END IF;

  -- Accept legacy 'pending_review' too in case any pre-existed
  IF v_row.status NOT IN ('pending', 'pending_review') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_PROCESSED', 'current_status', v_row.status);
  END IF;

  UPDATE public.wallet_transactions
  SET status = 'confirmed',
      description = COALESCE(description, '') ||
        CASE WHEN p_admin_note IS NOT NULL AND length(trim(p_admin_note)) > 0
             THEN ' | Approved: ' || p_admin_note ELSE ' | Approved' END
  WHERE id = p_txn_id;

  INSERT INTO public.wallets (user_id, balance_ghs)
  VALUES (v_row.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
  SET balance_ghs = balance_ghs + v_row.amount_ghs,
      updated_at = now()
  WHERE user_id = v_row.user_id
  RETURNING balance_ghs INTO v_new_balance;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'credited', v_row.amount_ghs, 'user_id', v_row.user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_manual_deposit(p_txn_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row FROM public.wallet_transactions WHERE id = p_txn_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_row.type <> 'deposit' OR v_row.provider <> 'manual_transfer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TYPE');
  END IF;

  IF v_row.status NOT IN ('pending', 'pending_review') THEN
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
$function$;