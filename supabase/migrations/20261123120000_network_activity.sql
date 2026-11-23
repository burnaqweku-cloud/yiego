-- Which of my agents is selling right now? (23 Nov 2026, a parent agent asked; the owner said yes.)
-- my_network() keeps every field it had and adds, per sub-agent: last_sale_at (newest paid order), today_orders /
-- today_sales (paid since midnight, Ghana time) and week_orders / week_sales (paid in the last 7 days). A sale here is
-- a paid order that was not refunded; it counts from payment, so an MTN order still on its way is already a sale.
create or replace function phase1.my_network()
 returns jsonb language sql stable security definer set search_path to 'phase1', 'public' as $function$
  with me as (select id from phase1.agents where user_id = auth.uid()),
  day0 as (select (date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra') t)
  select jsonb_build_object(
    'agents', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'store_name', s.store_name, 'status', s.status, 'parent_deactivated_at', s.parent_deactivated_at, 'paid_until', s.paid_until, 'created_at', s.created_at, 'whatsapp', s.whatsapp,
        'orders', (select count(*) from phase1.orders o where o.agent_id = s.id and o.payment_status = 'succeeded'),
        'sales', (select coalesce(sum(o.amount),0) from phase1.orders o where o.agent_id = s.id and o.status = 'delivered'),
        'my_margin', (select coalesce(sum(o.parent_margin),0) from phase1.orders o where o.agent_id = s.id and o.status = 'delivered'),
        'fees_paid', (select coalesce(sum(l.amount),0) from phase1.agent_ledger_entries l where l.agent_id = (select id from me) and l.type = 'sale' and l.note like 'Agent fee from%' and l.reference in (select provider_reference from phase1.payment_intents where (metadata->>'agent_id')::uuid = s.id)),
        'last_sale_at', act.last_sale_at, 'today_orders', act.today_orders, 'today_sales', act.today_sales, 'week_orders', act.week_orders, 'week_sales', act.week_sales
      ) order by s.created_at desc), '[]'::jsonb)
      from phase1.agents s
      cross join lateral (
        select max(o.paid_at) last_sale_at,
          count(*) filter (where o.paid_at >= (select t from day0)) today_orders,
          coalesce(sum(o.amount) filter (where o.paid_at >= (select t from day0)), 0) today_sales,
          count(*) filter (where o.paid_at >= now() - interval '7 days') week_orders,
          coalesce(sum(o.amount) filter (where o.paid_at >= now() - interval '7 days'), 0) week_sales
        from phase1.orders o
        where o.agent_id = s.id and o.payment_status = 'succeeded' and o.paid_at is not null and o.status::text <> 'refunded') act
      where s.parent_agent_id = (select id from me)),
    'totals', (select jsonb_build_object('agents', count(*), 'active', count(*) filter (where s.status = 'active'),
        'sales', (select coalesce(sum(o.amount),0) from phase1.orders o where o.parent_agent_id = (select id from me) and o.status = 'delivered'),
        'my_margin', (select coalesce(sum(o.parent_margin),0) from phase1.orders o where o.parent_agent_id = (select id from me) and o.status = 'delivered'),
        'fee_income', (select coalesce(sum(l.amount),0) from phase1.agent_ledger_entries l where l.agent_id = (select id from me) and l.type = 'sale' and l.note like 'Agent fee from%'))
      from phase1.agents s where s.parent_agent_id = (select id from me)))
$function$;

-- Agents' sales (23 Nov 2026, owner: "where they can check their agent sales, how much their agent has made"): one call
-- for the parent's "Agents' sales" page. Period 'today' (since midnight, Ghana time), '7d' and '30d' (that many Ghana
-- days, today included) or 'all'. Per sub-agent: orders, sales, what the agent made (agent_margin) and the parent's
-- share (parent_margin) in the period, plus the last sale ever; totals; and, for 7d / 30d, sales per Ghana day.
-- A sale is a paid order that was not refunded or cancelled, counted from payment (an MTN order still on its way is a
-- sale already). Only the caller's own sub-agents are read (agents.user_id = auth.uid()).
create or replace function phase1.my_network_sales(p_period text default '7d')
 returns jsonb language plpgsql stable security definer set search_path to 'phase1', 'public' as $function$
declare v_me uuid; v_today date := (now() at time zone 'Africa/Accra')::date; v_days int; v_from timestamptz;
begin
  select id into v_me from phase1.agents where user_id = auth.uid() and parent_agent_id is null;
  if v_me is null then raise exception 'not_a_parent_agent'; end if;
  v_days := case p_period when 'today' then 1 when '7d' then 7 when '30d' then 30 when 'all' then null else 7 end;
  v_from := case when v_days is null then '-infinity'::timestamptz else ((v_today - (v_days - 1))::timestamp at time zone 'Africa/Accra') end;
  return (
    with subs as (select s.id, s.slug, s.store_name, s.status, s.parent_deactivated_at, s.created_at from phase1.agents s where s.parent_agent_id = v_me),
    sold as (
      select o.agent_id, o.paid_at, o.amount, coalesce(o.agent_margin, 0) agent_margin, coalesce(o.parent_margin, 0) parent_margin
      from phase1.orders o join subs on subs.id = o.agent_id
      where o.payment_status = 'succeeded' and o.paid_at is not null and o.status::text not in ('refunded', 'cancelled')),
    per as (
      select subs.*, (select max(paid_at) from sold where sold.agent_id = subs.id) last_sale_at,
        count(sold.agent_id) orders, coalesce(sum(sold.amount), 0) sales, coalesce(sum(sold.agent_margin), 0) their_profit, coalesce(sum(sold.parent_margin), 0) my_share
      from subs left join sold on sold.agent_id = subs.id and sold.paid_at >= v_from
      group by subs.id, subs.slug, subs.store_name, subs.status, subs.parent_deactivated_at, subs.created_at)
    select jsonb_build_object(
      'period', case when v_days is null then 'all' else p_period end,
      'from', case when v_days is null then null else (v_today - (v_days - 1)) end,
      'totals', (select jsonb_build_object('agents', count(*), 'selling', count(*) filter (where orders > 0), 'orders', coalesce(sum(orders), 0), 'sales', coalesce(sum(sales), 0), 'their_profit', coalesce(sum(their_profit), 0), 'my_share', coalesce(sum(my_share), 0)) from per),
      'agents', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'store_name', store_name, 'status', status, 'deactivated', parent_deactivated_at is not null, 'last_sale_at', last_sale_at,
          'orders', orders, 'sales', sales, 'their_profit', their_profit, 'my_share', my_share) order by sales desc, last_sale_at desc nulls last, created_at desc), '[]'::jsonb) from per),
      'days', case when v_days in (7, 30) then (
        select jsonb_agg(jsonb_build_object('day', d::date, 'orders', (select count(*) from sold where (sold.paid_at at time zone 'Africa/Accra')::date = d::date), 'sales', (select coalesce(sum(amount), 0) from sold where (sold.paid_at at time zone 'Africa/Accra')::date = d::date)) order by d)
        from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d) else null end));
end $function$;

revoke execute on function phase1.my_network_sales(text) from public, anon;
grant execute on function phase1.my_network_sales(text) to authenticated;
