-- Apply only to the active external database.
ALTER TABLE phase1.agents ADD COLUMN IF NOT EXISTS parent_deactivated_at timestamptz;

CREATE OR REPLACE FUNCTION phase1.agent_set_sub_active(p_sub uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = phase1, pg_temp
AS $$
DECLARE v_parent uuid; v_sub phase1.agents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_sub IS NULL OR p_active IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;
  SELECT id INTO v_parent FROM phase1.agents
    WHERE user_id = auth.uid() AND parent_agent_id IS NULL AND status = 'active' FOR UPDATE;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_sub FROM phase1.agents WHERE id = p_sub AND parent_agent_id = v_parent FOR UPDATE;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_active THEN
    IF v_sub.status = 'active' THEN RETURN; END IF;
    IF v_sub.status <> 'paused' OR v_sub.parent_deactivated_at IS NULL THEN
      RAISE EXCEPTION 'contact_support';
    END IF;
    UPDATE phase1.agents SET status = 'active', parent_deactivated_at = NULL, updated_at = now() WHERE id = p_sub;
  ELSE
    IF v_sub.status = 'paused' AND v_sub.parent_deactivated_at IS NOT NULL THEN RETURN; END IF;
    IF v_sub.status <> 'active' THEN RAISE EXCEPTION 'contact_support'; END IF;
    UPDATE phase1.agents SET status = 'paused', parent_deactivated_at = now(), updated_at = now() WHERE id = p_sub;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION phase1.agent_set_sub_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION phase1.agent_set_sub_active(uuid, boolean) TO authenticated;

-- An administrator's status decision always takes precedence over a parent's pause.
CREATE OR REPLACE FUNCTION phase1.admin_network_set_sub_status(p_sub uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = phase1, public
AS $$
BEGIN
  IF NOT phase1.caller_is_admin() THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF p_status NOT IN ('active', 'suspended', 'paused') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE phase1.agents SET status = p_status::phase1.agent_status, parent_deactivated_at = NULL, updated_at = now()
    WHERE id = p_sub AND parent_agent_id IS NOT NULL;
END;
$$;
NOTIFY pgrst, 'reload schema';