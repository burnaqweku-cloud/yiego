
-- Pre-existing empty snapshots table from interrupted prior run — drop and recreate
DROP TABLE IF EXISTS public.finance_monthly_snapshots CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- FEATURE 1: finance_categories
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  color_hex text,
  sort_order integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read finance categories"
  ON public.finance_categories FOR SELECT USING (is_admin());

CREATE POLICY "Admins can manage finance categories"
  ON public.finance_categories FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO public.finance_categories (name, description, color_hex, sort_order) VALUES
  ('Operations',             'Day-to-day operations costs',     '#64748b', 10),
  ('Marketing',              'Ads, promo, content',              '#ec4899', 20),
  ('Software & Tools',       'SaaS subscriptions & tooling',     '#6366f1', 30),
  ('Bank & Payment Fees',    'Paystack, bank charges',           '#f59e0b', 40),
  ('Office & Supplies',      'Office gear and supplies',         '#10b981', 50),
  ('Travel',                 'Travel & transport',               '#0ea5e9', 60),
  ('Salaries & Contractors', 'Team salaries & contractor pay',   '#8b5cf6', 70),
  ('Taxes',                  'Government taxes & duties',        '#dc2626', 80),
  ('Other',                  'Uncategorised',                    '#94a3b8', 999);

ALTER TABLE public.finance_ledger_entries
  ADD COLUMN category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_finance_ledger_category_id ON public.finance_ledger_entries(category_id);

UPDATE public.finance_ledger_entries fle
   SET category_id = fc.id
  FROM public.finance_categories fc
 WHERE fle.category IS NOT NULL
   AND lower(trim(fle.category)) = lower(fc.name);

-- ═══════════════════════════════════════════════════════════════════
-- FEATURE 2: pending status + expected_date
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.finance_ledger_entries
  DROP CONSTRAINT IF EXISTS finance_ledger_entries_status_check;
ALTER TABLE public.finance_ledger_entries
  ADD CONSTRAINT finance_ledger_entries_status_check
  CHECK (status IN ('posted', 'void', 'pending'));

ALTER TABLE public.finance_ledger_entries
  ADD COLUMN expected_date date;

CREATE INDEX idx_finance_ledger_pending_expected
  ON public.finance_ledger_entries(status, expected_date)
  WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════
-- FEATURE 3: finance_monthly_snapshots
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE public.finance_monthly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_month date NOT NULL UNIQUE,
  master_balance numeric NOT NULL,
  available_balance numeric NOT NULL,
  savings_balance numeric NOT NULL,
  total_in numeric NOT NULL,
  total_out numeric NOT NULL,
  net_movement numeric NOT NULL,
  entry_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  notes text
);

ALTER TABLE public.finance_monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage finance snapshots"
  ON public.finance_monthly_snapshots FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.finance_mark_pending_as_paid(
  p_entry_id uuid,
  p_actual_date date DEFAULT CURRENT_DATE
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_expected date;
  v_status text;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Forbidden: admin only'; END IF;

  SELECT status, expected_date INTO v_status, v_prev_expected
    FROM finance_ledger_entries WHERE id = p_entry_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Entry is not pending (status=%)', v_status; END IF;

  UPDATE finance_ledger_entries
     SET status = 'posted', entry_date = p_actual_date
   WHERE id = p_entry_id;

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'finance_mark_paid', 'finance_ledger', p_entry_id::text,
    jsonb_build_object('previous_expected_date', v_prev_expected, 'actual_entry_date', p_actual_date));
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_create_monthly_snapshot(
  p_month date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_first date := date_trunc('month', p_month)::date;
  v_last  date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_start numeric := 0;
  v_master numeric; v_avail numeric; v_sav numeric;
  v_in numeric; v_out numeric; v_count integer; v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Forbidden: admin only'; END IF;

  IF EXISTS (SELECT 1 FROM finance_monthly_snapshots WHERE snapshot_month = v_first) THEN
    RAISE EXCEPTION 'Snapshot already exists for %; use recompute to overwrite', v_first;
  END IF;

  SELECT COALESCE(starting_balance, 0) INTO v_start FROM finance_settings WHERE id = true;

  SELECT COALESCE(SUM(CASE WHEN direction='credit' AND bucket='main' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN direction='debit'  AND bucket='main' THEN amount ELSE 0 END), 0)
    INTO v_avail FROM finance_ledger_entries
   WHERE status = 'posted' AND entry_date <= v_last;
  v_avail := v_avail + v_start;

  SELECT COALESCE(SUM(CASE WHEN direction='credit' AND bucket='savings' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN direction='debit'  AND bucket='savings' THEN amount ELSE 0 END), 0)
    INTO v_sav FROM finance_ledger_entries
   WHERE status = 'posted' AND entry_date <= v_last;
  v_master := v_avail + v_sav;

  SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0),
         COUNT(*)
    INTO v_in, v_out, v_count
    FROM finance_ledger_entries
   WHERE status = 'posted' AND entry_date BETWEEN v_first AND v_last;

  INSERT INTO finance_monthly_snapshots (
    snapshot_month, master_balance, available_balance, savings_balance,
    total_in, total_out, net_movement, entry_count, created_by
  ) VALUES (
    v_first, v_master, v_avail, v_sav, v_in, v_out, (v_in - v_out), v_count, v_uid
  ) RETURNING id INTO v_id;

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'finance_snapshot_create', 'finance_monthly_snapshots', v_id::text,
    jsonb_build_object('snapshot_month', v_first, 'master', v_master,
      'available', v_avail, 'savings', v_sav, 'in', v_in, 'out', v_out));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_recompute_monthly_snapshot(
  p_month date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_first date := date_trunc('month', p_month)::date;
  v_old_id uuid;
  v_new_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Forbidden: admin only'; END IF;

  SELECT id INTO v_old_id FROM finance_monthly_snapshots WHERE snapshot_month = v_first;
  IF v_old_id IS NOT NULL THEN
    DELETE FROM finance_monthly_snapshots WHERE id = v_old_id;
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_uid, 'finance_snapshot_delete', 'finance_monthly_snapshots', v_old_id::text,
      jsonb_build_object('snapshot_month', v_first, 'reason', 'recompute'));
  END IF;

  v_new_id := finance_create_monthly_snapshot(v_first);
  RETURN v_new_id;
