
-- Add referral qualification columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_source text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_order_qualified_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS qualified_first_order_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS referral_qualified boolean NOT NULL DEFAULT false;

-- Create referral_qualifications table
CREATE TABLE public.referral_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL,
  first_order_id text NOT NULL,
  amount numeric,
  network text,
  bundle text,
  order_source text,
  qualified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_referee_id UNIQUE (referee_id),
  CONSTRAINT uq_first_order_id UNIQUE (first_order_id)
);

-- Indexes
CREATE INDEX idx_rq_referrer_id ON public.referral_qualifications(referrer_id);
CREATE INDEX idx_rq_qualified_at ON public.referral_qualifications(qualified_at);

-- Enable RLS
ALTER TABLE public.referral_qualifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage referral qualifications"
  ON public.referral_qualifications FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin or staff can view all referral qualifications"
  ON public.referral_qualifications FOR SELECT
  USING (is_admin_or_staff());

CREATE POLICY "Users can view own referral qualifications as referrer"
  ON public.referral_qualifications FOR SELECT
  USING (referrer_id = auth.uid());
