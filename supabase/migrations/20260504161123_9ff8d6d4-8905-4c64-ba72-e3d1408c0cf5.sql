
-- ============= Additive columns =============
ALTER TABLE public.campaign_banners
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID,
  ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT 'popup',
  ADD COLUMN IF NOT EXISTS badge_text TEXT,
  ADD COLUMN IF NOT EXISTS icon_type TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS targeting_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS conversion_goal TEXT,
  ADD COLUMN IF NOT EXISTS reset_frequency_at TIMESTAMPTZ;

ALTER TABLE public.campaign_banner_events
  ADD COLUMN IF NOT EXISTS device_type TEXT;

-- Hide archived banners from public read policy (additive: replace existing public read)
DROP POLICY IF EXISTS "Public read enabled banners" ON public.campaign_banners;
CREATE POLICY "Public read enabled banners"
ON public.campaign_banners FOR SELECT
TO anon, authenticated
USING (is_enabled = true AND archived_at IS NULL);

-- ============= Analytics RPC =============
CREATE OR REPLACE FUNCTION public.get_campaign_banner_analytics()
RETURNS TABLE (
  banner_id UUID,
  views BIGINT,
  unique_views BIGINT,
  clicks BIGINT,
  dismissals BIGINT,
  ctr NUMERIC,
  dismissal_rate NUMERIC,
  views_today BIGINT,
  clicks_today BIGINT,
  views_7d BIGINT,
  clicks_7d BIGINT,
  last_viewed_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    b.id AS banner_id,
    COALESCE(SUM(CASE WHEN e.event_type = 'viewed' THEN 1 ELSE 0 END), 0)::BIGINT AS views,
    COUNT(DISTINCT CASE WHEN e.event_type='viewed' THEN COALESCE(e.user_id::text, e.anonymous_id) END)::BIGINT AS unique_views,
    COALESCE(SUM(CASE WHEN e.event_type = 'clicked' THEN 1 ELSE 0 END), 0)::BIGINT AS clicks,
    COALESCE(SUM(CASE WHEN e.event_type = 'dismissed' THEN 1 ELSE 0 END), 0)::BIGINT AS dismissals,
    CASE WHEN SUM(CASE WHEN e.event_type='viewed' THEN 1 ELSE 0 END) > 0
      THEN ROUND( (SUM(CASE WHEN e.event_type='clicked' THEN 1 ELSE 0 END)::NUMERIC
        / SUM(CASE WHEN e.event_type='viewed' THEN 1 ELSE 0 END)) * 100, 2)
      ELSE 0 END AS ctr,
    CASE WHEN SUM(CASE WHEN e.event_type='viewed' THEN 1 ELSE 0 END) > 0
      THEN ROUND( (SUM(CASE WHEN e.event_type='dismissed' THEN 1 ELSE 0 END)::NUMERIC
        / SUM(CASE WHEN e.event_type='viewed' THEN 1 ELSE 0 END)) * 100, 2)
      ELSE 0 END AS dismissal_rate,
    COALESCE(SUM(CASE WHEN e.event_type='viewed' AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra' THEN 1 ELSE 0 END), 0)::BIGINT AS views_today,
    COALESCE(SUM(CASE WHEN e.event_type='clicked' AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Accra') AT TIME ZONE 'Africa/Accra' THEN 1 ELSE 0 END), 0)::BIGINT AS clicks_today,
    COALESCE(SUM(CASE WHEN e.event_type='viewed' AND e.created_at >= now() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0)::BIGINT AS views_7d,
    COALESCE(SUM(CASE WHEN e.event_type='clicked' AND e.created_at >= now() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0)::BIGINT AS clicks_7d,
    MAX(CASE WHEN e.event_type='viewed' THEN e.created_at END) AS last_viewed_at,
    MAX(CASE WHEN e.event_type='clicked' THEN e.created_at END) AS last_clicked_at
  FROM public.campaign_banners b
  LEFT JOIN public.campaign_banner_events e ON e.banner_id = b.id
  GROUP BY b.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_banner_analytics() TO authenticated;

-- ============= Per-user eligibility summary =============
CREATE OR REPLACE FUNCTION public.get_banner_user_eligibility_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  result JSONB;
  account_age INT := 0;
  total_orders INT := 0;
  wallet_balance NUMERIC := 0;
  is_active_agent BOOLEAN := false;
  is_expired_agent BOOLEAN := false;
  sub_expiring BOOLEAN := false;
  agent_state JSONB;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('is_logged_in', false);
  END IF;

  SELECT GREATEST(0, EXTRACT(DAY FROM now() - created_at)::INT)
    INTO account_age
    FROM public.profiles WHERE id = uid;

  SELECT COUNT(*) INTO total_orders FROM public.orders WHERE user_id = uid;
  SELECT COALESCE(balance_ghs, 0) INTO wallet_balance FROM public.wallets WHERE user_id = uid;

  BEGIN
    agent_state := public.get_agent_effective_state(uid);
    is_active_agent := COALESCE((agent_state->>'is_active')::boolean, false);
    is_expired_agent := COALESCE((agent_state->>'is_expired')::boolean, false);
    -- expiring soon: <= 5 days
    IF agent_state ? 'expires_at' AND (agent_state->>'expires_at') IS NOT NULL THEN
      sub_expiring := ((agent_state->>'expires_at')::timestamptz - now()) < INTERVAL '5 days'
                      AND ((agent_state->>'expires_at')::timestamptz - now()) > INTERVAL '0 seconds';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    is_active_agent := false;
  END;

  result := jsonb_build_object(
    'is_logged_in', true,
    'is_active_agent', is_active_agent,
    'is_expired_agent', is_expired_agent,
    'account_age_days', account_age,
    'total_orders', total_orders,
    'has_orders', total_orders > 0,
    'wallet_balance', wallet_balance,
    'subscription_expiring_soon', sub_expiring
  );
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_banner_user_eligibility_summary() TO authenticated;

-- ============= Admin reset frequency (bump version) =============
CREATE OR REPLACE FUNCTION public.reset_campaign_banner_frequency(p_banner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.campaign_banners
  SET version = COALESCE(version, 1) + 1,
      reset_frequency_at = now()
  WHERE id = p_banner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_campaign_banner_frequency(UUID) TO authenticated;
