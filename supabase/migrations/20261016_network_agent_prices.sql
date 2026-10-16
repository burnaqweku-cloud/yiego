-- Parents set a separate price list for their agents ("Prices for your agents"), like DataYego's own
-- public price vs agent price. A sub-agent buys at that price; the parent's margin is that price minus
-- DataYego's agent price. Bundles with no agent price set fall back to the parent's store price (old behaviour).
-- Applied to production 16 Oct 2026 via the Supabase MCP.

create table if not exists phase1.network_prices (
  agent_id uuid not null references phase1.agents(id) on delete cascade,
  product_id uuid not null references phase1.data_products(id) on delete cascade,
  price numeric(10,2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (agent_id, product_id)
);
alter table phase1.network_prices enable row level security;
-- A parent reads their own list; a sub reads their parent's (it is their cost); admins read all. Writes go through the RPC.
create policy network_prices_read on phase1.network_prices for select to authenticated
  using (agent_id in (select id from phase1.agents where user_id = auth.uid())
      or agent_id in (select parent_agent_id from phase1.agents where user_id = auth.uid())
      or private.is_phase1_admin());
grant select on phase1.network_prices to authenticated;

create or replace function phase1.agent_cost_price(p_agent uuid, p_product uuid) returns numeric
language sql stable as $$
  select case when a.parent_agent_id is null then d.agent_price
    else coalesce((select price from phase1.network_prices where agent_id = a.parent_agent_id and product_id = p_product),
                  (select price from phase1.agent_prices where agent_id = a.parent_agent_id and product_id = p_product),
                  d.store_default_price, d.customer_price) end
  from phase1.agents a, phase1.data_products d where a.id = p_agent and d.id = p_product
$$;

-- Parent sets the price their agents pay for one bundle. Floor: DataYego's agent price (the parent's own cost).
-- Any sub already priced below the new figure is lifted to it.
create or replace function phase1.agent_set_network_price(p_product_id uuid, p_price numeric) returns void
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_agent uuid; v_floor numeric;
begin
  select id into v_agent from phase1.agents where user_id = auth.uid() and parent_agent_id is null;
  if v_agent is null then raise exception 'not_a_parent_agent'; end if;
  if not phase1.network_tier_open(v_agent) then raise exception 'coming_soon'; end if;
  select agent_price into v_floor from phase1.data_products where id = p_product_id and is_active;
  if v_floor is null then raise exception 'unknown_product'; end if;
  if p_price < v_floor then raise exception 'below_agent_price:%', v_floor; end if;
  insert into phase1.network_prices (agent_id, product_id, price) values (v_agent, p_product_id, round(p_price,2))
  on conflict (agent_id, product_id) do update set price = excluded.price, updated_at = now();
  update phase1.agent_prices sp set price = round(p_price,2), updated_at = now()
  from phase1.agents s where s.id = sp.agent_id and s.parent_agent_id = v_agent and sp.product_id = p_product_id and sp.price < round(p_price,2);
end $$;

-- The parent's own store price no longer moves sub prices (their cost is the agent price list now), except for
-- bundles where no agent price is set, which still fall back to the store price.
create or replace function phase1.agent_set_price(p_product_id uuid, p_price numeric) returns void
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_agent uuid; v_floor numeric; v_is_parent boolean;
begin
  select id, parent_agent_id is null into v_agent, v_is_parent from phase1.agents where user_id = auth.uid();
  if v_agent is null then raise exception 'not_an_agent'; end if;
  if not exists (select 1 from phase1.data_products where id = p_product_id and is_active) then raise exception 'unknown_product'; end if;
  v_floor := phase1.agent_cost_price(v_agent, p_product_id);
  if p_price < v_floor then raise exception 'below_agent_price:%', v_floor; end if;
  insert into phase1.agent_prices (agent_id, product_id, price) values (v_agent, p_product_id, round(p_price,2)) on conflict (agent_id, product_id) do update set price = excluded.price, updated_at = now();
  if v_is_parent and not exists (select 1 from phase1.network_prices where agent_id = v_agent and product_id = p_product_id) then
    update phase1.agent_prices sp set price = round(p_price,2), updated_at = now()
    from phase1.agents s where s.id = sp.agent_id and s.parent_agent_id = v_agent and sp.product_id = p_product_id and sp.price < round(p_price,2);
  end if;
end $$;

-- What the parent sees on "Prices for your agents": per active bundle, our agent price (their cost), their store
-- price, the agent price they set (null = not set, store price applies), and how many of their agents sell it.
create or replace function phase1.my_network_prices() returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $$
  with me as (select id from phase1.agents where user_id = auth.uid() and parent_agent_id is null)
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', d.id, 'name', d.name, 'capacity_gb', d.capacity_gb, 'network', n.name,
    'our_agent_price', d.agent_price, 'public_price', d.customer_price,
    'store_price', coalesce((select price from phase1.agent_prices where agent_id = (select id from me) and product_id = d.id), d.store_default_price, d.customer_price),
    'agent_price', (select price from phase1.network_prices where agent_id = (select id from me) and product_id = d.id)
  ) order by n.name, d.capacity_gb), '[]'::jsonb)
  from phase1.data_products d join phase1.networks n on n.id = d.network_id
  where d.is_active and exists (select 1 from me)
$$;
