
-- Combined orders view for admin unified pagination
CREATE OR REPLACE VIEW public.admin_orders_view AS
SELECT 
  o.id, o.order_id, o.user_id, o.recipient_number, o.customer_name,
  o.network, o.bundle_size_gb, o.amount_ghs, o.cost_price_ghs, o.markup_percent,
  o.profit_ghs, o.status, o.payment_method, o.order_source, o.order_type,
  o.created_at, o.updated_at,
  o.supplier_reference, o.supplier_order_id, o.supplier_status, o.supplier_message,
  o.supplier_raw_response, o.supplier_amount, o.supplier_remaining_balance,
  o.supplier_timestamp,
  o.delivery_note, o.failure_reason, o.admin_notes,
  FALSE AS is_agent_order,
  NULL::uuid AS agent_id,
  NULL::text AS agent_store_name,
  o.amount_ghs AS agent_store_price,
  NULL::numeric AS agent_base_price,
  NULL::numeric AS agent_profit,
  NULL::numeric AS datasika_profit,
  NULL::numeric AS supplier_cost_snapshot,
  FALSE AS profit_credited
FROM public.orders o
WHERE o.is_checkpoint = FALSE

UNION ALL

SELECT 
  ao.id, ao.order_id, NULL::uuid AS user_id,
  ao.customer_phone AS recipient_number, ao.customer_name,
  ao.network, ao.bundle_size_gb,
  ao.agent_selling_price AS amount_ghs, ao.agent_cost_price AS cost_price_ghs,
  NULL::numeric AS markup_percent,
  COALESCE(ao.agent_profit_at_purchase, ao.profit_ghs) AS profit_ghs,
  ao.status, ao.payment_method, ao.order_source,
  'standard'::text AS order_type,
  ao.created_at, ao.updated_at,
  ao.supplier_reference, ao.supplier_order_id, ao.supplier_status, ao.supplier_message,
  ao.supplier_raw_response,
  NULL::numeric AS supplier_amount,
  NULL::numeric AS supplier_remaining_balance,
  NULL::timestamptz AS supplier_timestamp,
  NULL::text AS delivery_note, NULL::text AS failure_reason, NULL::text AS admin_notes,
  TRUE AS is_agent_order,
  ao.agent_id,
  a.store_name AS agent_store_name,
  COALESCE(ao.agent_store_price_at_purchase, ao.agent_selling_price) AS agent_store_price,
  ao.agent_base_price_at_purchase AS agent_base_price,
  ao.agent_profit_at_purchase AS agent_profit,
  ao.datasika_profit_at_purchase AS datasika_profit,
  ao.supplier_cost_at_purchase AS supplier_cost_snapshot,
  ao.profit_credited
FROM public.agent_orders ao
LEFT JOIN public.agents a ON a.id = ao.agent_id;

-- RPC for order summary stats
CREATE OR REPLACE FUNCTION admin_orders_summary()
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
    SELECT amount_ghs, profit_ghs, status FROM orders WHERE is_checkpoint = FALSE
    UNION ALL
    SELECT agent_selling_price, COALESCE(agent_profit_at_purchase, profit_ghs), status FROM agent_orders
  ) combined;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_network ON public.orders(network);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_recipient ON public.orders(recipient_number);
CREATE INDEX IF NOT EXISTS idx_orders_paystack_ref ON public.orders(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_orders_order_source ON public.orders(order_source);
CREATE INDEX IF NOT EXISTS idx_agent_orders_created_desc ON public.agent_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_orders_status ON public.agent_orders(status);
CREATE INDEX IF NOT EXISTS idx_agent_orders_agent ON public.agent_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_orders_payment_status ON public.agent_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_page_views_created_desc ON public.page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON public.page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_paystack_tx_reference ON public.paystack_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_paystack_tx_status ON public.paystack_transactions(status);
CREATE INDEX IF NOT EXISTS idx_paystack_tx_created_desc ON public.paystack_transactions(created_at DESC);

-- Analytics daily metrics
CREATE TABLE IF NOT EXISTS public.analytics_daily_metrics (
  date date PRIMARY KEY,
  total_orders int NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  total_delivered int NOT NULL DEFAULT 0,
  total_failed int NOT NULL DEFAULT 0,
  orders_by_network jsonb NOT NULL DEFAULT '{}',
  orders_by_source jsonb NOT NULL DEFAULT '{}',
  page_views int NOT NULL DEFAULT 0,
  unique_visitors int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin or staff can view analytics_daily_metrics"
  ON public.analytics_daily_metrics FOR SELECT TO authenticated
  USING (is_admin_or_staff());
