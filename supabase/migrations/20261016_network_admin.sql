-- Admin "Sub-agents" section: read models and actions. Every function checks phase1.caller_is_admin().
-- Applied to production 16 Oct 2026 via the Supabase MCP.

-- A programme the admin paused: the parent cannot switch it back on, the Join page disappears, existing subs keep working.
alter table phase1.agents add column if not exists network_paused_at timestamptz;
alter table phase1.agents add column if not exists network_paused_reason text;

create or replace function phase1.network_tier_open(p_agent uuid) returns boolean
language sql stable security definer set search_path to 'phase1','public' as $$
  select (coalesce((v->>'enabled')::boolean, false) or (p_agent is not null and (v->'allow') ? p_agent::text) or exists (select 1 from phase1.agents s where s.id = p_agent and s.parent_agent_id is not null))
     and not exists (select 1 from phase1.agents a where a.id = p_agent and a.network_paused_at is not null)
  from (select value v from phase1.site_settings where key = 'network_tier') s
$$;

create or replace function phase1.agent_set_network(p jsonb) returns void
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_id uuid;
begin
  select id into v_id from phase1.agents where user_id = auth.uid() and status = 'active';
  if v_id is null then raise exception 'not_an_agent'; end if;
  if exists (select 1 from phase1.agents where id = v_id and parent_agent_id is not null) then raise exception 'sub_agents_cannot_recruit'; end if;
  if exists (select 1 from phase1.agents where id = v_id and network_paused_at is not null) then raise exception 'programme_paused_by_admin'; end if;
  if not phase1.network_tier_open(v_id) then raise exception 'coming_soon'; end if;
  update phase1.agents set
    network_on = coalesce((p->>'network_on')::boolean, network_on),
    network_fee = coalesce(greatest((p->>'network_fee')::numeric, 0), network_fee),
    network_pitch = case when p ? 'network_pitch' then nullif(left(regexp_replace(p->>'network_pitch','<[^>]*>','','g'),1500),'') else network_pitch end,
    updated_at = now()
  where id = v_id;
end $$;

-- ── Read models ──────────────────────────────────────────────────────────────────────────────

create or replace function phase1.admin_network_overview(p_from timestamptz default null, p_to timestamptz default null) returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $$
  select case when not phase1.caller_is_admin() then null else jsonb_build_object(
    'tier', (select value from phase1.site_settings where key = 'network_tier'),
    'parents', jsonb_build_object(
      'programmes_on', (select count(*) from phase1.agents where parent_agent_id is null and network_on and network_paused_at is null),
      'with_subs', (select count(distinct parent_agent_id) from phase1.agents where parent_agent_id is not null),
      'paused', (select count(*) from phase1.agents where network_paused_at is not null)),
    'subs', jsonb_build_object(
      'total', (select count(*) from phase1.agents where parent_agent_id is not null),
      'active', (select count(*) from phase1.agents where parent_agent_id is not null and status = 'active'),
      'awaiting_payment', (select count(*) from phase1.agents where parent_agent_id is not null and status = 'awaiting_payment'),
      'lapsed', (select count(*) from phase1.agents where parent_agent_id is not null and status in ('lapsed','paused')),
      'suspended', (select count(*) from phase1.agents where parent_agent_id is not null and status = 'suspended'),
      'new_in_period', (select count(*) from phase1.agents where parent_agent_id is not null and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to))),
    'applications', jsonb_build_object(
      'pending', (select count(*) from phase1.network_applications where status = 'pending'),
      'approved', (select count(*) from phase1.network_applications where status = 'approved' and (p_from is null or decided_at >= p_from) and (p_to is null or decided_at < p_to)),
      'declined', (select count(*) from phase1.network_applications where status = 'declined' and (p_from is null or decided_at >= p_from) and (p_to is null or decided_at < p_to))),
    'fees', (select jsonb_build_object('count', count(*), 'gross', coalesce(sum(amount),0), 'to_parents', coalesce(sum((metadata->>'base')::numeric),0), 'ours', coalesce(sum((metadata->>'fee')::numeric),0))
             from phase1.finance_live_entries where kind = 'network_fee' and (p_from is null or occurred_at >= p_from) and (p_to is null or occurred_at < p_to)),
    'sales', (select jsonb_build_object('orders', count(*), 'amount', coalesce(sum(amount),0), 'parent_margin', coalesce(sum(parent_margin),0), 'sub_margin', coalesce(sum(agent_margin),0), 'our_cost', coalesce(sum(cost_amount),0))
              from phase1.orders where parent_agent_id is not null and status = 'delivered' and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at < p_to)),
    'errors', (select count(*) from phase1.system_errors where source in ('payment_events_network_fee','parent_order_settle') and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to))
  ) end
