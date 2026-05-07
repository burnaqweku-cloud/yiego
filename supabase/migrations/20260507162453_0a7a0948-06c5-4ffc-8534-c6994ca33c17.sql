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
    (SELECT count(*) FROM public.profiles p)::bigint                                                  AS total,
    (SELECT count(*) FROM public.profiles p WHERE coalesce(p.suspended, false) = false)::bigint      AS active,
    (SELECT count(*) FROM public.profiles p WHERE p.suspended = true)::bigint                        AS suspended,
    (SELECT count(*) FROM public.agents   a WHERE a.status = 'active')::bigint                       AS agents,
    (SELECT count(*) FROM public.profiles p WHERE p.created_at >= v_seven_days_ago)::bigint          AS new_week;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO authenticated;