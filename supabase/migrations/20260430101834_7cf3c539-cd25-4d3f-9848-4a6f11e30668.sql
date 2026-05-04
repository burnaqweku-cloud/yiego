-- 1) Extend orders.status CHECK to include 'Voided'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'Pending'::text, 'Pending Payment'::text, 'Pending Approval'::text,
    'Paid'::text, 'Processing'::text, 'Delivered'::text, 'Failed'::text,
    'Cancelled'::text, 'Voided'::text
  ]));

-- agent_orders.status has no CHECK constraint; nothing to alter there.

-- 2) Bulk void RPC. Accepts an array of {order_id, is_agent_order} items so a mixed selection can be routed.
CREATE OR REPLACE FUNCTION public.admin_bulk_void_orders(
  p_items jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_bulk_op_id uuid := gen_random_uuid();
  v_voided int := 0;
  v_skipped int := 0;
  v_skipped_ids text[] := ARRAY[]::text[];
  v_item jsonb;
  v_order_id text;
  v_is_agent boolean;
  v_prev_status text;
  v_recipient text;
  v_amount numeric;
BEGIN
  -- Admin gate
  IF NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can bulk void orders';
  END IF;

  SELECT email INTO v_actor_email FROM public.profiles WHERE id = v_actor;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'voided_count', 0, 'skipped_count', 0, 'skipped_ids', '[]'::jsonb,
      'bulk_operation_id', v_bulk_op_id
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_order_id := v_item->>'order_id';
    v_is_agent := COALESCE((v_item->>'is_agent_order')::boolean, false);

    IF v_is_agent THEN
      SELECT status, customer_phone, amount_ghs
        INTO v_prev_status, v_recipient, v_amount
      FROM public.agent_orders WHERE order_id = v_order_id;
    ELSE
      SELECT status, recipient_number, amount_ghs
        INTO v_prev_status, v_recipient, v_amount
      FROM public.orders WHERE order_id = v_order_id;
    END IF;

    IF v_prev_status IS NULL OR v_prev_status = 'Voided' THEN
      v_skipped := v_skipped + 1;
      v_skipped_ids := array_append(v_skipped_ids, v_order_id);
      CONTINUE;
    END IF;

    IF v_is_agent THEN
      UPDATE public.agent_orders SET status = 'Voided', updated_at = now()
        WHERE order_id = v_order_id;
    ELSE
      UPDATE public.orders SET status = 'Voided', updated_at = now()
        WHERE order_id = v_order_id;
    END IF;

    INSERT INTO public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, changes, metadata)
    VALUES (
      v_actor, COALESCE(v_actor_email, ''), 'order_voided_bulk',
      CASE WHEN v_is_agent THEN 'agent_order' ELSE 'order' END,
      v_order_id,
      jsonb_build_object('status', jsonb_build_object('before', v_prev_status, 'after', 'Voided')),
      jsonb_build_object(
        'from_status', v_prev_status, 'to_status', 'Voided',
        'reason', p_reason, 'recipient_number', v_recipient,
        'amount', v_amount, 'bulk_operation_id', v_bulk_op_id,
        'trigger', 'admin'
      )
    );

    v_voided := v_voided + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'voided_count', v_voided,
    'skipped_count', v_skipped,
    'skipped_ids', to_jsonb(v_skipped_ids),
    'bulk_operation_id', v_bulk_op_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_void_orders(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_void_orders(jsonb, text) TO authenticated;