
-- =====================================================
-- LOYALTY BACKEND: helpers, triggers, RPCs
-- =====================================================

-- Helper: generate unique 8-char referral code (no O/0/I/1/L)
CREATE OR REPLACE FUNCTION public.gen_loyalty_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempts int := 0;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.loyalty_referral_codes WHERE code = v_code) THEN
      RETURN v_code;
    END IF;
    v_attempts := v_attempts + 1;
    EXIT WHEN v_attempts > 10;
  END LOOP;
  -- Fallback: longer code
  RETURN v_code || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
END;
$$;

-- Helper: recompute tier from lifetime_spend_ghs
CREATE OR REPLACE FUNCTION public.compute_loyalty_tier(p_lifetime_spend numeric)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tier_name FROM public.loyalty_tiers_config
  WHERE active = true AND min_lifetime_spend <= COALESCE(p_lifetime_spend, 0)
  ORDER BY min_lifetime_spend DESC
  LIMIT 1;
$$;

-- Helper: get current tier multiplier for a user
CREATE OR REPLACE FUNCTION public.get_loyalty_tier_multiplier(p_tier text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(point_multiplier, 1.00)
  FROM public.loyalty_tiers_config
  WHERE tier_name = p_tier
  LIMIT 1;
$$;

-- Helper: write a point_transaction (we already store transactions inline via loyalty_accounts updates; here we use a side table point_transactions if missing, otherwise log to loyalty_audit_log)
-- For this build, we maintain a single ledger via loyalty_audit_log (action='point_txn') since point_transactions table was not created in phase 1.
-- To keep a clean ledger, create point_transactions table now.

CREATE TABLE IF NOT EXISTS public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('earn','redeem','adjust','expire','reversal','signup_bonus','birthday','referral')),
  source text NOT NULL CHECK (source IN ('order','referral','signup_bonus','birthday','promo','manual','wallet_convert','direct_bundle','admin_adjust','expire')),
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  reference_id uuid,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  admin_user_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_created ON public.point_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_transactions_reference ON public.point_transactions(reference_id);

ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own point transactions" ON public.point_transactions;
CREATE POLICY "Users view own point transactions" ON public.point_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all point transactions" ON public.point_transactions;
CREATE POLICY "Admins view all point transactions" ON public.point_transactions
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Service role inserts point transactions" ON public.point_transactions;
CREATE POLICY "Service role inserts point transactions" ON public.point_transactions
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- TRIGGER: on auth.users INSERT → create loyalty account, code, signup bonus
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_loyalty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signup_bonus int;
  v_program_active boolean;
  v_code text;
  v_account_id uuid;
  v_ref_code text;
  v_referrer_id uuid;
