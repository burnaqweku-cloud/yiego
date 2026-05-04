-- Phase 2: Referral system supporting indexes and helper function
-- All additive — no changes to existing tables/functions.

-- Index to make worker scans of pending referrals fast
CREATE INDEX IF NOT EXISTS idx_telegram_referrals_pending_referee
  ON public.telegram_referrals (referee_chat_id)
  WHERE status = 'pending';

-- Index for retroactive sweep when a referrer links late
CREATE INDEX IF NOT EXISTS idx_telegram_referrals_qualified_unlinked
  ON public.telegram_referrals (referrer_chat_id)
  WHERE status = 'qualified';

-- Index for finding referrals by referee_user_id (worker join)
CREATE INDEX IF NOT EXISTS idx_telegram_referrals_referee_user
  ON public.telegram_referrals (referee_user_id)
  WHERE referee_user_id IS NOT NULL;

-- Helper RPC: atomically claim a pending referral by flipping status.
-- Returns the row if the caller successfully claimed it, NULL otherwise.
-- This is the single-tick lock that makes the worker safe to run twice
-- in the same minute on the same row without double-granting points.
CREATE OR REPLACE FUNCTION public.claim_telegram_referral(
  p_referral_id uuid,
  p_qualifying_order_id text,
  p_referee_user_id uuid
)
RETURNS TABLE (
  id uuid,
  referrer_user_id uuid,
  referrer_chat_id bigint,
  referee_chat_id bigint,
  referee_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.telegram_referrals tr
  SET status = 'qualified',
      qualifying_order_id = p_qualifying_order_id,
      qualified_at = now(),
      referee_user_id = COALESCE(tr.referee_user_id, p_referee_user_id)
  WHERE tr.id = p_referral_id
    AND tr.status = 'pending'
  RETURNING tr.id, tr.referrer_user_id, tr.referrer_chat_id, tr.referee_chat_id, tr.referee_user_id;
END;
$$;

-- Mark a qualified referral as rewarded (final state, idempotent CAS)
CREATE OR REPLACE FUNCTION public.mark_telegram_referral_rewarded(
  p_referral_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.telegram_referrals
  SET status = 'rewarded',
      rewarded_at = now()
  WHERE id = p_referral_id
    AND status = 'qualified';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Restrict execute to service role only (anon/authenticated cannot run these)
REVOKE EXECUTE ON FUNCTION public.claim_telegram_referral(uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_telegram_referral_rewarded(uuid) FROM anon, authenticated;