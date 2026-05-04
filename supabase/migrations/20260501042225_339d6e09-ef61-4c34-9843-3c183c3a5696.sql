CREATE OR REPLACE FUNCTION public.admin_dashboard_period_totals(p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(normal_total bigint, normal_delivered bigint, normal_processing bigint, normal_pending bigint, normal_pending_payment bigint, normal_failed bigint, normal_revenue numeric, normal_profit numeric, normal_gb_delivered numeric, normal_mtn bigint, normal_telecel bigint, normal_at bigint, agent_total bigint, agent_delivered bigint, agent_processing bigint, agent_failed bigint, agent_revenue numeric, agent_profit numeric, new_users bigint, deposits_confirmed_count bigint, deposits_confirmed_amount numeric, deposits_pending_count bigint, deposits_pending_amount numeric, deposits_rejected_count bigint, agent_withdrawals_pending_count bigint, agent_withdrawals_pending_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH n AS (
    SELECT * FROM orders
     WHERE is_checkpoint = false
       AND COALESCE(order_source, '') <> 'admin_bulk'
       AND (p_start IS NULL OR created_at >= p_start)
       AND (p_end   IS NULL OR created_at <  p_end)
  ),
  a AS (
    SELECT * FROM agent_orders
     WHERE (p_start IS NULL OR created_at >= p_start)
       AND (p_end   IS NULL OR created_at <  p_end)
  )
  SELECT
    (SELECT COUNT(*) FROM n),
    (SELECT COUNT(*) FROM n WHERE status = 'Delivered'),
    (SELECT COUNT(*) FROM n WHERE status IN ('Processing','Paid')),
    (SELECT COUNT(*) FROM n WHERE status = 'Pending'),
    (SELECT COUNT(*) FROM n WHERE status = 'Pending Payment'),
    (SELECT COUNT(*) FROM n WHERE status = 'Failed'),
    (SELECT COALESCE(SUM(amount_ghs),0) FROM n WHERE status IN ('Paid','Processing','Delivered')),
    (SELECT COALESCE(SUM(profit_ghs),0) FROM n WHERE status IN ('Paid','Processing','Delivered') AND profit_ghs IS NOT NULL),
    (SELECT COALESCE(SUM(bundle_size_gb),0) FROM n WHERE status = 'Delivered'),
    (SELECT COUNT(*) FROM n WHERE network = 'MTN'),
    (SELECT COUNT(*) FROM n WHERE network = 'Telecel'),
    (SELECT COUNT(*) FROM n WHERE network IN ('AirtelTigo','Airteltigo','AT')),

    (SELECT COUNT(*) FROM a),
    (SELECT COUNT(*) FROM a WHERE status = 'Delivered'),
    (SELECT COUNT(*) FROM a WHERE status IN ('Processing','Paid')),
    (SELECT COUNT(*) FROM a WHERE status = 'Failed'),
    (SELECT COALESCE(SUM(agent_selling_price),0) FROM a WHERE status IN ('Paid','Processing','Delivered')),
    (SELECT COALESCE(SUM(COALESCE(agent_profit_at_purchase, profit_ghs, 0)),0) FROM a WHERE status IN ('Paid','Processing','Delivered')),

    (SELECT COUNT(*) FROM profiles
       WHERE (p_start IS NULL OR created_at >= p_start)
         AND (p_end   IS NULL OR created_at <  p_end)),

    (SELECT COUNT(*) FROM wallet_transactions WHERE type='deposit' AND status='confirmed'
       AND (p_start IS NULL OR created_at >= p_start) AND (p_end IS NULL OR created_at < p_end)),
    (SELECT COALESCE(SUM(amount_ghs),0) FROM wallet_transactions WHERE type='deposit' AND status='confirmed'
       AND (p_start IS NULL OR created_at >= p_start) AND (p_end IS NULL OR created_at < p_end)),
    -- Pending deposits: ONLY manual transfer deposits (exclude Paystack and other auto providers)
    (SELECT COUNT(*) FROM wallet_transactions WHERE type='deposit' AND status='pending'
       AND provider IN ('manual','manual_transfer')
       AND (p_start IS NULL OR created_at >= p_start) AND (p_end IS NULL OR created_at < p_end)),
    (SELECT COALESCE(SUM(amount_ghs),0) FROM wallet_transactions WHERE type='deposit' AND status='pending'
       AND provider IN ('manual','manual_transfer')
       AND (p_start IS NULL OR created_at >= p_start) AND (p_end IS NULL OR created_at < p_end)),
    (SELECT COUNT(*) FROM wallet_transactions WHERE type='deposit' AND status='rejected'
       AND (p_start IS NULL OR created_at >= p_start) AND (p_end IS NULL OR created_at < p_end)),

    (SELECT COUNT(*) FROM agent_withdrawals WHERE status IN ('pending','approved')
       AND (p_start IS NULL OR created_at >= p_start) AND (p_end IS NULL OR created_at < p_end)),
    (SELECT COALESCE(SUM(amount_ghs),0) FROM agent_withdrawals WHERE status IN ('pending','approved')
       AND (p_start IS NULL OR created_at >= p_start) AND (p_end IS NULL OR created_at < p_end))
  ;
$function$;