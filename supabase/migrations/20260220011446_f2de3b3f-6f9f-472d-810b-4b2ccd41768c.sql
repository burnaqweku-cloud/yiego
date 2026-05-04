
-- ============================================================
-- REFERRAL CAMPAIGN SYSTEM
-- ============================================================

-- 1. Add referral fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_success_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_signup_count INTEGER NOT NULL DEFAULT 0;

-- 2. Auto-generate referral codes for existing profiles
UPDATE public.profiles
SET referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- 3. Make referral_code NOT NULL after populating
ALTER TABLE public.profiles
  ALTER COLUMN referral_code SET NOT NULL;

-- 4. Create referral_activity table
CREATE TABLE IF NOT EXISTS public.referral_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL,
  referee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'successful')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  first_success_order_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (referee_id) -- Each referee can only count toward one referrer
);

-- 5. Create referral_rewards table
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT '1GB_voucher' CHECK (type IN ('1GB_voucher')),
  status TEXT NOT NULL DEFAULT 'claimable' CHECK (status IN ('locked', 'claimable', 'claimed', 'revoked')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by UUID,
  revoke_reason TEXT
);

-- 6. Create referral_campaign_settings table
CREATE TABLE IF NOT EXISTS public.referral_campaign_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT true,
  required_referrals INTEGER NOT NULL DEFAULT 5,
  reward_type TEXT NOT NULL DEFAULT '1GB_voucher',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Insert default campaign settings
INSERT INTO public.referral_campaign_settings (active, required_referrals, reward_type)
VALUES (true, 5, '1GB_voucher')
ON CONFLICT DO NOTHING;

-- 7. Enable RLS
ALTER TABLE public.referral_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_campaign_settings ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for referral_activity
CREATE POLICY "Users can view own referral activity"
  ON public.referral_activity FOR SELECT
  USING (referrer_id = auth.uid());

CREATE POLICY "Admin or staff can view all referral activity"
  ON public.referral_activity FOR SELECT
  USING (is_admin_or_staff());

CREATE POLICY "Admin can manage referral activity"
  ON public.referral_activity FOR ALL
  USING (is_admin());

-- Service role inserts (edge functions)
CREATE POLICY "Service role can insert referral activity"
  ON public.referral_activity FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update referral activity"
  ON public.referral_activity FOR UPDATE
  USING (true);

-- 9. RLS Policies for referral_rewards
CREATE POLICY "Users can view own referral rewards"
  ON public.referral_rewards FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin or staff can view all referral rewards"
  ON public.referral_rewards FOR SELECT
  USING (is_admin_or_staff());

CREATE POLICY "Admin can manage referral rewards"
  ON public.referral_rewards FOR ALL
  USING (is_admin());

CREATE POLICY "Service role can insert referral rewards"
  ON public.referral_rewards FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own claimed reward"
  ON public.referral_rewards FOR UPDATE
  USING (user_id = auth.uid() AND status = 'claimable');

-- 10. RLS Policies for campaign settings
CREATE POLICY "Anyone can view campaign settings"
  ON public.referral_campaign_settings FOR SELECT
  USING (true);

CREATE POLICY "Admin can manage campaign settings"
  ON public.referral_campaign_settings FOR ALL
  USING (is_admin());

-- 11. Updated_at trigger for referral_activity
CREATE TRIGGER update_referral_activity_updated_at
  BEFORE UPDATE ON public.referral_activity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Function to auto-generate referral code on profile creation
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_attempts INTEGER := 0;
BEGIN
  IF NEW.referral_code IS NULL THEN
    LOOP
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code) THEN
        NEW.referral_code := v_code;
        EXIT;
      END IF;
      v_attempts := v_attempts + 1;
      IF v_attempts > 10 THEN
        NEW.referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_generate_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_referral_code();

-- 13. Function to look up referral code → user_id (security definer, public access)
CREATE OR REPLACE FUNCTION public.resolve_referral_code(p_code TEXT)
RETURNS TABLE(user_id UUID, username TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, username
  FROM public.profiles
  WHERE upper(referral_code) = upper(p_code)
  LIMIT 1;
$$;
