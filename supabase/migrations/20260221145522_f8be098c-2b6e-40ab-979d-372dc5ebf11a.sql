
-- =============================================
-- PHASE 1: Security Infrastructure Tables
-- =============================================

-- A) security_blocks table
CREATE TABLE IF NOT EXISTS public.security_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_type text NOT NULL CHECK (block_type IN ('ip', 'device', 'phone', 'email')),
  block_value text NOT NULL,
  reason text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  notes text
);

-- Unique active block per type+value
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_blocks_active
  ON public.security_blocks (block_type, block_value) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_security_blocks_lookup
  ON public.security_blocks (block_type, block_value);

ALTER TABLE public.security_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or staff can view security blocks"
  ON public.security_blocks FOR SELECT
  USING (is_admin_or_staff());

CREATE POLICY "Admins can manage security blocks"
  ON public.security_blocks FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- B) security_events table
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  ip text,
  device_hash text,
  user_agent text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user
  ON public.security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type
  ON public.security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip
  ON public.security_events (ip) WHERE ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_device
  ON public.security_events (device_hash) WHERE device_hash IS NOT NULL;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or staff can view security events"
  ON public.security_events FOR SELECT
  USING (is_admin_or_staff());

CREATE POLICY "Admins can insert security events"
  ON public.security_events FOR INSERT
  WITH CHECK (is_admin_or_staff());

-- C) Add banned_by to profiles (if missing)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_by uuid;

-- D) check_security_access RPC function
CREATE OR REPLACE FUNCTION public.check_security_access(
  p_user_id uuid DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_device_hash text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked boolean := false;
  v_block_type text := NULL;
  v_message text := NULL;
  v_is_suspended boolean;
  v_suspended_reason text;
  v_block_record record;
BEGIN
  -- 1. Check user ban status
  IF p_user_id IS NOT NULL THEN
    SELECT suspended, suspended_reason
    INTO v_is_suspended, v_suspended_reason
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_is_suspended = true THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'block_type', 'user_banned',
        'message', 'Your account has been suspended. Contact support for assistance.'
      );
    END IF;
  END IF;

  -- 2. Check IP block
  IF p_ip IS NOT NULL AND p_ip != '' THEN
    SELECT * INTO v_block_record
    FROM public.security_blocks
    WHERE block_type = 'ip'
      AND block_value = p_ip
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'block_type', 'ip',
        'message', 'Your access has been restricted.'
      );
    END IF;
  END IF;

  -- 3. Check device block
  IF p_device_hash IS NOT NULL AND p_device_hash != '' THEN
    SELECT * INTO v_block_record
    FROM public.security_blocks
    WHERE block_type = 'device'
      AND block_value = lower(p_device_hash)
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'block_type', 'device',
        'message', 'Your access has been restricted.'
      );
    END IF;
  END IF;

  -- 4. Check phone block
  IF p_phone IS NOT NULL AND p_phone != '' THEN
    SELECT * INTO v_block_record
    FROM public.security_blocks
    WHERE block_type = 'phone'
      AND block_value = p_phone
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'block_type', 'phone',
        'message', 'Access restricted. Contact support.'
      );
    END IF;
  END IF;

  -- 5. Check email block
  IF p_email IS NOT NULL AND p_email != '' THEN
    SELECT * INTO v_block_record
    FROM public.security_blocks
    WHERE block_type = 'email'
      AND block_value = lower(trim(p_email))
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'block_type', 'email',
        'message', 'Access restricted. Contact support.'
      );
    END IF;
  END IF;

  -- All clear
  RETURN jsonb_build_object(
    'allowed', true,
    'block_type', NULL,
    'message', NULL
  );
END;
$$;
