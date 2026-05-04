-- =======================================================================
-- Separate admin_bulk orders from normal order views/stats.
-- Existing admin_bulk rows already carry order_source='admin_bulk'
-- (set by admin-bulk-create-order edge function). We use that flag
-- everywhere — no data is mutated, no statuses are changed.
-- =======================================================================

-- 1) admin_orders_view — exclude admin_bulk from the normal admin list.
--    Column list and order kept identical to prior version so app code
--    that selects '*' continues to work unchanged.
CREATE OR REPLACE VIEW public.admin_orders_view AS
SELECT o.id,
   o.order_id,
   o.user_id,
   o.recipient_number,
   o.customer_name,
   o.network,
   o.bundle_size_gb,
   o.amount_ghs,
   o.cost_price_ghs,
   o.markup_percent,
   o.profit_ghs,
   o.status,
   o.payment_method,
   o.order_source,
   o.order_type,
   o.created_at,
   o.updated_at,
   o.supplier_reference,
   o.supplier_order_id,
   o.supplier_status,
   o.supplier_message,
   o.supplier_raw_response,
   o.supplier_amount,
   o.supplier_remaining_balance,
   o.supplier_timestamp,
   o.delivery_note,
   o.failure_reason,
   o.admin_notes,
   false AS is_agent_order,
   NULL::uuid AS agent_id,
   NULL::text AS agent_store_name,
   o.amount_ghs AS agent_store_price,
   NULL::numeric AS agent_base_price,
   NULL::numeric AS agent_profit,
   NULL::numeric AS datasika_profit,
   NULL::numeric AS supplier_cost_snapshot,
   false AS profit_credited,
   o.queue_state
  FROM orders o
 WHERE o.is_checkpoint = false
   AND COALESCE(o.order_source, '') <> 'admin_bulk'
UNION ALL
SELECT ao.id,
   ao.order_id,
   NULL::uuid AS user_id,
   ao.customer_phone AS recipient_number,
   ao.customer_name,
   ao.network,
   ao.bundle_size_gb,
   ao.agent_selling_price AS amount_ghs,
   ao.agent_cost_price AS cost_price_ghs,
   NULL::numeric AS markup_percent,
   COALESCE(ao.agent_profit_at_purchase, ao.profit_ghs) AS profit_ghs,
   ao.status,
   ao.payment_method,
   ao.order_source,
   'standard'::text AS order_type,
   ao.created_at,
   ao.updated_at,
   ao.supplier_reference,
   ao.supplier_order_id,
   ao.supplier_status,
   ao.supplier_message,
   ao.supplier_raw_response,
   NULL::numeric AS supplier_amount,
   NULL::numeric AS supplier_remaining_balance,
   NULL::timestamp with time zone AS supplier_timestamp,
   NULL::text AS delivery_note,
   ao.failure_reason,
   NULL::text AS admin_notes,
   true AS is_agent_order,
   ao.agent_id,
   a.store_name AS agent_store_name,
   COALESCE(ao.agent_store_price_at_purchase, ao.agent_selling_price) AS agent_store_price,
   ao.agent_base_price_at_purchase AS agent_base_price,
   ao.agent_profit_at_purchase AS agent_profit,
   ao.datasika_profit_at_purchase AS datasika_profit,
   ao.supplier_cost_at_purchase AS supplier_cost_snapshot,
   ao.profit_credited,
   ao.queue_state
  FROM agent_orders ao
    LEFT JOIN agents a ON a.id = ao.agent_id;

ALTER VIEW public.admin_orders_view SET (security_invoker = on);

