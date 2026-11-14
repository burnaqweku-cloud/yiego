-- Admin → Agents → All agents: each agent's order figures, added up by the database (15 Nov 2026). Applied live 15 Nov 2026.
-- The page used to read every paid agent order and count them in the browser, but a read returns at most 1,000 rows and
-- there were 1,516, so about a third were left out (an agent with a delivered sale showed "0 orders"). Same rules as the
-- page had: an order the agent bought for themselves (the buyer is the store's owner and it carries no margin) is an
-- "own buy"; everything else is a store sale, and the margin on a delivered store sale is what the agent earned.
-- Read-only; admins only.
create or replace function phase1.admin_agent_order_stats() returns jsonb
language plpgsql stable security definer set search_path to 'phase1', 'public' as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return coalesce((select jsonb_object_agg(x.agent_id, jsonb_build_object('orders', x.orders, 'sales', x.sales, 'sales_count', x.sales_count,
            'own', x.own, 'own_count', x.own_count, 'earned', x.earned))
    from (select o.agent_id,
            count(*) as orders,
            coalesce(sum(o.amount) filter (where not s.self), 0) as sales,
            count(*) filter (where not s.self) as sales_count,
            coalesce(sum(o.amount) filter (where s.self), 0) as own,
            count(*) filter (where s.self) as own_count,
            coalesce(sum(coalesce(o.agent_margin, 0)) filter (where not s.self and o.status::text = 'delivered'), 0) as earned
          from phase1.orders o
          join phase1.agents a on a.id = o.agent_id
          cross join lateral (select (o.user_id is not null and o.user_id = a.user_id and coalesce(o.agent_margin, 0) = 0) as self) s
          where o.payment_status::text = 'succeeded'
          group by o.agent_id) x), '{}'::jsonb);
end $$;
revoke all on function phase1.admin_agent_order_stats() from public, anon;
grant execute on function phase1.admin_agent_order_stats() to authenticated, service_role;