END;
$$;

-- Cron wrapper: snapshot the previous Africa/Accra month, no admin gate
CREATE OR REPLACE FUNCTION public.finance_cron_snapshot_previous_month()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_prev date := (date_trunc('month', (now() AT TIME ZONE 'Africa/Accra')::date) - interval '1 day')::date;
  v_first date := date_trunc('month', v_prev)::date;
  v_last date := (date_trunc('month', v_first) + interval '1 month - 1 day')::date;
  v_start numeric := 0;
  v_master numeric; v_avail numeric; v_sav numeric;
  v_in numeric; v_out numeric; v_count integer; v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM finance_monthly_snapshots WHERE snapshot_month = v_first) THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
    VALUES ('finance_snapshot_cron_skip', 'finance_monthly_snapshots', v_first::text,
      jsonb_build_object('reason', 'snapshot_already_exists'));
    RETURN;
  END IF;

  SELECT COALESCE(starting_balance, 0) INTO v_start FROM finance_settings WHERE id = true;

  SELECT COALESCE(SUM(CASE WHEN direction='credit' AND bucket='main' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN direction='debit'  AND bucket='main' THEN amount ELSE 0 END), 0)
    INTO v_avail FROM finance_ledger_entries
   WHERE status='posted' AND entry_date <= v_last;
  v_avail := v_avail + v_start;

  SELECT COALESCE(SUM(CASE WHEN direction='credit' AND bucket='savings' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN direction='debit'  AND bucket='savings' THEN amount ELSE 0 END), 0)
    INTO v_sav FROM finance_ledger_entries
   WHERE status='posted' AND entry_date <= v_last;
  v_master := v_avail + v_sav;

  SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0),
         COUNT(*)
    INTO v_in, v_out, v_count
    FROM finance_ledger_entries
   WHERE status='posted' AND entry_date BETWEEN v_first AND v_last;

  INSERT INTO finance_monthly_snapshots (
    snapshot_month, master_balance, available_balance, savings_balance,
    total_in, total_out, net_movement, entry_count, created_by, notes
  ) VALUES (
    v_first, v_master, v_avail, v_sav, v_in, v_out, (v_in - v_out), v_count, NULL,
    'Auto-generated by cron'
  ) RETURNING id INTO v_id;

  INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
  VALUES ('finance_snapshot_create', 'finance_monthly_snapshots', v_id::text,
    jsonb_build_object('snapshot_month', v_first, 'cron', true, 'master', v_master));
END;
$$;

-- Backfill snapshots for all completed months
DO $$
DECLARE
  v_min date;
  v_now_accra date := (now() AT TIME ZONE 'Africa/Accra')::date;
  v_current_first date := date_trunc('month', v_now_accra)::date;
  v_iter date;
  v_start numeric := 0;
  v_last date;
  v_master numeric; v_avail numeric; v_sav numeric;
  v_in numeric; v_out numeric; v_count integer;
  v_inserted int := 0;
BEGIN
  SELECT MIN(entry_date) INTO v_min FROM finance_ledger_entries WHERE status='posted';
  IF v_min IS NULL THEN RETURN; END IF;
  SELECT COALESCE(starting_balance, 0) INTO v_start FROM finance_settings WHERE id=true;

  v_iter := date_trunc('month', v_min)::date;
  WHILE v_iter < v_current_first LOOP
    v_last := (date_trunc('month', v_iter) + interval '1 month - 1 day')::date;

    SELECT COALESCE(SUM(CASE WHEN direction='credit' AND bucket='main' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN direction='debit'  AND bucket='main' THEN amount ELSE 0 END), 0)
      INTO v_avail FROM finance_ledger_entries
     WHERE status='posted' AND entry_date <= v_last;
    v_avail := v_avail + v_start;

    SELECT COALESCE(SUM(CASE WHEN direction='credit' AND bucket='savings' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN direction='debit'  AND bucket='savings' THEN amount ELSE 0 END), 0)
      INTO v_sav FROM finance_ledger_entries
     WHERE status='posted' AND entry_date <= v_last;
    v_master := v_avail + v_sav;

    SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0),
           COUNT(*)
      INTO v_in, v_out, v_count
      FROM finance_ledger_entries
     WHERE status='posted' AND entry_date BETWEEN v_iter AND v_last;

    INSERT INTO finance_monthly_snapshots(
      snapshot_month, master_balance, available_balance, savings_balance,
      total_in, total_out, net_movement, entry_count, notes
    ) VALUES (
      v_iter, v_master, v_avail, v_sav, v_in, v_out, (v_in - v_out), v_count,
      'Backfilled by migration'
    );
    v_inserted := v_inserted + 1;
    v_iter := (v_iter + interval '1 month')::date;
  END LOOP;

  RAISE NOTICE 'Backfill: % snapshot(s) inserted', v_inserted;
END $$;
