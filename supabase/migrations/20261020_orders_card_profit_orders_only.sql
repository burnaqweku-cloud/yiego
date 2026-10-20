-- Orders page "profit" card: count only ledger entries tied to an order (sale, bundle cost, agent share,
-- checkout fee). Supplier wallet corrections (float_correction) and other non-order entries belong on Finance
-- and must not move the per-day order profit. Adds period.order_profit and period.order_fee_income.
-- Applied live on 20 Oct 2026.
CREATE OR REPLACE FUNCTION phase1.finance_overview_unchecked(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
with bal as (select * from phase1.finance_balances),
dated as (
  select e.id, coalesce(o.paid_at, e.occurred_at) as at, (o.id is not null) as is_order
  from phase1.finance_entries e left join phase1.orders o on o.order_reference = e.reference
),
period as (
  select p.account, sum(p.amount) as amt
  from phase1.finance_postings p join dated d on d.id = p.entry_id
  where (p_from is null or d.at >= p_from) and (p_to is null or d.at < p_to)
  group by p.account
),
-- Orders only: entries tied to an order reference. Wallet/float corrections and other non-order
-- entries are left out, so this is "profit on the orders in the range" and nothing else.
period_orders as (
  select p.account, sum(p.amount) as amt
  from phase1.finance_postings p join dated d on d.id = p.entry_id
  where d.is_order and (p_from is null or d.at >= p_from) and (p_to is null or d.at < p_to)
  group by p.account
),
pl as (
  select
    -coalesce((select amt from period where account='revenue'),0) as revenue,
    -coalesce((select amt from period where account='fee_income'),0) as fee_income,
     coalesce((select amt from period where account='cost_of_bundles'),0) as cost_of_bundles,
     coalesce((select amt from period where account='paystack_fees'),0) as paystack_fees,
     coalesce((select amt from period where account='supplier_topup_fees'),0) as topup_fees,
     coalesce((select amt from period where account='other_expenses'),0) as other_expenses,
     coalesce((select amt from period where account='agent_margin'),0) as agent_margin,
    -coalesce((select amt from period where account='agent_subscriptions'),0) as agent_subscriptions,
    -coalesce((select amt from period where account='agent_payout_fees'),0) as agent_payout_fees,
    -coalesce((select amt from period_orders where account='revenue'),0) as o_revenue,
    -coalesce((select amt from period_orders where account='fee_income'),0) as o_fee_income,
     coalesce((select amt from period_orders where account='cost_of_bundles'),0) as o_cost_of_bundles,
     coalesce((select amt from period_orders where account='agent_margin'),0) as o_agent_margin
)
select jsonb_build_object(
  'start', phase1.finance_start_at(),
  'cash', jsonb_build_object(
    'bank', (select balance from bal where code='bank'),
    'paystack_transit', (select balance from bal where code='paystack_transit'),
    'supplier_float', (select jsonb_object_agg(replace(code,'float_',''), balance) from bal where code like 'float_%')),
  'owed', jsonb_build_object(
    'customer_wallets', (select balance from bal where code='customer_wallets'),
    'undelivered', (select balance from bal where code='owed_deliveries'),
    'undelivered_count', (select count(*) from phase1.orders where paid_at >= phase1.finance_start_at() and status not in ('delivered','refunded','cancelled')),
    'refunds_due', (select balance from bal where code='refunds_due'),
    'agents', coalesce((select balance from bal where code='owed_to_agents'),0)),
  'funding', jsonb_build_object('outside', (select balance from bal where code='outside_funding'), 'carried_in', (select balance from bal where code='opening_balance')),
  'period', (select jsonb_build_object(
    'revenue', revenue, 'fee_income', fee_income, 'cost_of_bundles', cost_of_bundles,
    'paystack_fees', paystack_fees, 'topup_fees', topup_fees, 'other_expenses', other_expenses,
    'agent_margin', agent_margin, 'agent_subscriptions', agent_subscriptions, 'agent_payout_fees', agent_payout_fees,
    'network_fees_gross', (select coalesce(sum(amount),0) from phase1.finance_live_entries e where e.kind = 'network_fee' and (p_from is null or e.occurred_at >= p_from) and (p_to is null or e.occurred_at < p_to)),
    'network_fees_to_parents', (select coalesce(sum((e.metadata->>'base')::numeric),0) from phase1.finance_live_entries e where e.kind = 'network_fee' and (p_from is null or e.occurred_at >= p_from) and (p_to is null or e.occurred_at < p_to)),
    'network_fees_ours', (select coalesce(sum((e.metadata->>'fee')::numeric),0) from phase1.finance_live_entries e where e.kind = 'network_fee' and (p_from is null or e.occurred_at >= p_from) and (p_to is null or e.occurred_at < p_to)),
    'gross_profit', revenue - cost_of_bundles - agent_margin,
    'order_profit', o_revenue - o_cost_of_bundles - o_agent_margin,
    'order_fee_income', o_fee_income,
    'net', revenue + fee_income + agent_subscriptions + agent_payout_fees - cost_of_bundles - agent_margin - paystack_fees - topup_fees - other_expenses,
    'net_excluding_fee_passthrough', revenue + agent_subscriptions + agent_payout_fees - cost_of_bundles - agent_margin - paystack_fees - topup_fees - other_expenses) from pl),
  'all_time', jsonb_build_object(
    'cash_in', (select coalesce(sum(amount),0) from phase1.finance_live_entries where kind in ('order_paid','wallet_deposit') and (metadata->>'via') is distinct from 'wallet'),
    'payouts_received', (select coalesce(sum(amount),0) from phase1.finance_live_entries where kind='paystack_payout'),
    'supplier_topups', (select coalesce(sum(amount),0) from phase1.finance_live_entries where kind='supplier_topup'),
    'delivered_revenue', (select balance from bal where code='revenue'))
);
$function$;
