-- ============================================================================
-- LOYALTY & REWARDS PROGRAM — Initial schema
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. loyalty_accounts (one per user)
-- ----------------------------------------------------------------------------
CREATE TABLE public.loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  points_balance integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  lifetime_points_earned integer NOT NULL DEFAULT 0,
  lifetime_points_redeemed integer NOT NULL DEFAULT 0,
  lifetime_spend_ghs numeric(12,2) NOT NULL DEFAULT 0,
  current_tier text NOT NULL DEFAULT 'bronze',
  tier_achieved_at timestamptz,
  birthday date,
  birthday_bonus_claimed_year integer,
  banned_from_program boolean NOT NULL DEFAULT false,
  banned_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_accounts_user_id ON public.loyalty_accounts(user_id);
CREATE INDEX idx_loyalty_accounts_tier ON public.loyalty_accounts(current_tier);

ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own loyalty account"
  ON public.loyalty_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all loyalty accounts"
  ON public.loyalty_accounts FOR SELECT
  USING (public.is_admin_or_staff());

CREATE POLICY "Admins update loyalty accounts"
  ON public.loyalty_accounts FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins insert loyalty accounts"
  ON public.loyalty_accounts FOR INSERT
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_loyalty_accounts_updated_at
  BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. point_transactions (append-only ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('earn','redeem','adjust','expire','reversal')),
  source text NOT NULL CHECK (source IN ('order','referral','signup_bonus','birthday','promo','manual','wallet_convert','direct_bundle','admin_adjust','expiry')),
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  reference_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_point_transactions_user_created ON public.point_transactions(user_id, created_at DESC);
CREATE INDEX idx_point_transactions_reference ON public.point_transactions(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_point_transactions_type ON public.point_transactions(type);
CREATE INDEX idx_point_transactions_source ON public.point_transactions(source);

-- Idempotency for order-based earns: prevent duplicate earn for same order
CREATE UNIQUE INDEX uq_point_tx_order_earn
  ON public.point_transactions(reference_id)
  WHERE type = 'earn' AND source = 'order' AND reference_id IS NOT NULL;

ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own point transactions"
  ON public.point_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all point transactions"
  ON public.point_transactions FOR SELECT
  USING (public.is_admin_or_staff());

-- No INSERT/UPDATE/DELETE policies for users — all writes via SECURITY DEFINER functions

-- ----------------------------------------------------------------------------
-- 3. loyalty_referral_codes
-- ----------------------------------------------------------------------------
CREATE TABLE public.loyalty_referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_referral_codes_code ON public.loyalty_referral_codes(upper(code));

ALTER TABLE public.loyalty_referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own loyalty referral code"
  ON public.loyalty_referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all loyalty referral codes"
  ON public.loyalty_referral_codes FOR SELECT
  USING (public.is_admin_or_staff());

CREATE POLICY "Admins manage loyalty referral codes"
  ON public.loyalty_referral_codes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. loyalty_referrals
-- ----------------------------------------------------------------------------
CREATE TABLE public.loyalty_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referee_id uuid NOT NULL UNIQUE,
  code_used text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected','expired')),
  first_order_id uuid,
  referrer_reward_points integer NOT NULL DEFAULT 200,
  referee_reward_ghs numeric(10,2) NOT NULL DEFAULT 2.00,
  rewards_issued_at timestamptz,
  rejection_reason text,
  device_fingerprint text,
  ip_address inet,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_referrals_referrer ON public.loyalty_referrals(referrer_id, created_at DESC);
CREATE INDEX idx_loyalty_referrals_referee ON public.loyalty_referrals(referee_id);
CREATE INDEX idx_loyalty_referrals_status ON public.loyalty_referrals(status);
CREATE INDEX idx_loyalty_referrals_device ON public.loyalty_referrals(device_fingerprint) WHERE device_fingerprint IS NOT NULL;
CREATE INDEX idx_loyalty_referrals_ip ON public.loyalty_referrals(ip_address) WHERE ip_address IS NOT NULL;

ALTER TABLE public.loyalty_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view referrals where they are referrer or referee"
  ON public.loyalty_referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

CREATE POLICY "Admins view all loyalty referrals"
  ON public.loyalty_referrals FOR SELECT
  USING (public.is_admin_or_staff());

CREATE POLICY "Admins manage loyalty referrals"
  ON public.loyalty_referrals FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_loyalty_referrals_updated_at
  BEFORE UPDATE ON public.loyalty_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. loyalty_redemptions
-- ----------------------------------------------------------------------------
CREATE TABLE public.loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('wallet_convert','direct_bundle')),
  points_used integer NOT NULL CHECK (points_used > 0),
  ghs_value numeric(10,2) NOT NULL CHECK (ghs_value >= 0),
  order_id uuid,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','reversed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_redemptions_user_created ON public.loyalty_redemptions(user_id, created_at DESC);
CREATE INDEX idx_loyalty_redemptions_status ON public.loyalty_redemptions(status);

ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own redemptions"
  ON public.loyalty_redemptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all redemptions"
  ON public.loyalty_redemptions FOR SELECT
  USING (public.is_admin_or_staff());

