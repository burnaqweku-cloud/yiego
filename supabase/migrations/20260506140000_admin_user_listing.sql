-- ─────────────────────────────────────────────────────────────────
-- Admin user listing RPCs
-- ─────────────────────────────────────────────────────────────────
-- The /admin/users page needs reliable read access to the profiles
-- table for admins and staff. RLS policies on profiles can sometimes
-- mis-evaluate (cached session, JIT auth.uid(), policy evaluation
-- order). To make the admin experience deterministic, we expose two
-- SECURITY DEFINER RPCs that explicitly authorise via
-- public.is_admin_or_staff() and then run the underlying query with
-- the function owner's privileges (bypassing RLS).
--
-- Functions:
--   admin_list_users(p_search, p_status, p_offset, p_limit)
--     → paginated user listing with wallet balance + agent status.
--       Returns total_count via a window function so the caller can
--       drive pagination from a single round-trip.
--
--   admin_user_stats()
--     → aggregate counts (total, active, suspended, agents, new 7d)
--       used to render the stat tiles at the top of /admin/users.
--
-- Both functions raise an exception if the caller is not an admin or
-- staff member, so they remain safe even though they bypass RLS.
-- ─────────────────────────────────────────────────────────────────

-- Drop legacy versions, if any, to allow signature changes.
DROP FUNCTION IF EXISTS public.admin_list_users(text, text, int, int);
DROP FUNCTION IF EXISTS public.admin_user_stats();

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  username text,
  avatar_url text,
  created_at timestamptz,
  suspended boolean,
  agent_status text,
  wallet_balance numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(coalesce(p_search, '')), '');
  v_status text := lower(coalesce(p_status, 'all'));
  v_seven_days_ago timestamptz := now() - interval '7 days';
BEGIN
  -- Authorisation gate
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Not authorised: admin or staff role required';
  END IF;

  -- Clamp limit + offset defensively
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 25; END IF;
  IF p_limit > 200 THEN p_limit := 200; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.phone,
    p.username,
    p.avatar_url,
    p.created_at,
    coalesce(p.suspended, false) AS suspended,
    a.status::text                   AS agent_status,
    coalesce(w.balance_ghs, 0)::numeric AS wallet_balance,
    count(*) OVER()::bigint          AS total_count
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT ag.status FROM public.agents ag WHERE ag.user_id = p.id LIMIT 1
  ) a ON true
  LEFT JOIN public.wallets w ON w.user_id = p.id
  WHERE
    (v_search IS NULL OR (
      coalesce(p.full_name, '') ILIKE '%' || v_search || '%' OR
      coalesce(p.email, '')     ILIKE '%' || v_search || '%' OR
      coalesce(p.phone, '')     ILIKE '%' || v_search || '%' OR
      coalesce(p.username, '')  ILIKE '%' || v_search || '%'
    ))
    AND CASE v_status
      WHEN 'active'    THEN coalesce(p.suspended, false) = false
      WHEN 'suspended' THEN p.suspended = true
      WHEN 'new'       THEN p.created_at >= v_seven_days_ago
      WHEN 'agents'    THEN a.status = 'active'
      ELSE TRUE
    END
  ORDER BY p.created_at DESC NULLS LAST
  OFFSET p_offset
  LIMIT  p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, int, int) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS TABLE (
  total bigint,
  active bigint,
  suspended bigint,
  agents bigint,
  new_week bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seven_days_ago timestamptz := now() - interval '7 days';
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Not authorised: admin or staff role required';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.profiles)::bigint                                                 AS total,
    (SELECT count(*) FROM public.profiles WHERE coalesce(suspended, false) = false)::bigint        AS active,
    (SELECT count(*) FROM public.profiles WHERE suspended = true)::bigint                          AS suspended,
    (SELECT count(*) FROM public.agents   WHERE status = 'active')::bigint                          AS agents,
    (SELECT count(*) FROM public.profiles WHERE created_at >= v_seven_days_ago)::bigint            AS new_week;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO authenticated;
