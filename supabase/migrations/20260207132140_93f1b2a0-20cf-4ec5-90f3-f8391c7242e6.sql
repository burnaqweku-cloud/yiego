
-- ============================================================
-- FIX 1: AGENTS - Remove broad public access, create secure RPC
-- ============================================================
-- Drop overly permissive public policy that exposes emails, phone, payment status
DROP POLICY IF EXISTS "Public can view active agents" ON public.agents;

-- Create a secure function returning ONLY store-facing fields
CREATE OR REPLACE FUNCTION public.get_public_agent_store(p_slug text)
RETURNS TABLE(
  id uuid,
  store_name text,
  store_slug text,
  store_description text,
  store_logo_url text,
  whatsapp_number text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.store_name, a.store_slug, a.store_description, a.store_logo_url, a.whatsapp_number, a.status
  FROM public.agents a
  WHERE a.store_slug = p_slug AND a.status = 'active'
  LIMIT 1;
$$;

-- ============================================================
-- FIX 2: AGENT_PRICING - Remove public read, create secure RPC
-- ============================================================
DROP POLICY IF EXISTS "Public can read agent pricing" ON public.agent_pricing;

-- Create a function that only returns pricing for a specific active agent
CREATE OR REPLACE FUNCTION public.get_agent_store_pricing(p_agent_id uuid)
RETURNS TABLE(
  id uuid,
  agent_id uuid,
  product_id uuid,
  network text,
  custom_price numeric,
  markup_percent numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ap.id, ap.agent_id, ap.product_id, ap.network, ap.custom_price, ap.markup_percent
  FROM public.agent_pricing ap
  INNER JOIN public.agents a ON a.id = ap.agent_id
  WHERE ap.agent_id = p_agent_id AND a.status = 'active';
$$;

-- ============================================================
-- FIX 3: SITE_SETTINGS - Restrict public access to safe keys only
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view settings" ON public.site_settings;

-- Public/anon can only read non-sensitive operational settings
CREATE POLICY "Public can view non-sensitive settings"
ON public.site_settings
FOR SELECT
USING (
  key IN ('system_online', 'system_status_message', 'agent_activation_fee', 'support_whatsapp', 'support_email')
);

-- Authenticated users can read all settings (needed for pricing display)
CREATE POLICY "Authenticated users can view all settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (true);