CREATE POLICY "Admins manage redemptions"
  ON public.loyalty_redemptions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. loyalty_tiers_config
-- ----------------------------------------------------------------------------
CREATE TABLE public.loyalty_tiers_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  min_lifetime_spend numeric(10,2) NOT NULL DEFAULT 0,
  point_multiplier numeric(4,2) NOT NULL DEFAULT 1.00,
  perks jsonb NOT NULL DEFAULT '[]'::jsonb,
  color_hex text NOT NULL DEFAULT '#CD7F32',
  icon_name text NOT NULL DEFAULT 'medal',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_tiers_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tiers"
  ON public.loyalty_tiers_config FOR SELECT
  USING (active = true OR public.is_admin_or_staff());

CREATE POLICY "Admins manage tiers"
  ON public.loyalty_tiers_config FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_loyalty_tiers_updated_at
  BEFORE UPDATE ON public.loyalty_tiers_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed tiers
INSERT INTO public.loyalty_tiers_config (tier_name, display_name, min_lifetime_spend, point_multiplier, perks, color_hex, icon_name, sort_order) VALUES
  ('bronze',   'Bronze',   0,    1.00, '["1 point per GHS spent","Birthday bonus","Access to all promotions"]'::jsonb,                                       '#CD7F32', 'medal',  1),
  ('silver',   'Silver',   500,  1.25, '["1.25 points per GHS","Birthday bonus","Priority support","Early access to promotions"]'::jsonb,                       '#C0C0C0', 'award',  2),
  ('gold',     'Gold',     2000, 1.50, '["1.5 points per GHS","Birthday bonus","Priority support","Exclusive bundle deals","Free monthly data top-up"]'::jsonb, '#FFD700', 'crown',  3),
  ('platinum', 'Platinum', 5000, 2.00, '["2 points per GHS","Birthday bonus","Concierge support","All exclusive deals","Free monthly data top-up","Early product access"]'::jsonb, '#7FB3D5', 'gem', 4);

-- ----------------------------------------------------------------------------
-- 7. loyalty_settings (single-row config)
-- ----------------------------------------------------------------------------
CREATE TABLE public.loyalty_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  points_per_ghs numeric(6,2) NOT NULL DEFAULT 1,
  points_to_ghs_rate numeric(6,2) NOT NULL DEFAULT 100, -- 100 points = 1 GHS
  referral_bonus_referrer_points integer NOT NULL DEFAULT 200,
  referral_bonus_referee_ghs numeric(10,2) NOT NULL DEFAULT 2.00,
  signup_bonus_points integer NOT NULL DEFAULT 50,
  birthday_bonus_points integer NOT NULL DEFAULT 100,
  min_order_ghs_for_points numeric(10,2) NOT NULL DEFAULT 5,
  max_redeem_percent_per_order integer NOT NULL DEFAULT 50 CHECK (max_redeem_percent_per_order BETWEEN 1 AND 100),
  max_referrals_per_month integer NOT NULL DEFAULT 20,
  points_expiry_months integer,
  program_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view loyalty settings"
  ON public.loyalty_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins update loyalty settings"
  ON public.loyalty_settings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins insert loyalty settings"
  ON public.loyalty_settings FOR INSERT
  WITH CHECK (public.is_admin());

-- Seed default settings
INSERT INTO public.loyalty_settings (id) VALUES (1);

-- ----------------------------------------------------------------------------
-- 8. loyalty_promotions
-- ----------------------------------------------------------------------------
CREATE TABLE public.loyalty_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  multiplier numeric(4,2) NOT NULL DEFAULT 1.00,
  bonus_points integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  applies_to text NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','tier','new_users')),
  tier_filter text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_loyalty_promotions_active_window ON public.loyalty_promotions(active, starts_at, ends_at);

ALTER TABLE public.loyalty_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active promotions"
  ON public.loyalty_promotions FOR SELECT
  USING (
    (active = true AND starts_at <= now() AND ends_at > now())
    OR public.is_admin_or_staff()
  );

CREATE POLICY "Admins manage promotions"
  ON public.loyalty_promotions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_loyalty_promotions_updated_at
  BEFORE UPDATE ON public.loyalty_promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 9. loyalty_audit_log (immutable)
-- ----------------------------------------------------------------------------
CREATE TABLE public.loyalty_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_audit_log_created ON public.loyalty_audit_log(created_at DESC);
CREATE INDEX idx_loyalty_audit_log_admin ON public.loyalty_audit_log(admin_user_id);
CREATE INDEX idx_loyalty_audit_log_target ON public.loyalty_audit_log(target_user_id) WHERE target_user_id IS NOT NULL;

ALTER TABLE public.loyalty_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view audit log"
  ON public.loyalty_audit_log FOR SELECT
  USING (public.is_admin_or_staff());

-- No UPDATE/DELETE policies — append-only via SECURITY DEFINER functions only