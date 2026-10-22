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
CREATE OR REPLACE FUNCTION phase1.my_network()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
  with me as (select id from phase1.agents where user_id = auth.uid())
  select jsonb_build_object(
    'agents', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'store_name', s.store_name, 'status', s.status, 'parent_deactivated_at', s.parent_deactivated_at, 'paid_until', s.paid_until, 'created_at', s.created_at, 'whatsapp', s.whatsapp,
        'orders', (select count(*) from phase1.orders o where o.agent_id = s.id and o.payment_status = 'succeeded'),
        'sales', (select coalesce(sum(o.amount),0) from phase1.orders o where o.agent_id = s.id and o.status = 'delivered'),
        'my_margin', (select coalesce(sum(o.parent_margin),0) from phase1.orders o where o.agent_id = s.id and o.status = 'delivered'),
        'fees_paid', (select coalesce(sum(l.amount),0) from phase1.agent_ledger_entries l where l.agent_id = (select id from me) and l.type = 'sale' and l.note like 'Agent fee from%' and l.reference in (select provider_reference from phase1.payment_intents where (metadata->>'agent_id')::uuid = s.id))
      ) order by s.created_at desc), '[]'::jsonb) from phase1.agents s where s.parent_agent_id = (select id from me)),
    'totals', (select jsonb_build_object('agents', count(*), 'active', count(*) filter (where s.status = 'active'),
        'sales', (select coalesce(sum(o.amount),0) from phase1.orders o where o.parent_agent_id = (select id from me) and o.status = 'delivered'),
        'my_margin', (select coalesce(sum(o.parent_margin),0) from phase1.orders o where o.parent_agent_id = (select id from me) and o.status = 'delivered'),
        'fee_income', (select coalesce(sum(l.amount),0) from phase1.agent_ledger_entries l where l.agent_id = (select id from me) and l.type = 'sale' and l.note like 'Agent fee from%'))
      from phase1.agents s where s.parent_agent_id = (select id from me)))
$function$
;