BEGIN
  -- Read settings (fail-safe defaults)
  SELECT signup_bonus_points, program_active
  INTO v_signup_bonus, v_program_active
  FROM public.loyalty_settings WHERE id = 1;

  v_signup_bonus := COALESCE(v_signup_bonus, 50);
  v_program_active := COALESCE(v_program_active, true);

  -- Create loyalty account (idempotent on user_id unique constraint if any; safe ON CONFLICT)
  BEGIN
    INSERT INTO public.loyalty_accounts (user_id, points_balance, lifetime_points_earned, current_tier)
    VALUES (
      NEW.id,
      CASE WHEN v_program_active THEN v_signup_bonus ELSE 0 END,
      CASE WHEN v_program_active THEN v_signup_bonus ELSE 0 END,
      'bronze'
    )
    RETURNING id INTO v_account_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_account_id FROM public.loyalty_accounts WHERE user_id = NEW.id;
  END;

  -- Generate referral code
  BEGIN
    v_code := public.gen_loyalty_referral_code();
    INSERT INTO public.loyalty_referral_codes (user_id, code) VALUES (NEW.id, v_code)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'handle_new_user_loyalty: code gen failed for % — %', NEW.id, SQLERRM;
  END;

  -- Log signup bonus transaction
  IF v_program_active AND v_signup_bonus > 0 AND v_account_id IS NOT NULL THEN
    INSERT INTO public.point_transactions (user_id, type, source, amount, balance_after, description)
    VALUES (NEW.id, 'signup_bonus', 'signup_bonus', v_signup_bonus, v_signup_bonus, 'Welcome bonus');
  END IF;

  -- If signup metadata contains a referral code → register pending referral
  v_ref_code := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'loyalty_ref_code', '')), '');
  IF v_ref_code IS NOT NULL THEN
    SELECT user_id INTO v_referrer_id
    FROM public.loyalty_referral_codes
    WHERE upper(code) = upper(v_ref_code) AND active = true
    LIMIT 1;

    IF v_referrer_id IS NOT NULL AND v_referrer_id <> NEW.id THEN
      INSERT INTO public.loyalty_referrals (referrer_id, referee_id, code_used, status)
      VALUES (v_referrer_id, NEW.id, upper(v_ref_code), 'pending')
      ON CONFLICT (referee_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user_loyalty failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Attach to auth.users (after handle_new_user)
DROP TRIGGER IF EXISTS on_auth_user_created_loyalty ON auth.users;
CREATE TRIGGER on_auth_user_created_loyalty
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_loyalty();

-- =====================================================
-- TRIGGER: on orders status='Delivered' → award points + complete pending referral
-- =====================================================
CREATE OR REPLACE FUNCTION public.award_loyalty_on_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric;
  v_min_order numeric;
  v_pts_per_ghs numeric;
  v_program_active boolean;
  v_tier_mult numeric := 1.00;
  v_promo_mult numeric := 1.00;
  v_promo_bonus int := 0;
  v_points int;
  v_account record;
  v_new_balance int;
  v_new_lifetime_spend numeric;
  v_old_tier text;
  v_new_tier text;
  v_already_awarded boolean;
  v_referral record;
  v_referee_reward numeric;
  v_referrer_reward int;
  v_referral_count int;
  v_max_referrals int;
BEGIN
  -- Trigger only on transition into Delivered
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.status <> 'Delivered' THEN RETURN NEW; END IF;
  IF OLD.status = 'Delivered' THEN RETURN NEW; END IF;

  v_user_id := NEW.user_id;
  v_amount := COALESCE(NEW.amount_ghs, 0);
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  -- Idempotency: already awarded for this order?
  SELECT EXISTS (
    SELECT 1 FROM public.point_transactions
    WHERE reference_id = NEW.id AND source = 'order' AND type = 'earn'
  ) INTO v_already_awarded;
  IF v_already_awarded THEN RETURN NEW; END IF;

  -- Settings
  SELECT min_order_ghs_for_points, points_per_ghs, program_active
  INTO v_min_order, v_pts_per_ghs, v_program_active
  FROM public.loyalty_settings WHERE id = 1;

  IF NOT COALESCE(v_program_active, true) THEN RETURN NEW; END IF;
  IF v_amount < COALESCE(v_min_order, 5) THEN RETURN NEW; END IF;

  -- Tier multiplier
  SELECT current_tier INTO v_old_tier FROM public.loyalty_accounts WHERE user_id = v_user_id;
  v_old_tier := COALESCE(v_old_tier, 'bronze');
  v_tier_mult := COALESCE(public.get_loyalty_tier_multiplier(v_old_tier), 1.00);

  -- Active promo (most recent overlapping all-applicable)
  SELECT COALESCE(multiplier, 1), COALESCE(bonus_points, 0)
  INTO v_promo_mult, v_promo_bonus
  FROM public.loyalty_promotions
  WHERE active = true
    AND now() BETWEEN starts_at AND ends_at
    AND (applies_to = 'all' OR (applies_to = 'tier' AND tier_filter = v_old_tier))
  ORDER BY created_at DESC
  LIMIT 1;
  v_promo_mult := COALESCE(v_promo_mult, 1.00);
  v_promo_bonus := COALESCE(v_promo_bonus, 0);

  v_points := floor(v_amount * COALESCE(v_pts_per_ghs, 1) * v_tier_mult * v_promo_mult)::int + v_promo_bonus;
  IF v_points <= 0 THEN RETURN NEW; END IF;

  -- Lock account row, update
  SELECT * INTO v_account FROM public.loyalty_accounts WHERE user_id = v_user_id FOR UPDATE;

  IF v_account.id IS NULL THEN
    -- create on-the-fly
    INSERT INTO public.loyalty_accounts (user_id, points_balance, lifetime_points_earned, lifetime_spend_ghs, current_tier)
    VALUES (v_user_id, v_points, v_points, v_amount, 'bronze')
    RETURNING * INTO v_account;
    v_new_balance := v_points;
    v_new_lifetime_spend := v_amount;
  ELSE
    v_new_balance := v_account.points_balance + v_points;
    v_new_lifetime_spend := v_account.lifetime_spend_ghs + v_amount;
    UPDATE public.loyalty_accounts
    SET points_balance = v_new_balance,
        lifetime_points_earned = lifetime_points_earned + v_points,
        lifetime_spend_ghs = v_new_lifetime_spend,
        updated_at = now()
    WHERE id = v_account.id;
  END IF;

  -- Tier upgrade?
  v_new_tier := public.compute_loyalty_tier(v_new_lifetime_spend);
  IF v_new_tier IS NOT NULL AND v_new_tier <> v_old_tier THEN
    UPDATE public.loyalty_accounts
    SET current_tier = v_new_tier, tier_achieved_at = now()
    WHERE id = v_account.id;
  END IF;

  -- Ledger
  INSERT INTO public.point_transactions (user_id, type, source, amount, balance_after, reference_id, description, metadata)
  VALUES (v_user_id, 'earn', 'order', v_points, v_new_balance, NEW.id,
    format('Earned from order %s', COALESCE(NEW.order_id, NEW.id::text)),
    jsonb_build_object(
      'order_amount', v_amount,
      'tier', v_old_tier,
      'tier_multiplier', v_tier_mult,
      'promo_multiplier', v_promo_mult,
      'promo_bonus', v_promo_bonus
    ));

  -- Pending referral completion (if this is referee's first delivered order)
  SELECT * INTO v_referral
  FROM public.loyalty_referrals
  WHERE referee_id = v_user_id AND status = 'pending'
  LIMIT 1;

  IF v_referral.id IS NOT NULL THEN
    SELECT max_referrals_per_month, referral_bonus_referrer_points, referral_bonus_referee_ghs
    INTO v_max_referrals, v_referrer_reward, v_referee_reward
    FROM public.loyalty_settings WHERE id = 1;

    SELECT count(*) INTO v_referral_count
    FROM public.loyalty_referrals
    WHERE referrer_id = v_referral.referrer_id
      AND status = 'completed'
      AND rewards_issued_at > now() - interval '30 days';

    IF v_referral_count >= COALESCE(v_max_referrals, 20) THEN
      UPDATE public.loyalty_referrals
      SET status = 'rejected', rejection_reason = 'monthly_cap', updated_at = now()
      WHERE id = v_referral.id;
    ELSE
      -- Award referrer points
      UPDATE public.loyalty_accounts
      SET points_balance = points_balance + COALESCE(v_referrer_reward, 200),
          lifetime_points_earned = lifetime_points_earned + COALESCE(v_referrer_reward, 200),
          updated_at = now()
      WHERE user_id = v_referral.referrer_id;

      INSERT INTO public.point_transactions (user_id, type, source, amount, balance_after, reference_id, description)
      SELECT v_referral.referrer_id, 'earn', 'referral', COALESCE(v_referrer_reward, 200),
        points_balance, v_referral.id, format('Referral reward — friend joined and ordered')
      FROM public.loyalty_accounts WHERE user_id = v_referral.referrer_id;

      UPDATE public.loyalty_referrals
      SET status = 'completed',
          first_order_id = NEW.id,
          rewards_issued_at = now(),
          referrer_reward_points = COALESCE(v_referrer_reward, 200),
          referee_reward_ghs = COALESCE(v_referee_reward, 2.00),
          updated_at = now()
      WHERE id = v_referral.id;

      -- Note: GHS wallet credit for referee handled by client/edge function (existing wallet system)
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'award_loyalty_on_order_delivered failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_on_order_delivered ON public.orders;
CREATE TRIGGER trg_loyalty_on_order_delivered
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.award_loyalty_on_order_delivered();

-- Also award on agent_orders delivered (use customer_phone matched to a profile? skip — agent orders aren't tied to a customer account).
-- Agent orders are sales for resellers; loyalty applies only to direct platform customers.

-- =====================================================
-- RPC: redeem_loyalty_points
-- =====================================================
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_points int,
  p_type text,             -- 'wallet_convert' | 'direct_bundle'
  p_bundle_amount numeric DEFAULT NULL  -- required for direct_bundle: GHS price
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_account record;
  v_settings record;
  v_ghs numeric;
  v_max_redeem numeric;
  v_redemption_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  IF p_type NOT IN ('wallet_convert','direct_bundle') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TYPE');
  END IF;

  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  SELECT * INTO v_settings FROM public.loyalty_settings WHERE id = 1;
  IF NOT COALESCE(v_settings.program_active, true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROGRAM_PAUSED');
  END IF;

  -- Lock account row
  SELECT * INTO v_account FROM public.loyalty_accounts WHERE user_id = v_user_id FOR UPDATE;
  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACCOUNT');
  END IF;

  IF COALESCE(v_account.banned_from_program, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'BANNED');
  END IF;

  IF v_account.points_balance < p_points THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS');
  END IF;

  v_ghs := round((p_points::numeric / COALESCE(v_settings.points_to_ghs_rate, 100))::numeric, 2);

  -- Bundle redemption cap
  IF p_type = 'direct_bundle' THEN
    IF p_bundle_amount IS NULL OR p_bundle_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'BUNDLE_AMOUNT_REQUIRED');
    END IF;
    v_max_redeem := p_bundle_amount * (COALESCE(v_settings.max_redeem_percent_per_order, 50)::numeric / 100);
    IF v_ghs > v_max_redeem THEN
      RETURN jsonb_build_object('success', false, 'error', 'EXCEEDS_REDEEM_CAP',
        'message', format('Max redemption is %s%% of bundle price', COALESCE(v_settings.max_redeem_percent_per_order, 50)));
    END IF;
  END IF;

  -- Deduct points
  UPDATE public.loyalty_accounts
  SET points_balance = points_balance - p_points,
      lifetime_points_redeemed = lifetime_points_redeemed + p_points,
      updated_at = now()
  WHERE id = v_account.id;

  -- Record redemption
  INSERT INTO public.loyalty_redemptions (user_id, type, points_used, ghs_value, status)
  VALUES (v_user_id, p_type, p_points, v_ghs, 'completed')
  RETURNING id INTO v_redemption_id;

  -- Ledger
  INSERT INTO public.point_transactions (user_id, type, source, amount, balance_after, reference_id, description)
  VALUES (v_user_id, 'redeem', p_type, -p_points, v_account.points_balance - p_points, v_redemption_id,
    CASE WHEN p_type = 'wallet_convert' THEN format('Redeemed %s points → GHS %s wallet credit', p_points, v_ghs)
         ELSE format('Redeemed %s points → GHS %s toward bundle', p_points, v_ghs) END);

  -- Wallet credit (for wallet_convert)
  IF p_type = 'wallet_convert' THEN
    -- Try existing wallets table; structure: wallets(user_id, balance_ghs, ...)
    UPDATE public.wallets
    SET balance_ghs = balance_ghs + v_ghs, updated_at = now()
    WHERE user_id = v_user_id;
    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance_ghs) VALUES (v_user_id, v_ghs);
    END IF;

    INSERT INTO public.wallet_transactions (user_id, type, amount_ghs, description, reference, status)
    VALUES (v_user_id, 'loyalty_credit', v_ghs,
      format('Loyalty redemption — %s points', p_points),
      format('loyalty-%s', v_redemption_id), 'completed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'points_used', p_points,
    'ghs_value', v_ghs,
    'new_balance', v_account.points_balance - p_points
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'redeem_loyalty_points error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', 'SERVER_ERROR', 'message', SQLERRM);
END;
$$;

-- =====================================================
-- RPC: admin_adjust_loyalty_points
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_loyalty_points(
  p_target_user_id uuid,
  p_delta int,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_account record;
  v_before jsonb;
  v_after jsonb;
  v_new_balance int;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_ADMIN');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'REASON_TOO_SHORT', 'message', 'Reason must be at least 10 characters');
  END IF;

  SELECT * INTO v_account FROM public.loyalty_accounts WHERE user_id = p_target_user_id FOR UPDATE;
  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACCOUNT');
  END IF;

  v_new_balance := v_account.points_balance + p_delta;
  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'WOULD_GO_NEGATIVE');
  END IF;

  v_before := jsonb_build_object('points_balance', v_account.points_balance);

  UPDATE public.loyalty_accounts
  SET points_balance = v_new_balance,
      lifetime_points_earned = CASE WHEN p_delta > 0 THEN lifetime_points_earned + p_delta ELSE lifetime_points_earned END,
      updated_at = now()
  WHERE id = v_account.id;

  v_after := jsonb_build_object('points_balance', v_new_balance);

  INSERT INTO public.point_transactions (user_id, type, source, amount, balance_after, description, admin_user_id, metadata)
  VALUES (p_target_user_id, 'adjust', 'admin_adjust', p_delta, v_new_balance,
    format('Admin adjustment: %s', p_reason), v_admin_id, jsonb_build_object('reason', p_reason));

  INSERT INTO public.loyalty_audit_log (admin_user_id, action, target_user_id, before_state, after_state, reason)
  VALUES (v_admin_id, 'adjust_points', p_target_user_id, v_before, v_after, p_reason);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- =====================================================
-- Daily-callable: birthday bonus
-- =====================================================
CREATE OR REPLACE FUNCTION public.run_loyalty_birthday_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus int;
  v_year int := extract(year from now())::int;
  v_count int := 0;
  r record;
BEGIN
  IF NOT public.is_admin() THEN
    -- allow service role too (no auth.uid)
    IF auth.uid() IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'NOT_ADMIN');
    END IF;
  END IF;

  SELECT birthday_bonus_points INTO v_bonus FROM public.loyalty_settings WHERE id = 1;
  v_bonus := COALESCE(v_bonus, 100);

  FOR r IN
    SELECT id, user_id, points_balance
    FROM public.loyalty_accounts
    WHERE birthday IS NOT NULL
      AND extract(month from birthday) = extract(month from now())
      AND extract(day from birthday) = extract(day from now())
      AND COALESCE(birthday_bonus_claimed_year, 0) <> v_year
      AND COALESCE(banned_from_program, false) = false
  LOOP
    UPDATE public.loyalty_accounts
    SET points_balance = points_balance + v_bonus,
        lifetime_points_earned = lifetime_points_earned + v_bonus,
        birthday_bonus_claimed_year = v_year,
        updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.point_transactions (user_id, type, source, amount, balance_after, description)
    VALUES (r.user_id, 'birthday', 'birthday', v_bonus, r.points_balance + v_bonus, 'Happy Birthday! 🎂');

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'awarded_count', v_count);
END;
$$;

