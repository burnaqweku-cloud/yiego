
-- Add payout_gb column to reward_claims for incremental payout tracking
-- This stores the actual GB to deliver (milestone total minus previously paid)
ALTER TABLE public.reward_claims 
ADD COLUMN IF NOT EXISTS payout_gb numeric DEFAULT NULL;

-- Backfill existing delivered claims with correct incremental payout values
-- Based on the milestone gb_amount and delivery order
-- For existing data, we compute what the incremental would have been
DO $$
DECLARE
  r RECORD;
  v_total_paid numeric;
  v_gb_amount numeric;
BEGIN
  FOR r IN 
    SELECT rc.id, rc.user_id, rc.milestone_id, rc.status, rm.gb_amount
    FROM reward_claims rc
    JOIN reward_milestones rm ON rm.id = rc.milestone_id
    WHERE rc.payout_gb IS NULL
    ORDER BY rc.user_id, rm.sort_order
  LOOP
    -- Get total already paid for this user from earlier delivered claims
    SELECT COALESCE(SUM(rc2.payout_gb), 0) INTO v_total_paid
    FROM reward_claims rc2
    JOIN reward_milestones rm2 ON rm2.id = rc2.milestone_id
    WHERE rc2.user_id = r.user_id
      AND rc2.payout_gb IS NOT NULL
      AND rm2.sort_order < (SELECT sort_order FROM reward_milestones WHERE id = r.milestone_id);
    
    -- Compute incremental payout
    UPDATE reward_claims 
    SET payout_gb = GREATEST(0, r.gb_amount - v_total_paid)
    WHERE id = r.id;
  END LOOP;
END $$;
