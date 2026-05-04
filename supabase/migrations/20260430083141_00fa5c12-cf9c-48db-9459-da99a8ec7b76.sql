-- ─── 1. Schema additions ─────────────────────────────────────────
ALTER TABLE public.finance_ledger_entries
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS transfer_group_id uuid;

-- Backfill (idempotent — default already wrote 'main', but explicit for safety)
UPDATE public.finance_ledger_entries SET bucket = 'main' WHERE bucket IS NULL;

-- Bucket CHECK
ALTER TABLE public.finance_ledger_entries
  DROP CONSTRAINT IF EXISTS finance_ledger_entries_bucket_check;
ALTER TABLE public.finance_ledger_entries
  ADD CONSTRAINT finance_ledger_entries_bucket_check
  CHECK (bucket IN ('main', 'savings'));

-- Extend type CHECK
ALTER TABLE public.finance_ledger_entries
  DROP CONSTRAINT IF EXISTS finance_ledger_entries_type_check;
ALTER TABLE public.finance_ledger_entries
  ADD CONSTRAINT finance_ledger_entries_type_check
  CHECK (type IN (
    'paystack_payout_in',
    'supplier_topup_out',
    'business_expense_out',
    'agent_commission_paid_out',
    'manual_adjustment',
    'bucket_transfer_in',
    'bucket_transfer_out',
    'agent_payout'
  ));

-- Index for bucket + recency
CREATE INDEX IF NOT EXISTS idx_finance_ledger_bucket_created
  ON public.finance_ledger_entries (bucket, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_transfer_group
  ON public.finance_ledger_entries (transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

-- ─── 2. RPC: get balances ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_finance_bucket_balances()
RETURNS TABLE(master numeric, available numeric, savings numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start numeric := 0;
  v_avail numeric := 0;
  v_sav numeric := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT COALESCE(starting_balance, 0) INTO v_start
  FROM finance_settings WHERE id = true;

  SELECT COALESCE(v_start, 0)
       + COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount ELSE 0 END), 0)
    INTO v_avail
  FROM finance_ledger_entries
  WHERE bucket = 'main' AND status = 'posted';

  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount ELSE 0 END), 0)
    INTO v_sav
  FROM finance_ledger_entries
  WHERE bucket = 'savings' AND status = 'posted';

  RETURN QUERY SELECT (v_avail + v_sav)::numeric, v_avail::numeric, v_sav::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_bucket_balances() FROM public;
GRANT EXECUTE ON FUNCTION public.get_finance_bucket_balances() TO authenticated;

