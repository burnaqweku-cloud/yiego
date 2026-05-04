-- Performance indexes for referral page queries
-- 1. referral_activity lookups by referrer, ordered by time
CREATE INDEX IF NOT EXISTS idx_referral_activity_referrer_created 
  ON public.referral_activity (referrer_id, created_at DESC);

-- 2. reward_claims lookups by user
CREATE INDEX IF NOT EXISTS idx_reward_claims_user_id 
  ON public.reward_claims (user_id);

-- 3. referral_activity referee lookups (for enrichment)
CREATE INDEX IF NOT EXISTS idx_referral_activity_referee_id 
  ON public.referral_activity (referee_id);
