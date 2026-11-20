-- The "Orders received" card on /admin/orders counted orders by reading rows into the browser, and a read
-- returns at most 1,000 rows: with more than 1,000 paid orders in 7 days the card always said "1000"
-- (owner, 20 Nov 2026: "Why does 7 days always filter 1000?"), and because the read went oldest first
-- it dropped the newest orders. The card now takes every figure from this sum, done in the database.
-- Days and hours are Ghana time (GMT).

create or replace function phase1.admin_orders_pulse(p_from timestamptz, p_to timestamptz, p_source text default 'all')
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare v jsonb;
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  with base as (
    select o.paid_at, o.status::text as status, o.amount, o.agent_id, coalesce(o.agent_margin, 0) as agent_margin,
           coalesce(nw.name, '—') as network, coalesce(dp.capacity_gb, 0) as gb
    from phase1.orders o
    left join phase1.networks nw on nw.id = o.network_id
    left join phase1.data_products dp on dp.id = o.product_id
    where o.payment_status::text = 'succeeded' and o.paid_at >= p_from and o.paid_at <= p_to
  ), r as (
    select * from base
    where coalesce(p_source, 'all') = 'all' or (p_source = 'agents' and agent_id is not null) or (p_source = 'platform' and agent_id is null)
  )
  select jsonb_build_object(
    'orders', (select count(*) from r),
    'delivered', (select count(*) from r where status = 'delivered'),
    'refunded', (select count(*) from r where status = 'refunded'),
    'cancelled', (select count(*) from r where status = 'cancelled'),
    'revenue', (select coalesce(sum(amount), 0) from r),
    'gb', (select coalesce(sum(gb), 0) from r),
    'agent_margin', (select coalesce(sum(agent_margin), 0) from r),
    'agent_orders', (select count(*) from base where agent_id is not null),
    'by_network', coalesce((select jsonb_agg(jsonb_build_object('name', network, 'n', n, 'amt', amt) order by n desc, network)
                            from (select network, count(*) n, sum(amount) amt from r group by network) x), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d)
                        from (select to_char(paid_at at time zone 'Africa/Accra', 'YYYY-MM-DD') d, count(*) n from r group by 1) x), '[]'::jsonb),
    'by_hour', (select jsonb_agg(coalesce(c.n, 0) order by h.h) from generate_series(0, 23) h(h)
                left join (select extract(hour from paid_at at time zone 'Africa/Accra')::int hr, count(*) n from r group by 1) c on c.hr = h.h)
  ) into v;
  return v;
end $$;
-- Callable by signed-in admins only: anyone else gets admin_required.
