-- Phase 1: Telegram Bot admin foundation
-- Audit log for all admin actions in the Telegram Bot section
CREATE TABLE public.tg_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tg_admin_audit_log_created_at ON public.tg_admin_audit_log (created_at DESC);
CREATE INDEX idx_tg_admin_audit_log_admin ON public.tg_admin_audit_log (admin_user_id, created_at DESC);
CREATE INDEX idx_tg_admin_audit_log_action ON public.tg_admin_audit_log (action, created_at DESC);
CREATE INDEX idx_tg_admin_audit_log_target ON public.tg_admin_audit_log (target_type, target_id);

ALTER TABLE public.tg_admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON public.tg_admin_audit_log FOR SELECT
  USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policies — writes happen only via SECURITY DEFINER RPC.

-- Singleton-keyed config store for editable bot settings
CREATE TABLE public.tg_admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tg_admin_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read/manage from the panel; bot reads via SECURITY DEFINER helpers (Phase 5/8).
CREATE POLICY "Admins can read settings"
  ON public.tg_admin_settings FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can write settings"
  ON public.tg_admin_settings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Audit-log writer RPC (admin-gated). Returns inserted row id.
CREATE OR REPLACE FUNCTION public.log_tg_admin_action(
  p_action text,
  p_target_type text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_ip text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
  v_ip inet;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'action_required';
  END IF;

  BEGIN
    v_ip := NULLIF(p_ip, '')::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  INSERT INTO public.tg_admin_audit_log (admin_user_id, action, target_type, target_id, details, ip_address)
  VALUES (v_uid, p_action, p_target_type, p_target_id, COALESCE(p_details, '{}'::jsonb), v_ip)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_tg_admin_action(text, text, text, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_tg_admin_action(text, text, text, jsonb, text) TO authenticated;

-- Settings upsert RPC (admin-gated). Also writes an audit log entry.
CREATE OR REPLACE FUNCTION public.set_tg_admin_setting(
  p_key text,
  p_value jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'key_required';
  END IF;

  SELECT value INTO v_prev FROM public.tg_admin_settings WHERE key = p_key;

  INSERT INTO public.tg_admin_settings (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, v_uid, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (
    v_uid,
    'settings.update',
    'tg_admin_settings',
    p_key,
    jsonb_build_object('previous', v_prev, 'next', p_value, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'key', p_key, 'value', p_value);
END;
$$;

REVOKE ALL ON FUNCTION public.set_tg_admin_setting(text, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_tg_admin_setting(text, jsonb, text) TO authenticated;