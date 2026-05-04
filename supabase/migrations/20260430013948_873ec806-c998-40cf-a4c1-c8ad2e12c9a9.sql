-- ============== PATCH 1: bulk_dispatch_audit table ============
CREATE TABLE IF NOT EXISTS public.bulk_dispatch_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bulk_dispatch_audit_action_check CHECK (action IN (
    'mode_changed',
    'batch_generated',
    'batch_marked_sent',
    'batch_marked_delivered',
    'order_marked_delivered_in_batch',
    'order_marked_failed_in_batch',
    'failed_order_resolved',
    'leftover_orders_actioned',
    'queue_alert_fired'
  ))
);

CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_audit_created_at
  ON public.bulk_dispatch_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_audit_entity
  ON public.bulk_dispatch_audit (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_bulk_dispatch_audit_action
  ON public.bulk_dispatch_audit (action, created_at DESC);

ALTER TABLE public.bulk_dispatch_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read bulk_dispatch_audit" ON public.bulk_dispatch_audit;
CREATE POLICY "Admins read bulk_dispatch_audit"
  ON public.bulk_dispatch_audit FOR SELECT
  TO authenticated USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Block direct writes bulk_dispatch_audit" ON public.bulk_dispatch_audit;
CREATE POLICY "Block direct writes bulk_dispatch_audit"
  ON public.bulk_dispatch_audit FOR ALL
  TO authenticated USING (false) WITH CHECK (false);

ALTER TABLE public.dispatch_batch_items
  ADD COLUMN IF NOT EXISTS resolved_action text;
ALTER TABLE public.dispatch_batch_items
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.dispatch_batch_items
  ADD COLUMN IF NOT EXISTS resolved_by text;


-- ── PATCH 5 + 2: generate_bulk_dispatch_batches with 20-cap + audit
CREATE OR REPLACE FUNCTION public.generate_bulk_dispatch_batches(p_network text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_actor_email text;
  v_batch_id uuid;
  v_batch_number text;
  v_size numeric;
  v_count int;
  v_total_batches int := 0;
  v_total_items int := 0;
  v_chunk_idx int;
  v_chunk_size int;
  v_offset int;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_network IS NULL OR p_network = '' THEN
    RAISE EXCEPTION 'p_network is required';
  END IF;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_caller;

  CREATE TEMP TABLE _eligible (
    seq bigserial,
    order_table text,
    order_uuid uuid,
    order_id text,
    recipient text,
    network text,
    bundle_size_gb numeric,
    created_at timestamptz
  ) ON COMMIT DROP;

  INSERT INTO _eligible (order_table, order_uuid, order_id, recipient, network, bundle_size_gb, created_at)
  SELECT 'orders', o.id, o.order_id, o.recipient_number, o.network, o.bundle_size_gb, o.created_at
  FROM public.orders o
  WHERE o.network = p_network AND o.queue_state = 'queued'
  ORDER BY o.created_at ASC
  FOR UPDATE SKIP LOCKED;

  INSERT INTO _eligible (order_table, order_uuid, order_id, recipient, network, bundle_size_gb, created_at)
  SELECT 'agent_orders', a.id, a.order_id, a.customer_phone, a.network, a.bundle_size_gb, a.created_at
  FROM public.agent_orders a
  WHERE a.network = p_network AND a.queue_state = 'queued'
  ORDER BY a.created_at ASC
  FOR UPDATE SKIP LOCKED;

  FOR v_size, v_count IN
    SELECT bundle_size_gb, COUNT(*) FROM _eligible GROUP BY bundle_size_gb ORDER BY bundle_size_gb
  LOOP
    v_chunk_idx := 0;
    v_offset := 0;

    WHILE v_offset < v_count LOOP
      v_chunk_size := LEAST(20, v_count - v_offset);
      v_chunk_idx := v_chunk_idx + 1;
      v_total_batches := v_total_batches + 1;

      v_batch_number := 'BATCH-' || to_char(now() AT TIME ZONE 'Africa/Accra', 'YYYYMMDD-HH24MISS')
                        || '-' || upper(p_network) || '-' || v_size::text
                        || '-' || lpad(v_chunk_idx::text, 2, '0');

      INSERT INTO public.dispatch_batches (
        batch_number, network, bundle_size_gb, bundle_label,
        status, order_count, created_by
      )
      VALUES (
        v_batch_number, p_network, v_size, v_size::text || 'GB',
        'new', v_chunk_size,
        coalesce(v_actor_email, v_caller::text)
      )
      RETURNING id INTO v_batch_id;

      WITH chunk AS (
        SELECT order_table, order_uuid, order_id, recipient, network, bundle_size_gb
        FROM _eligible
        WHERE bundle_size_gb = v_size
        ORDER BY created_at ASC, seq ASC
        OFFSET v_offset LIMIT v_chunk_size
      )
      INSERT INTO public.dispatch_batch_items (
        batch_id, order_id, order_uuid, order_table,
        recipient_number, network, bundle_size_gb, status
      )
      SELECT v_batch_id, c.order_id, c.order_uuid, c.order_table,
             c.recipient, c.network, c.bundle_size_gb, 'queued'
      FROM chunk c;

      WITH chunk AS (
        SELECT order_uuid, order_table
        FROM _eligible
        WHERE bundle_size_gb = v_size
        ORDER BY created_at ASC, seq ASC
        OFFSET v_offset LIMIT v_chunk_size
      )
      UPDATE public.orders SET queue_state = 'batched', updated_at = now()
      WHERE id IN (SELECT order_uuid FROM chunk WHERE order_table = 'orders');

      WITH chunk AS (
        SELECT order_uuid, order_table
        FROM _eligible
        WHERE bundle_size_gb = v_size
        ORDER BY created_at ASC, seq ASC
        OFFSET v_offset LIMIT v_chunk_size
      )
      UPDATE public.agent_orders SET queue_state = 'batched', updated_at = now()
      WHERE id IN (SELECT order_uuid FROM chunk WHERE order_table = 'agent_orders');

      v_total_items := v_total_items + v_chunk_size;

      INSERT INTO public.bulk_dispatch_audit (
        actor_id, actor_email, action, entity_type, entity_id, new_value, metadata
      )
      VALUES (
        v_caller, v_actor_email, 'batch_generated', 'dispatch_batch', v_batch_id::text,
        jsonb_build_object('batch_number', v_batch_number, 'status', 'new'),
        jsonb_build_object(
          'network', p_network,
          'bundle_size_gb', v_size,
          'order_count', v_chunk_size,
          'chunk_index', v_chunk_idx
        )
      );

      v_result := v_result || jsonb_build_object(
        'batch_id', v_batch_id,
        'batch_number', v_batch_number,
        'order_count', v_chunk_size
      );

      v_offset := v_offset + v_chunk_size;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'network', p_network,
    'total_batches', v_total_batches,
    'total_items', v_total_items,
    'batches', v_result
  );
END $function$;


-- ── PATCH 6 + 2: mark_batch_sent — moves orders to Processing + audit
CREATE OR REPLACE FUNCTION public.mark_batch_sent(p_batch_id uuid, p_sent_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_actor_email text;
  v_updated int;
  v_batch record;
  v_sentinel text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM public.dispatch_batches WHERE id = p_batch_id;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_caller;
  v_sentinel := 'MANUAL_BATCH_' || v_batch.batch_number;

  UPDATE public.dispatch_batches
  SET status = 'sent', sent_at = now(),
      sent_by = coalesce(p_sent_by, v_actor_email, v_caller::text), updated_at = now()
  WHERE id = p_batch_id AND status IN ('new','copied');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'batch not found or not in a sendable state';
  END IF;

  UPDATE public.dispatch_batch_items SET status = 'sent'
  WHERE batch_id = p_batch_id AND status = 'queued';

  UPDATE public.orders o
  SET status = 'Processing',
      queue_state = 'sent',
      supplier_reference = coalesce(o.supplier_reference, v_sentinel),
      supplier_status = coalesce(o.supplier_status, v_sentinel),
      updated_at = now()
  FROM public.dispatch_batch_items i
  WHERE i.batch_id = p_batch_id AND i.order_table = 'orders' AND o.id = i.order_uuid;

  UPDATE public.agent_orders a
  SET status = 'Processing',
      queue_state = 'sent',
      supplier_reference = coalesce(a.supplier_reference, v_sentinel),
      supplier_status = coalesce(a.supplier_status, v_sentinel),
      updated_at = now()
  FROM public.dispatch_batch_items i
  WHERE i.batch_id = p_batch_id AND i.order_table = 'agent_orders' AND a.id = i.order_uuid;

  INSERT INTO public.bulk_dispatch_audit (
    actor_id, actor_email, action, entity_type, entity_id,
    previous_value, new_value, metadata
  )
  VALUES (
    v_caller, v_actor_email, 'batch_marked_sent', 'dispatch_batch', p_batch_id::text,
    jsonb_build_object('status', v_batch.status),
    jsonb_build_object('status', 'sent', 'sent_at', now()),
    jsonb_build_object(
      'batch_number', v_batch.batch_number,
      'network', v_batch.network,
      'order_count', v_batch.order_count,
      'sentinel', v_sentinel
    )
  );

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'sent');
END $function$;


-- ── PATCH 2: mark_batch_delivered with batch + per-item audit
CREATE OR REPLACE FUNCTION public.mark_batch_delivered(p_batch_id uuid, p_marked_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_actor_email text;
  v_batch record;
  v_item record;
  v_delivered_count int := 0;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM public.dispatch_batches WHERE id = p_batch_id;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_caller;

  UPDATE public.dispatch_batches
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_batch_id;

  FOR v_item IN
    SELECT * FROM public.dispatch_batch_items
    WHERE batch_id = p_batch_id AND status IN ('queued','sent')
  LOOP
    INSERT INTO public.bulk_dispatch_audit (
      actor_id, actor_email, action, entity_type, entity_id,
      previous_value, new_value, metadata
    )
    VALUES (
      v_caller, v_actor_email, 'order_marked_delivered_in_batch',
      'dispatch_batch_item', v_item.id::text,
      jsonb_build_object('item_status', v_item.status),
      jsonb_build_object('item_status', 'delivered', 'order_status', 'Delivered'),
      jsonb_build_object(
        'batch_id', p_batch_id,
        'batch_number', v_batch.batch_number,
        'order_id', v_item.order_id,
        'order_table', v_item.order_table
      )
    );
    v_delivered_count := v_delivered_count + 1;
  END LOOP;

  UPDATE public.dispatch_batch_items SET status = 'delivered'
  WHERE batch_id = p_batch_id AND status IN ('queued','sent');

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

  INSERT INTO public.bulk_dispatch_audit (
    actor_id, actor_email, action, entity_type, entity_id,
    previous_value, new_value, metadata
  )
  VALUES (
    v_caller, v_actor_email, 'batch_marked_delivered', 'dispatch_batch', p_batch_id::text,
    jsonb_build_object('status', v_batch.status),
    jsonb_build_object('status', 'completed', 'completed_at', now()),
    jsonb_build_object(
      'batch_number', v_batch.batch_number,
      'network', v_batch.network,
      'items_delivered', v_delivered_count
    )
  );

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'delivered', 'items_delivered', v_delivered_count);
END $function$;


-- ── PATCH 2: mark_order_in_batch_failed with audit
CREATE OR REPLACE FUNCTION public.mark_order_in_batch_failed(p_item_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_actor_email text;
  v_item record;
  v_reason_clipped text := substr(coalesce(p_reason,'Marked failed by admin'), 1, 500);
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_item FROM public.dispatch_batch_items WHERE id = p_item_id;
  IF v_item IS NULL THEN RAISE EXCEPTION 'item not found'; END IF;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_caller;

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

  INSERT INTO public.bulk_dispatch_audit (
    actor_id, actor_email, action, entity_type, entity_id,
    previous_value, new_value, metadata
  )
  VALUES (
    v_caller, v_actor_email, 'order_marked_failed_in_batch',
    'dispatch_batch_item', p_item_id::text,
    jsonb_build_object('item_status', v_item.status),
    jsonb_build_object('item_status', 'failed', 'order_status', 'Failed'),
    jsonb_build_object(
      'batch_id', v_item.batch_id,
      'order_id', v_item.order_id,
      'order_table', v_item.order_table,
      'reason', v_reason_clipped
    )
  );

  RETURN jsonb_build_object('item_id', p_item_id, 'status', 'failed');
END $function$;


-- ── PATCH 4 + 2: resolve_failed_batch_order with manual_resolve + audit
DROP FUNCTION IF EXISTS public.resolve_failed_batch_order(uuid, text, text);
CREATE OR REPLACE FUNCTION public.resolve_failed_batch_order(
  p_item_id uuid,
  p_action text,
  p_actor text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_actor_email text;
  v_item record;
  v_order_id text;
  v_prefix text;
  v_redemption record;
  v_adj jsonb;
  v_notes_clipped text;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('retry','refund','manual_resolve') THEN
    RAISE EXCEPTION 'invalid action: %, must be retry, refund, or manual_resolve', p_action;
  END IF;

  SELECT * INTO v_item FROM public.dispatch_batch_items WHERE id = p_item_id;
  IF v_item IS NULL THEN RAISE EXCEPTION 'item not found'; END IF;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_caller;
  v_order_id := v_item.order_id;
  v_prefix := split_part(v_order_id, '-', 1);

  IF p_action = 'retry' THEN
    IF v_item.order_table = 'orders' THEN
      UPDATE public.orders SET queue_state = NULL, status = 'Pending',
        failure_reason = NULL, updated_at = now()
      WHERE id = v_item.order_uuid;
    ELSE
      UPDATE public.agent_orders SET queue_state = NULL, status = 'Pending',
        failure_reason = NULL, updated_at = now()
      WHERE id = v_item.order_uuid;
    END IF;
    UPDATE public.dispatch_batch_items
    SET status = 'released',
        resolved_action = 'retry',
        resolved_at = now(),
        resolved_by = coalesce(p_actor, v_actor_email, v_caller::text),
        notes = coalesce(notes,'') || ' | retry by ' || coalesce(p_actor, v_actor_email, v_caller::text)
    WHERE id = p_item_id;
    v_result := jsonb_build_object('status','retry_released','order_id', v_order_id);

  ELSIF p_action = 'manual_resolve' THEN
    IF p_notes IS NULL OR length(trim(p_notes)) < 1 THEN
      RAISE EXCEPTION 'notes required for manual_resolve';
    END IF;
    v_notes_clipped := substr(p_notes, 1, 1000);

    IF v_item.order_table = 'orders' THEN
      UPDATE public.orders
      SET status = 'Delivered', queue_state = NULL, updated_at = now()
      WHERE id = v_item.order_uuid;
    ELSE
      UPDATE public.agent_orders
      SET status = 'Delivered', queue_state = NULL, updated_at = now()
      WHERE id = v_item.order_uuid;
    END IF;

    UPDATE public.dispatch_batch_items
    SET status = 'resolved',
        resolved_action = 'manual_resolve',
        resolved_at = now(),
        resolved_by = coalesce(p_actor, v_actor_email, v_caller::text),
        notes = coalesce(notes,'') || ' | manual_resolve: ' || v_notes_clipped
    WHERE id = p_item_id;
    v_result := jsonb_build_object('status','manually_resolved','order_id', v_order_id);

  ELSIF p_action = 'refund' THEN
    IF v_prefix = 'RWD' AND v_item.order_table = 'orders' THEN
      SELECT * INTO v_redemption FROM public.loyalty_redemptions
      WHERE order_id = v_item.order_uuid LIMIT 1;

      IF v_redemption IS NULL THEN
        v_result := jsonb_build_object(
          'status','not_implemented',
          'message','RWD- order has no linked loyalty_redemption row to refund'
        );
      ELSE
        v_adj := public.admin_adjust_loyalty_points(
          v_redemption.user_id,
          v_redemption.points_used,
          format('Refund failed reward order %s (item %s) by %s',
                 v_order_id, p_item_id, coalesce(p_actor, v_actor_email, v_caller::text))
        );
        UPDATE public.loyalty_redemptions SET status = 'refunded' WHERE id = v_redemption.id;
        UPDATE public.dispatch_batch_items
        SET status = 'refunded',
            resolved_action = 'refund',
            resolved_at = now(),
            resolved_by = coalesce(p_actor, v_actor_email, v_caller::text),
            notes = coalesce(notes,'') || ' | refunded ' || v_redemption.points_used
                    || ' pts to user ' || v_redemption.user_id::text
        WHERE id = p_item_id;
        v_result := jsonb_build_object(
          'status','refunded', 'order_id', v_order_id,
          'points_refunded', v_redemption.points_used,
          'user_id', v_redemption.user_id, 'adjustment', v_adj
        );
      END IF;
    ELSE
      v_result := jsonb_build_object(
        'status','not_implemented',
        'message','GHS refund handler will be wired in Phase 2',
        'order_id', v_order_id, 'order_prefix', v_prefix
      );
    END IF;
  END IF;

  INSERT INTO public.bulk_dispatch_audit (
    actor_id, actor_email, action, entity_type, entity_id,
    previous_value, new_value, metadata
  )
  VALUES (
    v_caller, v_actor_email, 'failed_order_resolved',
    'dispatch_batch_item', p_item_id::text,
    jsonb_build_object('item_status', v_item.status, 'order_id', v_order_id),
    v_result,
    jsonb_build_object(
      'action', p_action, 'order_id', v_order_id,
      'order_table', v_item.order_table, 'order_prefix', v_prefix,
      'batch_id', v_item.batch_id, 'notes', p_notes
    )
  );

  RETURN v_result;
END $function$;