$$;

create or replace function phase1.admin_network_parents() returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $$
  select case when not phase1.caller_is_admin() then null else coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.subs_total desc, x.store_name) from (
    select a.id, a.slug, a.store_name, a.status, a.paid_until, a.network_on, a.network_fee, a.network_auto_approve, a.network_paused_at, a.network_paused_reason, a.created_at,
      phase1.network_tier_open(a.id) as tier_open,
      (select count(*) from phase1.agents s where s.parent_agent_id = a.id) as subs_total,
      (select count(*) from phase1.agents s where s.parent_agent_id = a.id and s.status = 'active') as subs_active,
      (select count(*) from phase1.network_applications n where n.parent_agent_id = a.id and n.status = 'pending') as pending_apps,
      (select coalesce(sum((e.metadata->>'base')::numeric),0) from phase1.finance_live_entries e where e.kind = 'network_fee' and (e.metadata->>'parent_agent_id')::uuid = a.id) as fee_income,
      (select coalesce(sum(o.parent_margin),0) from phase1.orders o where o.parent_agent_id = a.id and o.status = 'delivered') as margin_income,
      (select coalesce(sum(o.amount),0) from phase1.orders o where o.parent_agent_id = a.id and o.status = 'delivered') as sub_sales,
      (select count(*) from phase1.orders o where o.parent_agent_id = a.id and o.payment_status = 'succeeded') as sub_orders
    from phase1.agents a
    where a.parent_agent_id is null and (a.network_on or a.network_paused_at is not null or exists (select 1 from phase1.agents s where s.parent_agent_id = a.id) or exists (select 1 from phase1.network_applications n where n.parent_agent_id = a.id))
  ) x), '[]'::jsonb) end
$$;

create or replace function phase1.admin_network_subs() returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $$
  select case when not phase1.caller_is_admin() then null else coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc) from (
    select s.id, s.slug, s.store_name, s.status, s.paid_until, s.created_at, s.whatsapp, s.user_id, s.earnings_balance,
      p.id as parent_id, p.slug as parent_slug, p.store_name as parent_name, p.network_fee as parent_fee,
      (select email from phase1.profiles where id = s.user_id) as email,
      (select count(*) from phase1.orders o where o.agent_id = s.id and o.payment_status = 'succeeded') as orders,
      (select coalesce(sum(o.amount),0) from phase1.orders o where o.agent_id = s.id and o.status = 'delivered') as sales,
      (select coalesce(sum(o.parent_margin),0) from phase1.orders o where o.agent_id = s.id and o.status = 'delivered') as parent_margin,
      (select coalesce(sum(o.agent_margin),0) from phase1.orders o where o.agent_id = s.id and o.status = 'delivered') as own_margin,
      (select coalesce(sum((e.metadata->>'base')::numeric),0) from phase1.finance_live_entries e where e.kind = 'network_fee' and (e.metadata->>'agent_id')::uuid = s.id) as fees_paid,
      (select max(o.paid_at) from phase1.orders o where o.agent_id = s.id and o.payment_status = 'succeeded') as last_order_at
    from phase1.agents s join phase1.agents p on p.id = s.parent_agent_id
  ) x), '[]'::jsonb) end
$$;

create or replace function phase1.admin_network_applications(p_status text default null) returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $$
  select case when not phase1.caller_is_admin() then null else coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc) from (
    select n.id, n.status, n.applicant_name, n.applicant_email, n.applicant_phone, n.store_name, n.requested_slug, n.whatsapp, n.answers, n.decision_note, n.decided_at, n.agent_id, n.created_at,
      p.id as parent_id, p.slug as parent_slug, p.store_name as parent_name, p.network_fee as parent_fee, p.network_auto_approve,
      (select slug from phase1.agents where id = n.agent_id) as agent_slug
    from phase1.network_applications n join phase1.agents p on p.id = n.parent_agent_id
    where p_status is null or n.status = p_status
    limit 500
  ) x), '[]'::jsonb) end
$$;

