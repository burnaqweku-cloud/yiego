
CREATE OR REPLACE FUNCTION public.get_agent_store_subscription_expiry(p_agent_id uuid)
RETURNS TABLE(expiry_date timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.expiry_date
  FROM public.agent_subscriptions s
  INNER JOIN public.agents a ON a.id = s.agent_id
  WHERE s.agent_id = p_agent_id
    AND a.status = 'active'
  ORDER BY s.expiry_date DESC
  LIMIT 1;
$$;