-- =====================================================
-- Daily-callable: expire old points (only if expiry months set)
-- =====================================================
CREATE OR REPLACE FUNCTION public.run_loyalty_points_expiry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months int;
  v_cutoff timestamptz;
  v_count int := 0;
  r record;
  v_expire_amount int;
BEGIN
  SELECT points_expiry_months INTO v_months FROM public.loyalty_settings WHERE id = 1;
  IF v_months IS NULL OR v_months <= 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'expiry_disabled');
  END IF;

  v_cutoff := now() - (v_months || ' months')::interval;

  FOR r IN
    SELECT user_id,
           SUM(CASE WHEN type IN ('earn','signup_bonus','birthday','referral') THEN amount ELSE 0 END) AS earned_old,
           SUM(CASE WHEN type IN ('redeem','expire') THEN -amount ELSE 0 END) AS used_old
    FROM public.point_transactions
    WHERE created_at < v_cutoff
    GROUP BY user_id
  LOOP
    v_expire_amount := GREATEST(0, COALESCE(r.earned_old, 0) - COALESCE(r.used_old, 0));
    IF v_expire_amount > 0 THEN
      UPDATE public.loyalty_accounts
      SET points_balance = GREATEST(0, points_balance - v_expire_amount), updated_at = now()
      WHERE user_id = r.user_id;

      INSERT INTO public.point_transactions (user_id, type, source, amount, balance_after, description)
      SELECT r.user_id, 'expire', 'expire', -v_expire_amount, points_balance, format('%s old points expired', v_expire_amount)
      FROM public.loyalty_accounts WHERE user_id = r.user_id;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired_users', v_count);
END;
$$;

-- =====================================================
-- Public: lookup referral code (for signup form)
-- =====================================================
CREATE OR REPLACE FUNCTION public.resolve_loyalty_referral_code(p_code text)
RETURNS TABLE(referrer_user_id uuid, valid boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, true
  FROM public.loyalty_referral_codes
  WHERE upper(code) = upper(p_code) AND active = true
  LIMIT 1;
$$;
