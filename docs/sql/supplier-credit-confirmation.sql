-- Apply only to the active external phase1 database. No money/status writes.
CREATE OR REPLACE FUNCTION phase1.admin_set_supplier_credit_confirmation(p_order_id uuid, p_confirmed boolean, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_order phase1.orders%ROWTYPE; v_supplier text;
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
    OR NOT EXISTS (SELECT 1 FROM phase1.admin_users WHERE user_id=auth.uid() AND is_active)
    THEN RAISE EXCEPTION 'Administrator and two-factor verification required'; END IF;
  IF p_confirmed IS NULL OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Confirmation evidence required'; END IF;
  SELECT * INTO v_order FROM phase1.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF p_confirmed AND (v_order.payment_status::text <> 'succeeded' OR v_order.status::text NOT IN ('failed_needs_review','failed','paid','processing','pending_supplier')) THEN RAISE EXCEPTION 'Order is not open and paid'; END IF;
  IF p_confirmed AND v_order.send_lock_until > now() THEN RAISE EXCEPTION 'Supplier send is in progress'; END IF;
  SELECT code INTO v_supplier FROM phase1.suppliers WHERE id=v_order.supplier_id;
  INSERT INTO phase1.audit_logs(actor_user_id,action,target_type,target_id,after_value,reason)
  VALUES(auth.uid(),CASE WHEN p_confirmed THEN 'order.supplier_credit.confirmed' ELSE 'order.supplier_credit.cleared' END,'order',v_order.id,
    jsonb_build_object('confirmed',p_confirmed,'supplier_code',v_supplier,'supplier_reference',v_order.supplier_order_reference,'purchase_id',v_order.supplier_purchase_id),btrim(p_note));
END;
$$;
REVOKE ALL ON FUNCTION phase1.admin_set_supplier_credit_confirmation(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION phase1.admin_set_supplier_credit_confirmation(uuid,boolean,text) TO authenticated;
NOTIFY pgrst, 'reload schema';