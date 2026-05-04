
-- Admin dashboard summary: revenue, profit totals from orders + agent_orders
-- Replaces fetching all rows client-side (was hitting 1000-row cap)
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
    (SELECT COALESCE(SUM(amount_ghs), 0) FROM orders WHERE is_checkpoint = false AND status IN ('Paid','Processing','Delivered')),
    (SELECT COALESCE(SUM(profit_ghs), 0) FROM orders WHERE is_checkpoint = false AND status IN ('Paid','Processing','Delivered') AND profit_ghs IS NOT NULL),
    (SELECT COUNT(*) FROM orders WHERE is_checkpoint = false AND status IN ('Paid','Processing','Delivered')),
    (SELECT COALESCE(SUM(agent_selling_price), 0) FROM agent_orders WHERE status IN ('Paid','Processing','Delivered')),
    (SELECT COALESCE(SUM(COALESCE(agent_profit_at_purchase, profit_ghs, 0)), 0) FROM agent_orders WHERE status IN ('Paid','Processing','Delivered')),
    (SELECT COUNT(*) FROM agent_orders WHERE status IN ('Paid','Processing','Delivered'))
  ;
$$;

-- Agent order stats aggregated by agent_id (replaces fetching ALL agent_orders client-side)
CREATE OR REPLACE FUNCTION public.admin_agent_order_stats()
RETURNS TABLE(
  agent_id uuid,
  order_count bigint,
  total_revenue numeric,
  total_profit numeric,
  last_order_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ao.agent_id,
    COUNT(*),
    COALESCE(SUM(ao.agent_selling_price), 0),
    COALESCE(SUM(ao.profit_ghs), 0),
    MAX(ao.created_at)
  FROM agent_orders ao
  WHERE ao.status IN ('Paid','Processing','Delivered')
     OR ao.payment_status = 'paid'
  GROUP BY ao.agent_id;
$$;
