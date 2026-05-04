-- Create RPC: create_dispatch_batch_from_orders
-- Allows admins to take a hand-picked set of EXISTING normal orders and
-- assemble them into a manual dispatch batch that re-uses the existing
-- dispatch_batches / dispatch_batch_items / mark_batch_sent / mark_batch_delivered
-- workflow. Does NOT touch payments, wallets, supplier APIs, or order status.

CREATE OR REPLACE FUNCTION public.create_dispatch_batch_from_orders(
  p_order_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_actor_email text;
  v_count int;
  v_network text;
  v_distinct_networks int;
  v_batch_id uuid;
  v_batch_number text;
  v_skipped jsonb := '[]'::jsonb;
  v_already_batched int;
BEGIN
  -- 1. Permission: admin only (matches Bulk Dispatch tooling)
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'permission_denied: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_order_ids must contain at least one order_id';
  END IF;

  IF array_length(p_order_ids, 1) > 200 THEN
    RAISE EXCEPTION 'too_many_orders: limit is 200 per batch creation';
  END IF;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_caller;

  -- 2. Lock + collect eligible candidate rows.
  --    Exclude: admin_bulk-sourced orders, missing fields, orders already
  --    inside an active (non-completed) dispatch batch.
  CREATE TEMP TABLE _candidates ON COMMIT DROP AS
  SELECT
    o.id          AS order_uuid,
    o.order_id,
    o.recipient_number,
    o.network,
    o.bundle_size_gb
  FROM public.orders o
  WHERE o.order_id = ANY(p_order_ids)
    AND COALESCE(o.order_source, '') <> 'admin_bulk'
    AND COALESCE(o.is_checkpoint, false) = false
  FOR UPDATE OF o;

  -- Skip orders missing critical fields
  WITH bad AS (
    SELECT order_id,
      CASE
        WHEN recipient_number IS NULL OR recipient_number = '' THEN 'missing_recipient'
        WHEN network IS NULL OR network = '' THEN 'missing_network'
        WHEN bundle_size_gb IS NULL THEN 'missing_bundle_size'
      END AS reason
    FROM _candidates
    WHERE recipient_number IS NULL OR recipient_number = ''
       OR network IS NULL OR network = ''
       OR bundle_size_gb IS NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', order_id, 'reason', reason)), '[]'::jsonb)
    INTO v_skipped
  FROM bad;

  DELETE FROM _candidates
   WHERE recipient_number IS NULL OR recipient_number = ''
      OR network IS NULL OR network = ''
      OR bundle_size_gb IS NULL;

  -- Skip orders already inside an active batch
  WITH active_batched AS (
    SELECT c.order_id
    FROM _candidates c
    JOIN public.dispatch_batch_items i
      ON i.order_table = 'orders' AND i.order_uuid = c.order_uuid
    JOIN public.dispatch_batches b ON b.id = i.batch_id
    WHERE b.status NOT IN ('completed', 'cancelled')
  )
  SELECT v_skipped || COALESCE(jsonb_agg(jsonb_build_object('order_id', order_id, 'reason', 'already_in_active_batch')), '[]'::jsonb)
    INTO v_skipped
  FROM active_batched;

  GET DIAGNOSTICS v_already_batched = ROW_COUNT;

  DELETE FROM _candidates c
   USING public.dispatch_batch_items i, public.dispatch_batches b
   WHERE i.order_table = 'orders'
     AND i.order_uuid = c.order_uuid
     AND b.id = i.batch_id
     AND b.status NOT IN ('completed', 'cancelled');

  SELECT COUNT(*), MAX(network), COUNT(DISTINCT network)
    INTO v_count, v_network, v_distinct_networks
    FROM _candidates;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'no_eligible_orders: % skipped / not eligible', jsonb_array_length(v_skipped)
      USING DETAIL = v_skipped::text;
  END IF;

  IF v_distinct_networks > 1 THEN
    RAISE EXCEPTION 'mixed_networks: selected orders span multiple networks; create one batch per network'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Create the batch (manual marker via batch_number suffix + audit metadata)
  v_batch_number := 'BATCH-' || to_char(now() AT TIME ZONE 'Africa/Accra', 'YYYYMMDD-HH24MISS')
                    || '-' || upper(v_network)
                    || '-MAN-' || lpad((floor(random()*1000))::int::text, 3, '0');

  INSERT INTO public.dispatch_batches (
    batch_number, network, bundle_size_gb, bundle_label,
    status, order_count, created_by, notes
  )
  VALUES (
    v_batch_number, v_network, NULL, 'Mixed (manual)',
    'new', v_count,
    coalesce(v_actor_email, v_caller::text),
    'Manually created from Admin Orders selection'
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO public.dispatch_batch_items (
    batch_id, order_table, order_uuid, order_id,
    recipient_number, bundle_size_gb, network, status
  )
  SELECT v_batch_id, 'orders', order_uuid, order_id,
         recipient_number, bundle_size_gb, network, 'queued'
  FROM _candidates;

  -- 4. Audit log (re-uses existing 'batch_generated' action for compatibility)
  INSERT INTO public.bulk_dispatch_audit (
    actor_id, actor_email, action, entity_type, entity_id, new_value, metadata
  )
  VALUES (
    v_caller, v_actor_email,
    'batch_generated', 'dispatch_batch', v_batch_id::text,
    jsonb_build_object('batch_number', v_batch_number, 'network', v_network, 'order_count', v_count),
    jsonb_build_object(
      'source', 'admin_orders_manual',
      'requested_count', array_length(p_order_ids, 1),
      'created_count', v_count,
      'skipped', v_skipped
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'network', v_network,
    'order_count', v_count,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_dispatch_batch_from_orders(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dispatch_batch_from_orders(text[]) TO authenticated;