
-- ─────────────────────────────────────────────────────────────────────
-- Phase 1B: Bulk Dispatch Queue RPCs (admin-only, SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────

-- ===== 1. generate_bulk_dispatch_batches(network) =====
CREATE OR REPLACE FUNCTION public.generate_bulk_dispatch_batches(p_network text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_batch_id uuid;
  v_batch_number text;
  v_size numeric;
  v_count int;
  v_total_batches int := 0;
  v_total_items int := 0;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_network IS NULL OR p_network = '' THEN
    RAISE EXCEPTION 'p_network is required';
  END IF;

  -- Build a temp table holding eligible rows from BOTH order tables,
  -- locked SKIP LOCKED so concurrent generators don't double-batch.
  CREATE TEMP TABLE _eligible (
    order_table text,
    order_uuid uuid,
    order_id text,
    recipient text,
    network text,
    bundle_size_gb numeric,
    created_at timestamptz
  ) ON COMMIT DROP;

  INSERT INTO _eligible
  SELECT 'orders', o.id, o.order_id, o.recipient_number, o.network, o.bundle_size_gb, o.created_at
  FROM public.orders o
  WHERE o.network = p_network AND o.queue_state = 'queued'
  ORDER BY o.created_at ASC
  FOR UPDATE SKIP LOCKED;

  INSERT INTO _eligible
  SELECT 'agent_orders', a.id, a.order_id, a.customer_phone, a.network, a.bundle_size_gb, a.created_at
  FROM public.agent_orders a
  WHERE a.network = p_network AND a.queue_state = 'queued'
  ORDER BY a.created_at ASC
  FOR UPDATE SKIP LOCKED;

  -- Group by bundle size and create one batch per group
  FOR v_size, v_count IN
    SELECT bundle_size_gb, COUNT(*) FROM _eligible GROUP BY bundle_size_gb ORDER BY bundle_size_gb
  LOOP
    v_batch_number := 'BATCH-' || to_char(now() AT TIME ZONE 'Africa/Accra', 'YYYYMMDD-HH24MISS')
                      || '-' || upper(p_network) || '-' || v_size::text;

    INSERT INTO public.dispatch_batches (
      batch_number, network, bundle_size_gb, bundle_label,
      status, order_count, created_by
    )
    VALUES (
      v_batch_number, p_network, v_size, v_size::text || 'GB',
      'new', v_count,
      coalesce((SELECT email FROM auth.users WHERE id = v_caller), v_caller::text)
    )
    RETURNING id INTO v_batch_id;

    -- Insert items + flip queue_state per row, routing by order_table
    INSERT INTO public.dispatch_batch_items (
      batch_id, order_id, order_uuid, order_table,
      recipient_number, network, bundle_size_gb, status
    )
    SELECT v_batch_id, e.order_id, e.order_uuid, e.order_table,
           e.recipient, e.network, e.bundle_size_gb, 'queued'
    FROM _eligible e
    WHERE e.bundle_size_gb = v_size;

    UPDATE public.orders SET queue_state = 'batched', updated_at = now()
    WHERE id IN (SELECT order_uuid FROM _eligible WHERE bundle_size_gb = v_size AND order_table = 'orders');

    UPDATE public.agent_orders SET queue_state = 'batched', updated_at = now()
    WHERE id IN (SELECT order_uuid FROM _eligible WHERE bundle_size_gb = v_size AND order_table = 'agent_orders');

    v_total_batches := v_total_batches + 1;
    v_total_items := v_total_items + v_count;
    v_result := v_result || jsonb_build_object(
      'batch_id', v_batch_id, 'batch_number', v_batch_number,
      'bundle_size_gb', v_size, 'item_count', v_count
    );
  END LOOP;

  DROP TABLE _eligible;

  RETURN jsonb_build_object(
    'network', p_network,
    'batches_created', v_total_batches,
    'items_batched', v_total_items,
    'batches', v_result
  );
END $$;

REVOKE ALL ON FUNCTION public.generate_bulk_dispatch_batches(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_bulk_dispatch_batches(text) TO authenticated;

-- ===== 2. mark_batch_sent(batch_id, sent_by) =====
CREATE OR REPLACE FUNCTION public.mark_batch_sent(p_batch_id uuid, p_sent_by text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.dispatch_batches
  SET status = 'sent', sent_at = now(),
      sent_by = coalesce(p_sent_by, v_caller::text), updated_at = now()
  WHERE id = p_batch_id AND status IN ('new','copied');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'batch not found or not in a sendable state';
  END IF;

  UPDATE public.dispatch_batch_items SET status = 'sent'
  WHERE batch_id = p_batch_id AND status = 'queued';

  -- Polymorphic update: flip queue_state on the correct underlying table
  UPDATE public.orders o
  SET queue_state = 'sent', updated_at = now()
  FROM public.dispatch_batch_items i
  WHERE i.batch_id = p_batch_id AND i.order_table = 'orders' AND o.id = i.order_uuid;

  UPDATE public.agent_orders a
  SET queue_state = 'sent', updated_at = now()
  FROM public.dispatch_batch_items i
  WHERE i.batch_id = p_batch_id AND i.order_table = 'agent_orders' AND a.id = i.order_uuid;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'sent');
END $$;

REVOKE ALL ON FUNCTION public.mark_batch_sent(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_batch_sent(uuid, text) TO authenticated;

-- ===== 3. mark_batch_delivered(batch_id, marked_by) =====
CREATE OR REPLACE FUNCTION public.mark_batch_delivered(p_batch_id uuid, p_marked_by text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.dispatch_batches
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_batch_id;

  UPDATE public.dispatch_batch_items SET status = 'delivered'
  WHERE batch_id = p_batch_id AND status IN ('queued','sent');

  -- Polymorphic delivery
  UPDATE public.orders o
  SET status = 'Delivered', queue_state = 'delivered', updated_at = now()
  FROM public.dispatch_batch_items i
  WHERE i.batch_id = p_batch_id AND i.order_table = 'orders'
    AND o.id = i.order_uuid AND o.status NOT IN ('Delivered','Failed');

  UPDATE public.agent_orders a
  SET status = 'Delivered', queue_state = 'delivered', updated_at = now()
  FROM public.dispatch_batch_items i
  WHERE i.batch_id = p_batch_id AND i.order_table = 'agent_orders'
    AND a.id = i.order_uuid AND a.status NOT IN ('Delivered','Failed');

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'delivered');
END $$;

REVOKE ALL ON FUNCTION public.mark_batch_delivered(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_batch_delivered(uuid, text) TO authenticated;

-- ===== 4. mark_order_in_batch_failed(item_id, reason) =====
CREATE OR REPLACE FUNCTION public.mark_order_in_batch_failed(p_item_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_item record;
  v_reason_clipped text := substr(coalesce(p_reason,'Marked failed by admin'), 1, 500);
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_item FROM public.dispatch_batch_items WHERE id = p_item_id;
  IF v_item IS NULL THEN RAISE EXCEPTION 'item not found'; END IF;

  UPDATE public.dispatch_batch_items
  SET status = 'failed', notes = v_reason_clipped
  WHERE id = p_item_id;

  IF v_item.order_table = 'orders' THEN
    UPDATE public.orders
    SET status = 'Failed', queue_state = 'failed',
        failure_reason = v_reason_clipped, updated_at = now()
    WHERE id = v_item.order_uuid;
  ELSIF v_item.order_table = 'agent_orders' THEN
    UPDATE public.agent_orders
    SET status = 'Failed', queue_state = 'failed',
        failure_reason = v_reason_clipped, updated_at = now()
    WHERE id = v_item.order_uuid;
  END IF;

  RETURN jsonb_build_object('item_id', p_item_id, 'status', 'failed');
END $$;

REVOKE ALL ON FUNCTION public.mark_order_in_batch_failed(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_in_batch_failed(uuid, text) TO authenticated;

-- ===== 5. resolve_failed_batch_order(item_id, action, actor) =====
-- Phase 1: 'retry' implemented for both tables. 'refund' implemented for RWD-
-- (loyalty point refund via admin_adjust_loyalty_points). 'refund' for DS-/AGT-/WS-
-- returns not_implemented (GHS wallet refund deferred to Phase 2).
CREATE OR REPLACE FUNCTION public.resolve_failed_batch_order(
  p_item_id uuid, p_action text, p_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_item record;
  v_order_id text;
  v_prefix text;
  v_redemption record;
  v_adj jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('retry','refund') THEN
    RAISE EXCEPTION 'invalid action: %, must be retry or refund', p_action;
  END IF;

  SELECT * INTO v_item FROM public.dispatch_batch_items WHERE id = p_item_id;
  IF v_item IS NULL THEN RAISE EXCEPTION 'item not found'; END IF;

  v_order_id := v_item.order_id;
  v_prefix := split_part(v_order_id, '-', 1);

  -- ─── RETRY ──────────────────────────────────────────────
  IF p_action = 'retry' THEN
    IF v_item.order_table = 'orders' THEN
      UPDATE public.orders SET queue_state = NULL, status = 'Pending',
        failure_reason = NULL, updated_at = now()
      WHERE id = v_item.order_uuid;
    ELSE
      UPDATE public.agent_orders SET queue_state = NULL, status = 'pending',
        failure_reason = NULL, updated_at = now()
      WHERE id = v_item.order_uuid;
    END IF;
    UPDATE public.dispatch_batch_items SET status = 'released',
      notes = coalesce(notes,'') || ' | retry by ' || coalesce(p_actor, v_caller::text)
    WHERE id = p_item_id;
    RETURN jsonb_build_object('status','retry_released','order_id', v_order_id);
  END IF;

  -- ─── REFUND ─────────────────────────────────────────────
  IF p_action = 'refund' THEN
    -- RWD- orders: refund loyalty points via existing admin RPC
    IF v_prefix = 'RWD' AND v_item.order_table = 'orders' THEN
      SELECT * INTO v_redemption FROM public.loyalty_redemptions
      WHERE order_id = v_item.order_uuid LIMIT 1;

      IF v_redemption IS NULL THEN
        RETURN jsonb_build_object(
          'status','not_implemented',
          'message','RWD- order has no linked loyalty_redemption row to refund'
        );
      END IF;

      v_adj := public.admin_adjust_loyalty_points(
        v_redemption.user_id,
        v_redemption.points_used,
        format('Refund failed reward order %s (item %s) by %s',
               v_order_id, p_item_id, coalesce(p_actor, v_caller::text))
      );

      UPDATE public.loyalty_redemptions SET status = 'refunded'
      WHERE id = v_redemption.id;

      UPDATE public.dispatch_batch_items SET status = 'refunded',
        notes = coalesce(notes,'') || ' | refunded ' || v_redemption.points_used
                || ' pts to user ' || v_redemption.user_id::text
      WHERE id = p_item_id;

      RETURN jsonb_build_object(
        'status','refunded',
        'order_id', v_order_id,
        'points_refunded', v_redemption.points_used,
        'user_id', v_redemption.user_id,
        'adjustment', v_adj
      );
    END IF;

    -- DS-, AGT-, WS-, TG-, DS-ADM: GHS wallet refund deferred to Phase 2
    RETURN jsonb_build_object(
      'status','not_implemented',
      'message','GHS refund handler will be wired in Phase 2',
      'order_id', v_order_id,
      'order_prefix', v_prefix
    );
  END IF;

  RETURN jsonb_build_object('status','noop');
END $$;

REVOKE ALL ON FUNCTION public.resolve_failed_batch_order(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_failed_batch_order(uuid, text, text) TO authenticated;
