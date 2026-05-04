-- ============================================================
-- Fix Agent Total Withdrawn — single source of truth via trigger
-- ============================================================
-- Problem: Manual "Mark as Paid" updated agent_withdrawals.status='paid'
-- but did NOT increment agent_wallets.total_withdrawn or insert a ledger
-- row. Only the Paystack webhook did that. Result: manual payouts were
-- invisible in the agent dashboard.
--
-- Solution: A SECURITY DEFINER trigger fires whenever a withdrawal row
-- transitions into status='paid' (from any source — manual, Paystack
-- webhook, future flows). It is fully idempotent:
--   * Wallet increment is guarded by a marker on agent_wallet_transactions
--     (one row per withdrawal id). If the marker exists, no double-write.
--   * Ledger insert uses ON CONFLICT DO NOTHING via a unique reference.
--
-- Backfill: replays all currently-paid withdrawals so historical totals
-- are correct.
-- ============================================================

-- 1. Ensure agent_wallet_transactions.reference is unique (idempotency key)
--    Use a partial unique index so legacy NULL refs don't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS agent_wallet_transactions_reference_uniq
  ON public.agent_wallet_transactions (reference)
  WHERE reference IS NOT NULL;

-- 2. Trigger function: credit wallet & ledger when a withdrawal becomes paid
CREATE OR REPLACE FUNCTION public.handle_withdrawal_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_ref text;
  v_inserted_ledger boolean := false;
BEGIN
  -- Only act on transitions INTO 'paid'
  IF NEW.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RETURN NEW; -- already paid, no-op
  END IF;

  v_amount := COALESCE(NEW.amount_ghs, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_ref := 'paid-' || NEW.id::text;

  -- Idempotency guard: insert ledger row first; if it already exists
  -- (from a prior path, e.g. legacy webhook write), we skip the wallet
  -- increment so totals never double-count.
  BEGIN
    INSERT INTO public.agent_wallet_transactions (
      agent_id, type, amount_ghs, description, reference, status
    ) VALUES (
      NEW.agent_id,
      'withdrawal_paid',
      -v_amount,
      format('Withdrawal paid — %s %s', COALESCE(NEW.momo_network,''), COALESCE(NEW.momo_number,'')),
      v_ref,
      'completed'
    );
    v_inserted_ledger := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted_ledger := false; -- already credited by another path
  END;

  IF v_inserted_ledger THEN
    UPDATE public.agent_wallets
    SET total_withdrawn = COALESCE(total_withdrawn, 0) + v_amount,
        updated_at = now()
    WHERE agent_id = NEW.agent_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_withdrawal_paid error for withdrawal %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_withdrawal_paid_credit ON public.agent_withdrawals;
CREATE TRIGGER trg_withdrawal_paid_credit
AFTER INSERT OR UPDATE OF status ON public.agent_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.handle_withdrawal_paid();

-- 4. Backfill historical paid withdrawals
--    For each agent: total_withdrawn = SUM(amount_ghs WHERE status='paid')
--    Also ensures every paid withdrawal has its ledger marker so the
--    trigger remains idempotent against any future re-trigger.
DO $$
DECLARE
  r record;
  v_ref text;
BEGIN
  -- Insert missing ledger markers for already-paid withdrawals
  FOR r IN
    SELECT w.id, w.agent_id, w.amount_ghs, w.momo_network, w.momo_number
    FROM public.agent_withdrawals w
    WHERE w.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_wallet_transactions t
        WHERE t.reference = 'paid-' || w.id::text
      )
  LOOP
    v_ref := 'paid-' || r.id::text;
    BEGIN
      INSERT INTO public.agent_wallet_transactions (
        agent_id, type, amount_ghs, description, reference, status
      ) VALUES (
        r.agent_id,
        'withdrawal_paid',
        -COALESCE(r.amount_ghs, 0),
        format('Withdrawal paid (backfill) — %s %s', COALESCE(r.momo_network,''), COALESCE(r.momo_number,'')),
        v_ref,
        'completed'
      );
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  -- Recompute total_withdrawn from source of truth
  UPDATE public.agent_wallets aw
  SET total_withdrawn = COALESCE(s.total, 0),
      updated_at = now()
  FROM (
    SELECT agent_id, SUM(amount_ghs) AS total
    FROM public.agent_withdrawals
    WHERE status = 'paid'
    GROUP BY agent_id
  ) s
  WHERE aw.agent_id = s.agent_id
    AND COALESCE(aw.total_withdrawn, 0) <> COALESCE(s.total, 0);
END $$;