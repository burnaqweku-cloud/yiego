-- Partner (influencer) programme on the external phase1 schema: fixed per-bundle earnings credited when an attributed
-- order is delivered. Tables are not directly readable; all access goes through SECURITY DEFINER RPCs.

insert into phase1.finance_accounts (code, name, kind, sort_order) values
  ('owed_to_partners', 'Partner earnings owed', 'liability', 45),
  ('partner_commission', 'Partner earnings', 'expense', 85)
on conflict (code) do nothing;

create table if not exists phase1.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  code text not null unique,
  name text not null,
  package text not null default 'starter' check (package in ('starter','pro','premier')),
  status text not null default 'active' check (status in ('active','paused')),
  momo_number text,
  created_at timestamptz not null default now(),
  created_by uuid
);
create table if not exists phase1.partner_rates (
  product_id uuid primary key references phase1.data_products(id),
  starter numeric(10,2) not null default 0 check (starter >= 0),
  pro numeric(10,2) not null default 0 check (pro >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists phase1.partner_orders (
  order_id uuid primary key references phase1.orders(id),
  partner_id uuid not null references phase1.partners(id),
  created_at timestamptz not null default now()
);
create table if not exists phase1.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references phase1.partners(id),
  amount numeric(12,2) not null check (amount > 0),
  reference text,
  paid_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists phase1.partner_earnings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references phase1.partners(id),
  order_id uuid not null unique references phase1.orders(id),
  amount numeric(10,2) not null,
  package text not null,
  status text not null default 'owed' check (status in ('owed','paid','void')),
  payout_id uuid references phase1.partner_payouts(id),
  created_at timestamptz not null default now()
);
create index if not exists partner_earnings_partner_idx on phase1.partner_earnings(partner_id, created_at desc);
create index if not exists partner_orders_partner_idx on phase1.partner_orders(partner_id);

revoke all on phase1.partners, phase1.partner_rates, phase1.partner_orders, phase1.partner_payouts, phase1.partner_earnings from anon, authenticated;
grant all on phase1.partners, phase1.partner_rates, phase1.partner_orders, phase1.partner_payouts, phase1.partner_earnings to service_role;
alter table phase1.partners enable row level security;
alter table phase1.partner_rates enable row level security;
alter table phase1.partner_orders enable row level security;
alter table phase1.partner_payouts enable row level security;
alter table phase1.partner_earnings enable row level security;

-- Starter = 40% and Pro = 60% of (shop price - DataBundlesHub cost), payment fees ignored. MTN only for now.
insert into phase1.partner_rates (product_id, starter, pro) values
  ('8971201b-946d-467f-8900-4ef74adc069b', 0.06, 0.09),
  ('1dcf9a9b-74a6-47f8-9c6b-5c152ec7e262', 0.44, 0.66),
  ('828019b4-d396-4581-bd76-767f52a49527', 0.66, 0.99),
  ('209d32af-a898-4e0d-87bc-8edb1151e4a1', 0.88, 1.32),
  ('a5840734-d2ba-4c7d-b104-381f8fea4f03', 1.06, 1.59),
  ('8809d127-756a-4a6c-98c7-33d147fd6028', 1.00, 1.50),
  ('6f771dfa-527e-44a3-85e6-20f4e4d8e98e', 1.68, 2.52),
  ('0c092226-5af6-48cf-a952-eca4cbf2b6e2', 1.40, 2.10),
  ('5d7d1453-3721-4b12-b62a-17dbe7cebe85', 2.52, 3.78),
  ('09fe9785-2daa-45a4-b955-e74bf79b5b9d', 2.60, 3.90),
  ('3763d279-5fc3-48e8-9d97-28fb487efe81', 4.20, 6.30),
  ('c2021038-55fb-428d-8116-0265e4c312ee', 5.20, 7.80),
  ('3e969c05-9446-407a-9966-436efaa81211', 6.28, 9.42),
  ('d5fd634c-3f4e-4bdd-ba0e-97181badbf32', 1.60, 2.40)
on conflict (product_id) do nothing;

-- Link an order to the partner whose link the shopper arrived from. Only the order's owner (account or device token)
-- can attach, only main-shop orders, only once, never the partner's own purchases.
create or replace function phase1.partner_attach_order(p_reference text, p_code text, p_token text default null)
returns boolean language plpgsql security definer set search_path to 'phase1','public' as $$
declare o record; p record;
begin
  select * into o from phase1.orders where order_reference = p_reference;
  if o.id is null or o.agent_id is not null then return false; end if;
  if o.status not in ('awaiting_payment','paid','processing','pending_supplier') or o.created_at < now() - interval '6 hours' then return false; end if;
  if not ((auth.uid() is not null and o.user_id = auth.uid()) or (p_token is not null and o.management_token = p_token)) then return false; end if;
  select * into p from phase1.partners where code = upper(trim(p_code)) and status = 'active';
  if p.id is null or p.user_id = o.user_id or p.user_id = o.paid_by_user_id then return false; end if;
  insert into phase1.partner_orders (order_id, partner_id) values (o.id, p.id) on conflict do nothing;
  return found;
end $$;

-- Credit / void earnings as attributed orders change status. Never blocks the order update.
create or replace function phase1.partner_orders_trigger()
returns trigger language plpgsql security definer set search_path to 'phase1','public' as $$
declare po record; pr record; v_amt numeric; e record;
begin
  begin
    if new.status = 'delivered' and old.status is distinct from 'delivered' then
      select x.partner_id, p.package, p.user_id into po from phase1.partner_orders x join phase1.partners p on p.id = x.partner_id where x.order_id = new.id;
      if po.partner_id is null or po.user_id = new.user_id then return new; end if;
      select * into pr from phase1.partner_rates where product_id = new.product_id;
      v_amt := round(coalesce(case when po.package = 'starter' then pr.starter else pr.pro end, 0) * greatest(coalesce(new.quantity,1),1), 2);
      if v_amt <= 0 then return new; end if;
      insert into phase1.partner_earnings (partner_id, order_id, amount, package) values (po.partner_id, new.id, v_amt, po.package)
        on conflict (order_id) do nothing;
      if found then
        perform phase1.finance_post('partner_earned', new.id::text, now(), v_amt,
          jsonb_build_array(jsonb_build_object('account','partner_commission','amount', v_amt), jsonb_build_object('account','owed_to_partners','amount', -v_amt)),
          'auto', null, 'Partner earning '||new.order_reference, jsonb_build_object('partner_id', po.partner_id), null);
      end if;
    elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
      update phase1.partner_earnings set status = 'void' where order_id = new.id and status = 'owed' returning * into e;
      if e.id is not null then
        perform phase1.finance_post('partner_earned_void', new.id::text, now(), e.amount,
          jsonb_build_array(jsonb_build_object('account','owed_to_partners','amount', e.amount), jsonb_build_object('account','partner_commission','amount', -e.amount)),
          'auto', null, 'Partner earning voided (refund) '||new.order_reference, jsonb_build_object('partner_id', e.partner_id), null);
      end if;
    end if;
  exception when others then
    raise warning 'partner_orders_trigger: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists partner_orders_status on phase1.orders;
create trigger partner_orders_status after update of status on phase1.orders
  for each row when (new.status is distinct from old.status) execute function phase1.partner_orders_trigger();

-- Partner's own dashboard.
create or replace function phase1.partner_dashboard()
returns jsonb language plpgsql stable security definer set search_path to 'phase1','public' as $$
declare p record; v_week_start timestamptz := date_trunc('week', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
begin
  select * into p from phase1.partners where user_id = auth.uid();
  if p.id is null then return null; end if;
  return jsonb_build_object(
    'code', p.code, 'name', p.name, 'package', p.package, 'status', p.status,
    'owed', coalesce((select sum(amount) from phase1.partner_earnings where partner_id = p.id and status = 'owed'), 0),
    'paid', coalesce((select sum(amount) from phase1.partner_payouts where partner_id = p.id), 0),
    'orders_today', (select count(*) from phase1.partner_earnings where partner_id = p.id and status <> 'void' and created_at >= v_day_start),
    'orders_week', (select count(*) from phase1.partner_earnings where partner_id = p.id and status <> 'void' and created_at >= v_week_start),
    'orders_total', (select count(*) from phase1.partner_earnings where partner_id = p.id and status <> 'void'),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'gb', d.capacity_gb, 'network', n.name, 'starter', r.starter, 'pro', r.pro) order by n.name, d.capacity_gb)
       from phase1.partner_rates r join phase1.data_products d on d.id = r.product_id join phase1.networks n on n.id = d.network_id where d.is_active and (r.starter > 0 or r.pro > 0)), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x) from (select o.order_reference ref, d.name bundle, e.amount, e.status, e.created_at
       from phase1.partner_earnings e join phase1.orders o on o.id = e.order_id left join phase1.data_products d on d.id = o.product_id
       where e.partner_id = p.id order by e.created_at desc limit 30) x), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(x) from (select amount, reference, created_at from phase1.partner_payouts where partner_id = p.id order by created_at desc limit 20) x), '[]'::jsonb));