-- 2) admin_orders_summary — exclude admin_bulk from normal totals.
CREATE OR REPLACE FUNCTION public.admin_orders_summary()
RETURNS TABLE(total_revenue numeric, total_profit numeric, processing_count bigint, delivered_count bigint, failed_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN status IN ('Paid','Processing','Delivered') THEN amount_ghs ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status IN ('Paid','Processing','Delivered') AND profit_ghs IS NOT NULL THEN profit_ghs ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE status IN ('Processing','Paid')),
    COUNT(*) FILTER (WHERE status = 'Delivered'),
    COUNT(*) FILTER (WHERE status = 'Failed')
  FROM (
    SELECT amount_ghs, profit_ghs, status FROM orders
      WHERE is_checkpoint = FALSE
        AND COALESCE(order_source, '') <> 'admin_bulk'
    UNION ALL
    SELECT agent_selling_price, COALESCE(agent_profit_at_purchase, profit_ghs), status FROM agent_orders
  ) combined;
$$;

-- 3) admin_dashboard_totals — exclude admin_bulk from normal counts/revenue.
CREATE OR REPLACE FUNCTION public.admin_dashboard_totals()
RETURNS TABLE(
  normal_revenue numeric,
  normal_profit numeric,
  normal_paid_count bigint,
  agent_revenue numeric,
  agent_profit numeric,
  agent_paid_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COALESCE(SUM(amount_ghs), 0) FROM orders
       WHERE is_checkpoint = false
         AND status IN ('Paid','Processing','Delivered')
         AND COALESCE(order_source, '') <> 'admin_bulk'),
    (SELECT COALESCE(SUM(profit_ghs), 0) FROM orders
       WHERE is_checkpoint = false
         AND status IN ('Paid','Processing','Delivered')
         AND profit_ghs IS NOT NULL
         AND COALESCE(order_source, '') <> 'admin_bulk'),
    (SELECT COUNT(*) FROM orders
       WHERE is_checkpoint = false
         AND status IN ('Paid','Processing','Delivered')
         AND COALESCE(order_source, '') <> 'admin_bulk'),
    (SELECT COALESCE(SUM(agent_selling_price), 0) FROM agent_orders WHERE status IN ('Paid','Processing','Delivered')),
    (SELECT COALESCE(SUM(COALESCE(agent_profit_at_purchase, profit_ghs, 0)), 0) FROM agent_orders WHERE status IN ('Paid','Processing','Delivered')),
    (SELECT COUNT(*) FROM agent_orders WHERE status IN ('Paid','Processing','Delivered'))
  ;
$$;

-- 4) New: admin_bulk_orders_summary — stats ONLY for the Bulk Orders page.
CREATE OR REPLACE FUNCTION public.admin_bulk_orders_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM orders
     WHERE is_checkpoint = false
       AND order_source = 'admin_bulk'
  )
  SELECT jsonb_build_object(
    'total_count',           (SELECT COUNT(*) FROM base),
    'today_count',           (SELECT COUNT(*) FROM base
                                WHERE created_at >= (now() AT TIME ZONE 'Africa/Accra')::date AT TIME ZONE 'Africa/Accra'),
    'delivered_count',       (SELECT COUNT(*) FROM base WHERE status = 'Delivered'),
    'processing_count',      (SELECT COUNT(*) FROM base WHERE status IN ('Processing','Paid','Pending')),
    'failed_count',          (SELECT COUNT(*) FROM base WHERE status = 'Failed'),
    'total_gb',              (SELECT COALESCE(SUM(bundle_size_gb), 0) FROM base WHERE status IN ('Paid','Processing','Delivered')),
    'by_network',            (SELECT COALESCE(jsonb_object_agg(network, c), '{}'::jsonb)
                                FROM (SELECT network, COUNT(*) AS c FROM base GROUP BY network) n),
    'by_supplier',           (SELECT COALESCE(jsonb_object_agg(COALESCE(s.code, 'unknown'), x.c), '{}'::jsonb)
                                FROM (SELECT supplier_id, COUNT(*) AS c FROM base GROUP BY supplier_id) x
                                LEFT JOIN suppliers s ON s.id = x.supplier_id),
    'by_status',             (SELECT COALESCE(jsonb_object_agg(status, c), '{}'::jsonb)
                                FROM (SELECT status, COUNT(*) AS c FROM base GROUP BY status) st)
  );
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_orders_summary() TO authenticated;
