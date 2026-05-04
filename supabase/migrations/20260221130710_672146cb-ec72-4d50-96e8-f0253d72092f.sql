
-- ==========================================
-- ANTI-ABUSE & ACCOUNT PROTECTION SCHEMA
-- ==========================================

-- 1. Add device_hash, registration_ip, referral_frozen to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS device_hash text,
  ADD COLUMN IF NOT EXISTS registration_ip text,
  ADD COLUMN IF NOT EXISTS referral_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_frozen_reason text,
  ADD COLUMN IF NOT EXISTS referral_terms_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_terms_accepted_at timestamptz;

-- 2. Add anti-abuse fields to referral_activity
ALTER TABLE public.referral_activity
  ADD COLUMN IF NOT EXISTS referee_device_hash text,
  ADD COLUMN IF NOT EXISTS referee_registration_ip text,
  ADD COLUMN IF NOT EXISTS referee_phone text,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_type text,
  ADD COLUMN IF NOT EXISTS admin_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS admin_decision text;

-- 3. Create referral_flags table
CREATE TABLE IF NOT EXISTS public.referral_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flag_type text NOT NULL,
  severity_level text NOT NULL DEFAULT 'medium',
  details jsonb,
  auto_flagged boolean NOT NULL DEFAULT true,
  reviewed_by_admin boolean NOT NULL DEFAULT false,
  admin_decision text,
  admin_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage referral flags"
  ON public.referral_flags FOR ALL
  USING (is_admin());

CREATE POLICY "Staff can view referral flags"
  ON public.referral_flags FOR SELECT
  USING (is_admin_or_staff());

-- 4. Add unique constraint on email (where not null and not empty)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL AND email != '';

-- 5. Soft enforcement for phone: validate at app layer, no unique index
-- (existing duplicates prevent unique constraint)

-- 6. Index for IP cluster detection
CREATE INDEX IF NOT EXISTS idx_profiles_registration_ip ON public.profiles (registration_ip) WHERE registration_ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_device_hash ON public.profiles (device_hash) WHERE device_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_activity_flagged ON public.referral_activity (flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_referral_flags_user ON public.referral_flags (user_id);
