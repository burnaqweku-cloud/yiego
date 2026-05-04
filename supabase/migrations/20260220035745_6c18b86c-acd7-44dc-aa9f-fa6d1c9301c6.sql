
-- ====================================================
-- REWARD MILESTONES table
-- ====================================================
CREATE TABLE IF NOT EXISTS public.reward_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gb_amount NUMERIC NOT NULL,
  required_referrals INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Seed the five milestones
INSERT INTO public.reward_milestones (gb_amount, required_referrals, sort_order) VALUES
  (1,  5,  1),
  (2,  12, 2),
  (5,  30, 3),
  (7,  55, 4),
  (10, 90, 5)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.reward_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view milestones"
  ON public.reward_milestones FOR SELECT USING (true);

CREATE POLICY "Admins can manage milestones"
  ON public.reward_milestones FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ====================================================
-- REWARD CLAIMS table
-- ====================================================
CREATE TABLE IF NOT EXISTS public.reward_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  milestone_id UUID NOT NULL REFERENCES public.reward_milestones(id),
  network TEXT NOT NULL,
  phone TEXT NOT NULL,
  linked_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_admin'
    CHECK (status IN ('pending_admin','approved_processing','delivered','rejected','failed')),
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reward claims"
  ON public.reward_claims FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own reward claims"
  ON public.reward_claims FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pending claims"
  ON public.reward_claims FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending_admin');

CREATE POLICY "Admins can manage all reward claims"
  ON public.reward_claims FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Staff can view all reward claims"
  ON public.reward_claims FOR SELECT USING (is_admin_or_staff());

-- updated_at trigger
CREATE TRIGGER update_reward_claims_updated_at
  BEFORE UPDATE ON public.reward_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ====================================================
-- ADD order_type to orders table
-- ====================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'normal'
    CHECK (order_type IN ('normal','reward'));

-- Add milestone/claim link metadata to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reward_claim_id UUID REFERENCES public.reward_claims(id);
