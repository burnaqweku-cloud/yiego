-- 13 Nov 2026: the Orders page "profit" is strictly what is left on delivered orders.
-- Read-only. It changes no money record and nothing on the Finance page.
-- For every delivered order paid in the range, from that order's own records:
--   + what the customer paid for the bundle            (orders.amount)
--   - what the supplier charged us                     (orders.cost_amount)
--   - the agent's earnings and the parent agent's share (orders.agent_margin, orders.parent_margin)
--   - partner commission on that order, if any          (partner_earnings, not void)
--   + the checkout fee the customer paid on top         (amount charged - orders.amount; nothing for wallet orders)
--   - what Paystack or Kora actually took from that payment (the fee recorded on the payment itself, never a guessed percentage)
-- Before this the tile left out the gateway's cut and the parent share (booked under "<order>:parent").
create or replace function phase1.admin_orders_profit(p_from timestamptz default null, p_to timestamptz default null, p_source text default 'all')
returns jsonb language plpgsql stable security definer set search_path to 'phase1', 'public' as $$
declare v jsonb;
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  with d as (
    select o.amount, o.cost_amount, coalesce(o.agent_margin, 0) as agent_cut, coalesce(o.parent_margin, 0) as parent_cut,
           pay.via, coalesce(pay.charged - o.amount, 0) as checkout_fee, pay.gateway_fee,
           coalesce((select sum(pe.amount) from phase1.partner_earnings pe where pe.order_id = o.id and pe.status::text <> 'void'), 0) as partner_cut
    from phase1.orders o
    left join lateral (
      select pi.provider::text as via, pi.amount as charged,
             (select case when e.provider::text = 'paystack' then nullif(e.payload->'data'->>'fees', '')::numeric / 100
                          else nullif(e.payload->'data'->>'fee', '')::numeric end
                from phase1.payment_events e
               where e.provider::text = pi.provider::text and e.provider_reference = pi.provider_reference and e.event_type = 'charge.success' limit 1) as gateway_fee
      from phase1.payment_intents pi
      where pi.order_id = o.id and pi.status::text = 'succeeded' order by pi.verified_at desc nulls last limit 1) pay on true
    where o.status = 'delivered' and o.paid_at is not null
      and (p_from is null or o.paid_at >= p_from) and (p_to is null or o.paid_at < p_to)
      and (coalesce(p_source, 'all') = 'all' or (p_source = 'agents') = (o.agent_id is not null))
  )
  select jsonb_build_object(
    'delivered', count(*),
    'sales', round(coalesce(sum(amount), 0), 2),
    'supplier_cost', round(coalesce(sum(coalesce(cost_amount, 0)), 0), 2),
    'agent_earnings', round(coalesce(sum(agent_cut), 0), 2),
    'parent_share', round(coalesce(sum(parent_cut), 0), 2),
    'partner_commission', round(coalesce(sum(partner_cut), 0), 2),
    'checkout_fees', round(coalesce(sum(checkout_fee), 0), 2),
    'paystack_charges', round(coalesce(sum(gateway_fee) filter (where via = 'paystack'), 0), 2),
    'kora_charges', round(coalesce(sum(gateway_fee) filter (where via = 'kora'), 0), 2),
    'other_charges', round(coalesce(sum(gateway_fee) filter (where via not in ('paystack', 'kora')), 0), 2),
    'no_cost_recorded', count(*) filter (where cost_amount is null),
    'no_charge_recorded', count(*) filter (where via is not null and gateway_fee is null),
    'profit', round(coalesce(sum(amount - coalesce(cost_amount, 0) - agent_cut - parent_cut - partner_cut + checkout_fee - coalesce(gateway_fee, 0)), 0), 2)
  ) into v from d;
  return v;
end $$;
revoke all on function phase1.admin_orders_profit(timestamptz, timestamptz, text) from public, anon;
grant execute on function phase1.admin_orders_profit(timestamptz, timestamptz, text) to authenticated, service_role;
