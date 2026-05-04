
CREATE OR REPLACE FUNCTION public.get_agent_effective_state(p_agent_id uuid)
RETURNS TABLE(
  effective_state text,
  expiry_date timestamptz,
  grace_end timestamptz,
  promo_end timestamptz,
  can_store_accept_orders boolean,
  can_use_bulk_orders boolean,
  has_agent_pricing boolean,
  days_remaining integer,
  hours_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_status text;
  v_expiry timestamptz;
  v_grace_end timestamptz;
  v_promo_end timestamptz;
  v_now timestamptz := now();
  v_state text;
  v_can_store boolean;
  v_can_bulk boolean;
  v_has_pricing boolean;
  v_days int;
  v_hours int;
  v_reminder_days int := 7;
  v_grace_hours int := 24;
  v_promo_hours int := 24;
BEGIN
  -- Get agent status
  SELECT a.status INTO v_agent_status
  FROM public.agents a
  WHERE a.id = p_agent_id;

  IF v_agent_status IS NULL THEN
    RETURN QUERY SELECT 
      'not_found'::text, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz,
      false, false, false, 0, 0;
    RETURN;
  END IF;

  -- If agent is not active (pending_review, approved, suspended, etc.)
  IF v_agent_status = 'approved' THEN
    RETURN QUERY SELECT 
      'approved_awaiting_activation'::text, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz,
      false, false, false, 0, 0;
    RETURN;
  END IF;

  IF v_agent_status = 'pending_review' THEN
    RETURN QUERY SELECT 
      'pending_review'::text, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz,
      false, false, false, 0, 0;
    RETURN;
  END IF;

  IF v_agent_status NOT IN ('active') THEN
    RETURN QUERY SELECT 
      v_agent_status::text, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz,
      false, false, false, 0, 0;
    RETURN;
  END IF;

  -- Agent is 'active' — check subscription
  SELECT s.expiry_date INTO v_expiry
  FROM public.agent_subscriptions s
  WHERE s.agent_id = p_agent_id
  ORDER BY s.expiry_date DESC
  LIMIT 1;

  IF v_expiry IS NULL THEN
    -- Active agent but no subscription record — fail-closed
    RETURN QUERY SELECT 
      'expired_standard'::text, NULL::timestamptz, NULL::timestamptz, NULL::timestamptz,
      false, false, false, 0, 0;
    RETURN;
  END IF;

  v_grace_end := v_expiry + (v_grace_hours || ' hours')::interval;
  v_promo_end := v_grace_end + (v_promo_hours || ' hours')::interval;

  IF v_now < v_expiry THEN
    v_days := GREATEST(0, EXTRACT(EPOCH FROM (v_expiry - v_now)) / 86400)::int;
    v_hours := GREATEST(0, EXTRACT(EPOCH FROM (v_expiry - v_now)) / 3600)::int;
    IF v_now >= (v_expiry - (v_reminder_days || ' days')::interval) THEN
      v_state := 'expiring_soon';
    ELSE
      v_state := 'active';
    END IF;
    v_can_store := true;
    v_can_bulk := true;
    v_has_pricing := true;
  ELSIF v_now <= v_grace_end THEN
    v_state := 'grace_period';
    v_days := 0;
    v_hours := GREATEST(0, EXTRACT(EPOCH FROM (v_grace_end - v_now)) / 3600)::int;
    v_can_store := true;
    v_can_bulk := true;
    v_has_pricing := true;
  ELSIF v_now <= v_promo_end THEN
    v_state := 'expired_promo';
    v_days := 0;
    v_hours := GREATEST(0, EXTRACT(EPOCH FROM (v_promo_end - v_now)) / 3600)::int;
    v_can_store := false;
    v_can_bulk := false;
    v_has_pricing := false;
  ELSE
    v_state := 'expired_standard';
    v_days := 0;
    v_hours := 0;
    v_can_store := false;
    v_can_bulk := false;
    v_has_pricing := false;
  END IF;

  RETURN QUERY SELECT 
    v_state, v_expiry, v_grace_end, v_promo_end,
    v_can_store, v_can_bulk, v_has_pricing,
    v_days, v_hours;
END;
$$;
