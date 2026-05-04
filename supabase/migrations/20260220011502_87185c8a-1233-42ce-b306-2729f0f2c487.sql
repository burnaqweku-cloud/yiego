
-- Fix overly permissive RLS policies - restrict to service role via function checks
-- Drop the open policies and replace with better ones

DROP POLICY IF EXISTS "Service role can insert referral activity" ON public.referral_activity;
DROP POLICY IF EXISTS "Service role can update referral activity" ON public.referral_activity;
DROP POLICY IF EXISTS "Service role can insert referral rewards" ON public.referral_rewards;

-- These are managed exclusively by edge functions with service_role key
-- The edge functions bypass RLS entirely when using service_role, so these are not needed
-- The admin policy already covers all operations for admins

-- Verify referral_activity policies are correct
-- Users can view their own referrals (as referrer)
-- Admins can manage all
-- Edge functions use service_role which bypasses RLS entirely

-- Fix: Update claimable reward policy to be more specific
DROP POLICY IF EXISTS "Users can update own claimed reward" ON public.referral_rewards;

CREATE POLICY "Users can claim own claimable reward"
  ON public.referral_rewards FOR UPDATE
  USING (user_id = auth.uid() AND status = 'claimable')
  WITH CHECK (user_id = auth.uid() AND status = 'claimed');
