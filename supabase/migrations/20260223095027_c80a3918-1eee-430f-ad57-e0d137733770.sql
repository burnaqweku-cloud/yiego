CREATE OR REPLACE FUNCTION public.get_referral_usernames(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, username text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id AS user_id, p.username
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids);
$$;