end $$;

-- Admin.
create or replace function phase1.admin_partners()
returns jsonb language plpgsql stable security definer set search_path to 'phase1','public' as $$
declare v_week_start timestamptz := date_trunc('week', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
begin
  perform phase1.finance_assert_admin(auth.uid());
  return jsonb_build_object(
    'partners', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select p.id, p.code, p.name, p.package, p.status, p.momo_number, p.created_at, u.email,
        coalesce((select sum(amount) from phase1.partner_earnings e where e.partner_id = p.id and e.status = 'owed'), 0) owed,
        coalesce((select sum(amount) from phase1.partner_payouts y where y.partner_id = p.id), 0) paid,
        (select count(*) from phase1.partner_earnings e where e.partner_id = p.id and e.status <> 'void' and e.created_at >= v_week_start) orders_week,
        (select count(*) from phase1.partner_earnings e where e.partner_id = p.id and e.status <> 'void') orders_total
      from phase1.partners p left join auth.users u on u.id = p.user_id) x), '[]'::jsonb),
    'rates', coalesce((select jsonb_agg(jsonb_build_object('product_id', d.id, 'name', d.name, 'gb', d.capacity_gb, 'network', n.name, 'price', d.customer_price, 'starter', coalesce(r.starter,0), 'pro', coalesce(r.pro,0)) order by n.name, d.capacity_gb)
      from phase1.data_products d join phase1.networks n on n.id = d.network_id left join phase1.partner_rates r on r.product_id = d.id where d.is_active), '[]'::jsonb));
