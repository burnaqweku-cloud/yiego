-- Allow mixed-bundle batches: bundle_size_gb may be NULL on new batches
ALTER TABLE public.dispatch_batches ALTER COLUMN bundle_size_gb DROP NOT NULL;

-- Replace RPC: group queued orders by network only (mixed bundle sizes), FIFO, chunks of 20
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
  v_total_count int;
  v_total_batches int := 0;
  v_total_items int := 0;
  v_chunk_idx int := 0;
  v_chunk_size int;
  v_offset int := 0;
  v_size_summary jsonb;
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

  -- Pull queued orders for this network from both tables, FIFO globally
  INSERT INTO _eligible (order_table, order_uuid, order_id, recipient, network, bundle_size_gb, created_at)
  SELECT * FROM (
    SELECT 'orders'::text, o.id, o.order_id, o.recipient_number, o.network, o.bundle_size_gb, o.created_at
    FROM public.orders o
    WHERE o.network = p_network AND o.queue_state = 'queued'
    FOR UPDATE SKIP LOCKED
  ) s
  ORDER BY s.created_at ASC;

  INSERT INTO _eligible (order_table, order_uuid, order_id, recipient, network, bundle_size_gb, created_at)
  SELECT * FROM (
    SELECT 'agent_orders'::text, a.id, a.order_id, a.customer_phone, a.network, a.bundle_size_gb, a.created_at
    FROM public.agent_orders a
    WHERE a.network = p_network AND a.queue_state = 'queued'
    FOR UPDATE SKIP LOCKED
  ) s
  ORDER BY s.created_at ASC;

  SELECT COUNT(*) INTO v_total_count FROM _eligible;

  WHILE v_offset < v_total_count LOOP
    v_chunk_size := LEAST(20, v_total_count - v_offset);
    v_chunk_idx := v_chunk_idx + 1;
    v_total_batches := v_total_batches + 1;

    v_batch_number := 'BATCH-' || to_char(now() AT TIME ZONE 'Africa/Accra', 'YYYYMMDD-HH24MISS')
                      || '-' || upper(p_network)
                      || '-' || lpad(v_chunk_idx::text, 2, '0');

    INSERT INTO public.dispatch_batches (
      batch_number, network, bundle_size_gb, bundle_label,
      status, order_count, created_by
    )
    VALUES (
      v_batch_number, p_network, NULL, 'Mixed',
      'new', v_chunk_size,
      coalesce(v_actor_email, v_caller::text)
    )
    RETURNING id INTO v_batch_id;

    WITH chunk AS (
      SELECT order_table, order_uuid, order_id, recipient, network, bundle_size_gb
      FROM _eligible
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
      SELECT order_uuid, order_table, bundle_size_gb
      FROM _eligible
      ORDER BY created_at ASC, seq ASC
      OFFSET v_offset LIMIT v_chunk_size
    )
    SELECT jsonb_object_agg(bundle_size_gb::text, cnt)
      INTO v_size_summary
    FROM (
      SELECT bundle_size_gb, COUNT(*) AS cnt
      FROM _eligible
      ORDER BY created_at ASC, seq ASC
      OFFSET v_offset LIMIT v_chunk_size
    ) sub
    GROUP BY ();

    -- Recompute summary cleanly (the above CTE was unused; replace with direct aggregation)
    SELECT jsonb_object_agg(bundle_size_gb::text, cnt)
      INTO v_size_summary
    FROM (
      SELECT bundle_size_gb, COUNT(*) AS cnt
      FROM (
        SELECT bundle_size_gb
        FROM _eligible
        ORDER BY created_at ASC, seq ASC
        OFFSET v_offset LIMIT v_chunk_size
      ) windowed
      GROUP BY bundle_size_gb
    ) sub;

    WITH chunk AS (
      SELECT order_uuid, order_table
      FROM _eligible
      ORDER BY created_at ASC, seq ASC
      OFFSET v_offset LIMIT v_chunk_size
    )
    UPDATE public.orders SET queue_state = 'batched', updated_at = now()
    WHERE id IN (SELECT order_uuid FROM chunk WHERE order_table = 'orders');

    WITH chunk AS (
      SELECT order_uuid, order_table
      FROM _eligible
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
        'order_count', v_chunk_size,
        'chunk_index', v_chunk_idx,
        'bundle_size_summary', coalesce(v_size_summary, '{}'::jsonb)
      )
    );

    v_result := v_result || jsonb_build_object(
      'batch_id', v_batch_id,
      'batch_number', v_batch_number,
      'order_count', v_chunk_size
    );

    v_offset := v_offset + v_chunk_size;
  END LOOP;

  RETURN jsonb_build_object(
    'network', p_network,
    'total_batches', v_total_batches,
    'total_items', v_total_items,
    'batches', v_result
  );
END $function$;