create or replace function phase1.admin_network_fees(p_limit int default 200) returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $$
  select case when not phase1.caller_is_admin() then null else coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc) from (
    select i.id, i.status::text, i.amount, i.provider_reference, i.created_at, i.verified_at,
      (i.metadata->>'baseAmount')::numeric as base, (i.metadata->>'feeAmount')::numeric as fee, (i.metadata->>'months')::int as months, (i.metadata->>'percent_off')::numeric as percent_off,
      (i.metadata->>'agent_id')::uuid as sub_id, (select store_name from phase1.agents where id = (i.metadata->>'agent_id')::uuid) as sub_name,
      (i.metadata->>'parent_agent_id')::uuid as parent_id, (select store_name from phase1.agents where id = (i.metadata->>'parent_agent_id')::uuid) as parent_name,
      exists (select 1 from phase1.finance_entries f where f.kind = 'network_fee' and f.reference = i.provider_reference) as applied,
      (select message from phase1.system_errors e where e.reference = i.provider_reference order by created_at desc limit 1) as error
    from phase1.payment_intents i where i.purpose = 'network_fee'
    order by i.created_at desc limit greatest(1, least(p_limit, 1000))
  ) x), '[]'::jsonb) end
$$;

-- ── Actions ──────────────────────────────────────────────────────────────────────────────────

create or replace function phase1.admin_network_set_tier(p_enabled boolean, p_allow uuid[]) returns jsonb
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v jsonb;
begin
  if not phase1.caller_is_admin() then raise exception 'admin_only'; end if;
  v := jsonb_build_object('enabled', coalesce(p_enabled, false), 'allow', coalesce((select jsonb_agg(distinct x::text) from unnest(coalesce(p_allow, '{}'::uuid[])) x), '[]'::jsonb));
  insert into phase1.site_settings (key, value) values ('network_tier', v) on conflict (key) do update set value = excluded.value;
  return v;
end $$;

create or replace function phase1.admin_network_pause(p_parent uuid, p_pause boolean, p_reason text default null) returns void
language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_only'; end if;
  if p_pause then
    update phase1.agents set network_on = false, network_paused_at = now(), network_paused_reason = left(p_reason, 300), updated_at = now() where id = p_parent and parent_agent_id is null;
  else
    update phase1.agents set network_paused_at = null, network_paused_reason = null, updated_at = now() where id = p_parent;
  end if;
end $$;

-- Move a sub under another parent (prices below the new parent's floor are lifted), or detach it (p_new_parent null):
-- it becomes an ordinary agent that must buy the DataYego plan, and any price below DataYego's agent price is lifted.
create or replace function phase1.admin_network_move_sub(p_sub uuid, p_new_parent uuid default null) returns void
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_old uuid;
begin
  if not phase1.caller_is_admin() then raise exception 'admin_only'; end if;
  select parent_agent_id into v_old from phase1.agents where id = p_sub;
  if v_old is null then raise exception 'not_a_sub_agent'; end if;
  if p_new_parent is not null then
    if p_new_parent = p_sub or not exists (select 1 from phase1.agents where id = p_new_parent and parent_agent_id is null) then raise exception 'invalid_parent'; end if;
    update phase1.agents set parent_agent_id = p_new_parent, updated_at = now() where id = p_sub;
  else
    update phase1.agents set parent_agent_id = null, status = case when status = 'active' then 'awaiting_payment'::phase1.agent_status else status end, paid_until = null, updated_at = now() where id = p_sub;
  end if;
  update phase1.agent_prices sp set price = f.floor, updated_at = now()
  from (select sp2.product_id, phase1.agent_cost_price(p_sub, sp2.product_id) as floor from phase1.agent_prices sp2 where sp2.agent_id = p_sub) f
  where sp.agent_id = p_sub and sp.product_id = f.product_id and sp.price < f.floor;
end $$;

create or replace function phase1.admin_network_set_sub_status(p_sub uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('active','suspended','paused') then raise exception 'invalid_status'; end if;
  update phase1.agents set status = p_status::phase1.agent_status, updated_at = now() where id = p_sub and parent_agent_id is not null;
end $$;

-- Admin grants months to a sub without a payment (goodwill / fixing a failed fee). Nothing is posted to the parent.
create or replace function phase1.admin_network_grant_months(p_sub uuid, p_months int) returns date
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_until date;
begin
  if not phase1.caller_is_admin() then raise exception 'admin_only'; end if;
  if p_months < 1 or p_months > 24 then raise exception 'invalid_months'; end if;
  update phase1.agents set paid_until = (greatest(coalesce(paid_until, current_date), current_date) + (p_months || ' months')::interval)::date,
    status = case when status in ('awaiting_payment','paused','lapsed') then 'active' else status end, updated_at = now()
  where id = p_sub and parent_agent_id is not null returning paid_until into v_until;
  return v_until;
end $$;

create or replace function phase1.admin_system_errors(p_limit int default 100) returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $$
  select case when not phase1.caller_is_admin() then null else coalesce((select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc) from (select * from phase1.system_errors order by created_at desc limit greatest(1, least(p_limit, 1000))) x), '[]'::jsonb) end
$$;