end $$;

create or replace function phase1.admin_partner_create(p_email text, p_name text, p_code text default null)
returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_user uuid; v_code text; p record;
begin
  perform phase1.finance_assert_admin(auth.uid());
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'no_account_with_that_email'; end if;
  v_code := upper(regexp_replace(coalesce(nullif(trim(p_code),''), left(regexp_replace(p_name,'[^A-Za-z0-9]','','g'),8) || substr(md5(gen_random_uuid()::text),1,4)), '[^A-Za-z0-9]', '', 'g'));
  if length(v_code) < 3 then raise exception 'code_too_short'; end if;
  insert into phase1.partners (user_id, code, name, created_by) values (v_user, v_code, trim(p_name), auth.uid()) returning * into p;
  return to_jsonb(p);
end $$;

create or replace function phase1.admin_partner_update(p_id uuid, p_package text default null, p_status text default null, p_momo text default null)
returns void language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  perform phase1.finance_assert_admin(auth.uid());
  update phase1.partners set package = coalesce(p_package, package), status = coalesce(p_status, status), momo_number = coalesce(p_momo, momo_number) where id = p_id;
  if not found then raise exception 'partner_not_found'; end if;
end $$;

create or replace function phase1.admin_partner_set_rate(p_product uuid, p_starter numeric, p_pro numeric)
returns void language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  perform phase1.finance_assert_master(auth.uid());
  if p_starter < 0 or p_pro < 0 then raise exception 'invalid_rate'; end if;
  insert into phase1.partner_rates (product_id, starter, pro, updated_at) values (p_product, round(p_starter,2), round(p_pro,2), now())
  on conflict (product_id) do update set starter = excluded.starter, pro = excluded.pro, updated_at = now();
end $$;

-- Pay everything owed to a partner: earnings -> paid, bank down, debt down. Profit unchanged (earning was already counted).
create or replace function phase1.admin_partner_pay(p_id uuid, p_reference text default null)
returns numeric language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_amt numeric; v_payout uuid; p record;
begin
  perform phase1.finance_assert_master(auth.uid());
  select * into p from phase1.partners where id = p_id for update;
  if p.id is null then raise exception 'partner_not_found'; end if;
  select coalesce(sum(amount),0) into v_amt from phase1.partner_earnings where partner_id = p_id and status = 'owed';
  if v_amt <= 0 then raise exception 'nothing_owed'; end if;
  insert into phase1.partner_payouts (partner_id, amount, reference, paid_by) values (p_id, v_amt, nullif(trim(p_reference),''), auth.uid()) returning id into v_payout;
  update phase1.partner_earnings set status = 'paid', payout_id = v_payout where partner_id = p_id and status = 'owed';
  perform phase1.finance_post('partner_payout', v_payout::text, now(), v_amt,
    jsonb_build_array(jsonb_build_object('account','owed_to_partners','amount', v_amt), jsonb_build_object('account','bank','amount', -v_amt)),
    'manual', null, 'Partner payout to '||p.name||coalesce(' ('||nullif(trim(p_reference),'')||')',''), jsonb_build_object('partner_id', p_id), auth.uid());
  return v_amt;
end $$;

revoke all on function phase1.partner_attach_order(text,text,text), phase1.partner_dashboard(), phase1.admin_partners(),
  phase1.admin_partner_create(text,text,text), phase1.admin_partner_update(uuid,text,text,text), phase1.admin_partner_set_rate(uuid,numeric,numeric),
  phase1.admin_partner_pay(uuid,text), phase1.partner_orders_trigger() from public;
grant execute on function phase1.partner_attach_order(text,text,text) to anon, authenticated;
grant execute on function phase1.partner_dashboard(), phase1.admin_partners(), phase1.admin_partner_create(text,text,text),
  phase1.admin_partner_update(uuid,text,text,text), phase1.admin_partner_set_rate(uuid,numeric,numeric), phase1.admin_partner_pay(uuid,text) to authenticated;