-- ─── 3. RPC: transfer between buckets ────────────────────────────
CREATE OR REPLACE FUNCTION public.finance_transfer_buckets(
  p_direction text,    -- 'to_savings' | 'to_available'
  p_amount    numeric,
  p_note      text DEFAULT NULL,
  p_entry_date date DEFAULT CURRENT_DATE
)
RETURNS uuid  -- transfer_group_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group uuid := gen_random_uuid();
  v_src text;
  v_dst text;
  v_master_before numeric;
  v_avail_before  numeric;
  v_sav_before    numeric;
  v_master_after  numeric;
  v_avail_after   numeric;
  v_sav_after     numeric;
  v_avail_src     numeric;
  v_row_out uuid;
  v_row_in  uuid;
  v_desc text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;
  IF p_direction NOT IN ('to_savings','to_available') THEN
    RAISE EXCEPTION 'Invalid direction';
  END IF;

  IF p_direction = 'to_savings' THEN
    v_src := 'main'; v_dst := 'savings';
  ELSE
    v_src := 'savings'; v_dst := 'main';
  END IF;

  -- Snapshot balances BEFORE
  SELECT master, available, savings INTO v_master_before, v_avail_before, v_sav_before
  FROM get_finance_bucket_balances();

  -- Source-bucket balance check
  IF v_src = 'main' THEN
    v_avail_src := v_avail_before;
  ELSE
    v_avail_src := v_sav_before;
  END IF;
  IF p_amount > v_avail_src THEN
    RAISE EXCEPTION 'Insufficient balance in % bucket (available %, requested %)', v_src, v_avail_src, p_amount;
  END IF;

  v_desc := COALESCE(NULLIF(p_note, ''), 'Bucket transfer ' || v_src || ' → ' || v_dst);

  -- Paired inserts
  INSERT INTO finance_ledger_entries (
    entry_date, type, direction, amount, description, notes,
    source, created_by, bucket, transfer_group_id
  ) VALUES (
    p_entry_date, 'bucket_transfer_out', 'debit', p_amount, v_desc, p_note,
    'manual', v_uid, v_src, v_group
  ) RETURNING id INTO v_row_out;

  INSERT INTO finance_ledger_entries (
    entry_date, type, direction, amount, description, notes,
    source, created_by, bucket, transfer_group_id
  ) VALUES (
    p_entry_date, 'bucket_transfer_in', 'credit', p_amount, v_desc, p_note,
    'manual', v_uid, v_dst, v_group
  ) RETURNING id INTO v_row_in;

  -- Reconciliation assertion
  SELECT master, available, savings INTO v_master_after, v_avail_after, v_sav_after
  FROM get_finance_bucket_balances();

  IF round(v_master_after, 2) <> round(v_master_before, 2) THEN
    RAISE EXCEPTION 'Reconciliation failed: master changed (% -> %)', v_master_before, v_master_after;
  END IF;
  IF round(v_avail_after + v_sav_after, 2) <> round(v_master_after, 2) THEN
    RAISE EXCEPTION 'Reconciliation failed: master <> available + savings';
  END IF;

  -- Audit
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid, 'finance_bucket_transfer', 'finance_ledger', v_group::text,
    jsonb_build_object(
      'transfer_group_id', v_group,
      'amount', p_amount,
      'from_bucket', v_src,
      'to_bucket', v_dst,
      'row_out', v_row_out,
      'row_in', v_row_in,
      'note', p_note
    )
  );

  RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_transfer_buckets(text, numeric, text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.finance_transfer_buckets(text, numeric, text, date) TO authenticated;

-- ─── 4. RPC: undo transfer ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finance_undo_transfer(p_transfer_group_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int;
  v_row_ids uuid[];
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF p_transfer_group_id IS NULL THEN
    RAISE EXCEPTION 'transfer_group_id required';
  END IF;

  SELECT array_agg(id) INTO v_row_ids
  FROM finance_ledger_entries
  WHERE transfer_group_id = p_transfer_group_id;

  IF v_row_ids IS NULL OR array_length(v_row_ids, 1) <> 2 THEN
    RAISE EXCEPTION 'Transfer pair not found or already partially removed';
  END IF;

  DELETE FROM finance_ledger_entries
  WHERE transfer_group_id = p_transfer_group_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid, 'finance_transfer_undo', 'finance_ledger', p_transfer_group_id::text,
    jsonb_build_object('transfer_group_id', p_transfer_group_id, 'row_ids', to_jsonb(v_row_ids))
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_undo_transfer(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.finance_undo_transfer(uuid) TO authenticated;

-- ─── 5. RPC: agent payout ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finance_record_agent_payout(
  p_amount      numeric,
  p_agent_id    uuid DEFAULT NULL,
  p_agent_name  text DEFAULT NULL,   -- snapshot supplied by client
  p_reference   text DEFAULT NULL,
  p_note        text DEFAULT NULL,
  p_entry_date  date DEFAULT CURRENT_DATE,
  p_bucket      text DEFAULT 'main'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row uuid;
  v_avail numeric;
  v_sav numeric;
  v_master numeric;
  v_src_balance numeric;
  v_resolved_name text := p_agent_name;
  v_desc text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;
  IF p_bucket NOT IN ('main','savings') THEN
    RAISE EXCEPTION 'Invalid bucket';
  END IF;

  -- Resolve agent name snapshot if not provided
  IF v_resolved_name IS NULL AND p_agent_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(a.store_name, ''), 'Agent ' || substr(a.id::text, 1, 8))
      INTO v_resolved_name
    FROM agents a WHERE a.id = p_agent_id;
  END IF;

  -- Source balance check
  SELECT master, available, savings INTO v_master, v_avail, v_sav
  FROM get_finance_bucket_balances();
  v_src_balance := CASE WHEN p_bucket = 'main' THEN v_avail ELSE v_sav END;
  IF p_amount > v_src_balance THEN
    RAISE EXCEPTION 'Insufficient balance in % bucket (available %, requested %)', p_bucket, v_src_balance, p_amount;
  END IF;

  v_desc := 'Agent payout' || COALESCE(' — ' || v_resolved_name, '');

  INSERT INTO finance_ledger_entries (
    entry_date, type, direction, amount, description, reference, notes,
    source, source_id, created_by, bucket
  ) VALUES (
    p_entry_date, 'agent_payout', 'debit', p_amount, v_desc, p_reference, p_note,
    'manual', p_agent_id, v_uid, p_bucket
  ) RETURNING id INTO v_row;

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid, 'finance_agent_payout', 'finance_ledger', v_row::text,
    jsonb_build_object(
      'amount', p_amount,
      'bucket', p_bucket,
      'agent_id', p_agent_id,
      'agent_name_snapshot', v_resolved_name,
      'reference', p_reference,
      'note', p_note
    )
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_record_agent_payout(numeric, uuid, text, text, text, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.finance_record_agent_payout(numeric, uuid, text, text, text, date, text) TO authenticated;