-- Applied live on 10 Nov 2026.
-- Full tracking of people who arrive through the promotion link (/shop?promo=1, /promo).
--   * promotion_visits gains where the visitor came from (platform, ad click tag, referrer), where they are
--     (country, plus region/city when the network tells us) and what they use (device, system, browser).
--   * promotion_events: one row per step the visitor takes (browser-reported, tied to the visit's secret token).
--   * Orders and wallet top-ups are NOT trusted from the browser: they are read from the real order and payment
--     records and tied to a visit by promotion_order_links() / promotion_deposit_links().
--   * admin_promo_tracking(from, to) and admin_promo_visitor(visit) feed the admin page. Dates are Ghana days;
--     both null means all time. Figures count what happened inside the chosen days.
--   * Tracking has no time limit (owner's decision, 10 Nov): a visitor stays a promo visitor for good, and
--     promotion_track no longer stops counting after 30 days. The promotion PRICE keeps its own 30-day limit
--     (promotion_visit_ok), which is unchanged.

alter table phase1.promotion_visits
  add column if not exists platform text,
  add column if not exists click_id text,
  add column if not exists referrer text,
  add column if not exists landing_path text,
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists device text,
  add column if not exists os text,
  add column if not exists browser text,
  add column if not exists last_activity_at timestamptz;

create table if not exists phase1.promotion_events (
  id bigint generated always as identity primary key,
  visit_id uuid not null references phase1.promotion_visits(id) on delete cascade,
  kind text not null,
  at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  order_id uuid references phase1.orders(id) on delete set null,
  intent_id uuid references phase1.payment_intents(id) on delete set null,
  phone text,
  user_id uuid
);
create index if not exists promotion_events_visit_at on phase1.promotion_events (visit_id, at);
create index if not exists promotion_events_at on phase1.promotion_events (at);
create index if not exists promotion_events_order on phase1.promotion_events (order_id) where order_id is not null;
create index if not exists promotion_events_phone on phase1.promotion_events (phone) where phone is not null;
alter table phase1.promotion_events enable row level security;
drop policy if exists promotion_events_admin_read on phase1.promotion_events;
create policy promotion_events_admin_read on phase1.promotion_events for select
  using (phase1.admin_role(auth.uid()) = any (array['admin'::text, 'master'::text]));

-- Browser-reported step. Never raises: tracking must not get in the way of buying.
create or replace function phase1.promotion_event(p_visit uuid, p_token uuid, p_kind text, p_data jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path to '' as $fn$
declare v phase1.promotion_visits%rowtype; d jsonb := coalesce(p_data, '{}'::jsonb); h jsonb; o_id uuid; i_id uuid; ph text; n int; c text;
begin
  if p_visit is null or p_token is null or p_kind is null or p_kind not in (
    'landing','page_view','flow_opened','network_selected','bundle_selected','mtn_check','checkout_clicked','promo_applied','promo_declined',
    'order_created','review_shown','pay_tapped','payment_started','unpaid_order_shown','order_cancelled','signup_started','signed_in',
    'topup_opened','topup_started','topup_payment_started') then return false; end if;
  if jsonb_typeof(d) <> 'object' or length(d::text) > 1500 then d := '{}'::jsonb; end if;
  select * into v from phase1.promotion_visits where id = p_visit and token_hash = md5(p_token::text) for update;
  if not found then return false; end if;
  select count(*) into n from phase1.promotion_events where visit_id = v.id;
  if n >= 600 then return false; end if;
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;

  if p_kind = 'landing' then
    c := upper(left(coalesce(nullif(nullif(d->>'country', ''), 'XX'), h->>'cf-ipcountry', ''), 2));
    if c !~ '^[A-Z]{2}$' or c in ('XX', 'T1') then c := null; end if;
    update phase1.promotion_visits set
      platform = coalesce(platform, nullif(left(lower(d->>'platform'), 24), '')),
      click_id = coalesce(click_id, nullif(left(lower(d->>'click_id'), 16), '')),
      referrer = coalesce(referrer, nullif(left(d->>'referrer', 120), '')),
      landing_path = coalesce(landing_path, nullif(left(d->>'path', 120), '')),
      country = coalesce(country, c),
      region = coalesce(region, nullif(left(coalesce(h->>'cf-region', h->>'x-vercel-ip-country-region', ''), 60), '')),
      city = coalesce(city, nullif(left(coalesce(h->>'cf-ipcity', h->>'x-vercel-ip-city', ''), 60), '')),
      device = coalesce(device, nullif(left(lower(d->>'device'), 16), '')),
      os = coalesce(os, nullif(left(d->>'os', 24), '')),
      browser = coalesce(browser, nullif(left(d->>'browser', 32), ''))
    where id = v.id;
  end if;

  -- An order or top-up is only tied to this visit when it really exists, is fresh, and is not someone else's.
  if d ? 'order_reference' then
    select o.id into o_id from phase1.orders o where o.order_reference = upper(left(d->>'order_reference', 40))
      and o.created_at > now() - interval '6 hours' and (o.user_id is null or o.user_id = auth.uid());
  end if;
  if d ? 'deposit_reference' and auth.uid() is not null then
    select pi.id into i_id from phase1.payment_intents pi where pi.provider_reference = left(d->>'deposit_reference', 80)
      and pi.purpose::text = 'wallet_deposit' and pi.user_id = auth.uid() and pi.created_at > now() - interval '6 hours';
  end if;
  ph := phase1.promotion_norm_phone(d->>'phone');

  insert into phase1.promotion_events (visit_id, kind, data, order_id, intent_id, phone, user_id)
    values (v.id, p_kind, d - 'phone', o_id, i_id, ph, auth.uid());
  update phase1.promotion_visits set
    last_activity_at = now(),
    signup_started_at = case when p_kind = 'signup_started' then coalesce(signup_started_at, now()) else signup_started_at end,
    checkout_clicked_at = case when p_kind = 'checkout_clicked' then coalesce(checkout_clicked_at, now()) else checkout_clicked_at end,
    user_id = coalesce(user_id, auth.uid())
  where id = v.id;
  return true;
exception when others then return false;
end $fn$;
revoke all on function phase1.promotion_event(uuid, uuid, text, jsonb) from public;
grant execute on function phase1.promotion_event(uuid, uuid, text, jsonb) to anon, authenticated, service_role;

-- Which real orders belong to which visit. One visit per order; the most certain link wins.
create or replace function phase1.promotion_order_links()
returns table(order_id uuid, visit_id uuid, via text) language sql stable security definer set search_path to '' as $fn$
  with c as (
    select e.order_id, e.visit_id, 1 as pr, e.at as t from phase1.promotion_events e where e.order_id is not null
    union all
    select r.order_id, r.visit_id, 2, r.created_at from phase1.promotion_redemptions r where r.order_id is not null and r.visit_id is not null
    union all
    select o.id, v.id, 3, v.created_at from phase1.promotion_visits v
      join phase1.orders o on (o.user_id = v.user_id or o.user_id = v.new_account_id) and o.agent_id is null
        and o.created_at >= v.created_at
    union all
    select o.id, e.visit_id, 4, e.at from phase1.promotion_events e
      join phase1.promotion_visits v on v.id = e.visit_id
      join phase1.orders o on o.user_id is null and o.agent_id is null and o.recipient_phone_normalized = e.phone
        and o.created_at >= e.at - interval '2 minutes'
      where e.phone is not null and e.kind = 'checkout_clicked'
  )
  select distinct on (c.order_id) c.order_id, c.visit_id,
    case c.pr when 1 then 'checkout' when 2 then 'promo price' when 3 then 'account' else 'same number' end
  from c order by c.order_id, c.pr, c.t desc
$fn$;
revoke all on function phase1.promotion_order_links() from public, anon, authenticated;

create or replace function phase1.promotion_deposit_links()
returns table(intent_id uuid, visit_id uuid) language sql stable security definer set search_path to '' as $fn$
  with c as (
    select e.intent_id, e.visit_id, 1 as pr, e.at as t from phase1.promotion_events e where e.intent_id is not null
    union all
    select pi.id, v.id, 2, v.created_at from phase1.promotion_visits v
      join phase1.payment_intents pi on pi.purpose::text = 'wallet_deposit' and (pi.user_id = v.user_id or pi.user_id = v.new_account_id)
        and pi.created_at >= v.created_at
  )
  select distinct on (c.intent_id) c.intent_id, c.visit_id from c order by c.intent_id, c.pr, c.t desc
$fn$;
revoke all on function phase1.promotion_deposit_links() from public, anon, authenticated;

create or replace function phase1.admin_promo_tracking(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare starts timestamptz; ends timestamptz; report jsonb;
begin
  if coalesce(phase1.admin_role(auth.uid()), '') not in ('admin', 'master') then raise exception 'admin_required'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then raise exception 'invalid_date_range'; end if;
  starts := coalesce(p_from::timestamp at time zone 'Africa/Accra', '-infinity'::timestamptz);
  ends := coalesce((p_to + 1)::timestamp at time zone 'Africa/Accra', 'infinity'::timestamptz);

  with ord as (
    select l.visit_id, l.via, o.id, o.order_reference, o.amount, coalesce(o.cost_amount, 0) as cost, o.status::text as status, o.payment_status::text as pay,
      o.created_at, o.paid_at, p.name as bundle, r.id is not null as promo_price, greatest(0, coalesce(r.normal_price - r.price, 0)) as discount
    from phase1.promotion_order_links() l join phase1.orders o on o.id = l.order_id
      left join phase1.data_products p on p.id = o.product_id
      left join phase1.promotion_redemptions r on r.order_id = o.id
  ), paid as (
    select * from ord where pay in ('succeeded', 'refunded') and paid_at >= starts and paid_at < ends
  ), dep as (
    select l.visit_id, pi.id, pi.amount, pi.status::text as status, pi.created_at, coalesce(pi.verified_at, pi.updated_at) as done_at
    from phase1.promotion_deposit_links() l join phase1.payment_intents pi on pi.id = l.intent_id
  ), ev as (
    select e.* from phase1.promotion_events e where e.at >= starts and e.at < ends
  ), mtn as (
    -- the last check each visitor saw in the period
    select distinct on (visit_id) visit_id, data->>'status' as status from ev where kind = 'mtn_check' order by visit_id, at desc
  ), act as (
    -- one row per visitor who did anything in the period
    select v.id, v.created_at, v.created_at >= starts and v.created_at < ends as landed,
      coalesce(v.platform, case when v.source ilike '%facebook%' or v.source ilike '%instagram%' or v.source in ('fb', 'ig', 'meta') then 'meta'
        when v.source ilike '%tiktok%' then 'tiktok' when v.source ilike '%google%' then 'google' when v.source = 'direct' then 'direct' else 'other' end) as platform,
      v.campaign, coalesce(v.country, 'Unknown') as country, coalesce(v.device, 'Unknown') as device, v.source, v.click_id, v.sessions, v.os, v.browser, v.region, v.city,
      v.signup_started_at >= starts and v.signup_started_at < ends as signup_started,
      v.account_created_at >= starts and v.account_created_at < ends as account_created,
      coalesce(v.user_id, v.new_account_id) as uid,
      exists (select 1 from ev e where e.visit_id = v.id and e.kind in ('flow_opened', 'network_selected', 'bundle_selected', 'checkout_clicked')) as opened_buy,
      exists (select 1 from ev e where e.visit_id = v.id and e.kind = 'bundle_selected') as picked,
      exists (select 1 from ev e where e.visit_id = v.id and e.kind = 'checkout_clicked') as entered_number,
      exists (select 1 from ev e where e.visit_id = v.id and e.kind = 'review_shown') as reached_pay,
      exists (select 1 from ev e where e.visit_id = v.id and e.kind in ('pay_tapped', 'payment_started'))
        or exists (select 1 from ord o where o.visit_id = v.id and o.created_at >= starts and o.created_at < ends) as started_payment,
      exists (select 1 from ev e where e.visit_id = v.id and e.kind in ('topup_opened', 'topup_started', 'topup_payment_started')) as topup_started,
      (select m.status from mtn m where m.visit_id = v.id) as mtn_status,
      (select count(*) from paid p where p.visit_id = v.id) as orders_paid,
      (select count(*) from paid p where p.visit_id = v.id and p.status = 'delivered') as delivered,
      (select count(*) from paid p where p.visit_id = v.id and p.pay = 'refunded') as refunded,
      (select count(*) from paid p where p.visit_id = v.id and p.promo_price) as promo_orders,
      (select coalesce(sum(p.amount), 0) from paid p where p.visit_id = v.id and p.pay = 'succeeded') as sales,
      (select coalesce(sum(p.amount - p.cost), 0) from paid p where p.visit_id = v.id and p.pay = 'succeeded') as profit,
      (select coalesce(sum(p.discount), 0) from paid p where p.visit_id = v.id and p.pay = 'succeeded') as discount,
      (select count(*) from ord o where o.visit_id = v.id and o.pay in ('succeeded', 'refunded') and o.paid_at < ends) as orders_ever,
      (select count(*) from dep d where d.visit_id = v.id and d.status = 'succeeded' and d.done_at >= starts and d.done_at < ends) as topups_paid,
      (select coalesce(sum(d.amount), 0) from dep d where d.visit_id = v.id and d.status = 'succeeded' and d.done_at >= starts and d.done_at < ends) as topup_amount,
      greatest(v.created_at, coalesce(v.last_activity_at, v.created_at), coalesce((select max(p.paid_at) from paid p where p.visit_id = v.id), v.created_at)) as last_at,
      coalesce(v.user_id, v.new_account_id) is not null and exists (select 1 from phase1.orders x where x.user_id = coalesce(v.user_id, v.new_account_id)
        and x.payment_status::text in ('succeeded', 'refunded') and x.paid_at < v.created_at) as existing_customer
    from phase1.promotion_visits v
    where (v.created_at >= starts and v.created_at < ends)
      or exists (select 1 from ev e where e.visit_id = v.id)
      or exists (select 1 from paid p where p.visit_id = v.id)
      or exists (select 1 from dep d where d.visit_id = v.id and d.done_at >= starts and d.done_at < ends)
      or (v.signup_started_at >= starts and v.signup_started_at < ends) or (v.account_created_at >= starts and v.account_created_at < ends)
  ), tot as (
    select count(*) as active, count(*) filter (where landed) as landed, coalesce(sum(sessions) filter (where landed), 0) as sessions,
      count(*) filter (where opened_buy) as opened_buy, count(*) filter (where picked) as picked, count(*) filter (where entered_number) as entered_number,
      count(*) filter (where reached_pay) as reached_pay, count(*) filter (where started_payment) as started_payment,
      count(*) filter (where orders_paid > 0) as buyers, count(*) filter (where delivered > 0) as got_delivery,
      count(*) filter (where signup_started) as signup_started, count(*) filter (where account_created) as accounts,
      count(*) filter (where mtn_status = 'approved') as mtn_approved, count(*) filter (where mtn_status = 'not_approved') as mtn_not_approved,
      count(*) filter (where mtn_status = 'unapproved') as mtn_waiting, count(*) filter (where mtn_status is not null) as mtn_checked,
      count(*) filter (where topup_started or topups_paid > 0) as topup_started, count(*) filter (where topups_paid > 0) as topup_payers,
      coalesce(sum(topups_paid), 0) as topups_paid, coalesce(sum(topup_amount), 0) as topup_amount,
      coalesce(sum(orders_paid), 0) as orders_paid, coalesce(sum(delivered), 0) as delivered, coalesce(sum(refunded), 0) as refunded,
      coalesce(sum(promo_orders), 0) as promo_orders, coalesce(sum(sales), 0) as sales, coalesce(sum(profit), 0) as profit, coalesce(sum(discount), 0) as discount,
      count(*) filter (where orders_paid > 0 and orders_ever > 1) as repeat_buyers,
      count(*) filter (where orders_paid > 0 and existing_customer) as existing_buyers
    from act
  ), dims as (
    select 'platform' as dim, a.platform as label, a.landed, a.entered_number, a.started_payment, a.orders_paid, a.sales, a.profit, a.topup_amount from act a union all
    select 'campaign', a.campaign, a.landed, a.entered_number, a.started_payment, a.orders_paid, a.sales, a.profit, a.topup_amount from act a union all
    select 'country', a.country, a.landed, a.entered_number, a.started_payment, a.orders_paid, a.sales, a.profit, a.topup_amount from act a union all
    select 'device', a.device, a.landed, a.entered_number, a.started_payment, a.orders_paid, a.sales, a.profit, a.topup_amount from act a
  ), grouped as (
    select dim, label, count(*) filter (where landed) as visitors, count(*) filter (where entered_number) as entered_number,
      count(*) filter (where started_payment) as started_payment, count(*) filter (where orders_paid > 0) as buyers,
      coalesce(sum(orders_paid), 0) as orders_paid, coalesce(sum(sales), 0) as sales, coalesce(sum(profit), 0) as profit, coalesce(sum(topup_amount), 0) as topup_amount
    from dims group by dim, label
  ), days as (
    select day, sum(visitors) as visitors, sum(entered_number) as entered_number, sum(started_payment) as started_payment, sum(buyers) as buyers,
      sum(orders_paid) as orders_paid, sum(sales) as sales, sum(profit) as profit, sum(topup_amount) as topup_amount
    from (
      select (v.created_at at time zone 'Africa/Accra')::date as day, count(*)::bigint as visitors, 0::bigint as entered_number, 0::bigint as started_payment, 0::bigint as buyers, 0::bigint as orders_paid, 0::numeric as sales, 0::numeric as profit, 0::numeric as topup_amount
        from phase1.promotion_visits v where v.created_at >= starts and v.created_at < ends group by 1
      union all
      select (e.at at time zone 'Africa/Accra')::date, 0, count(distinct e.visit_id) filter (where e.kind = 'checkout_clicked'), count(distinct e.visit_id) filter (where e.kind in ('pay_tapped', 'payment_started')), 0, 0, 0, 0, 0
        from ev e group by 1
      union all
      select (p.paid_at at time zone 'Africa/Accra')::date, 0, 0, 0, count(distinct p.visit_id), count(*), coalesce(sum(p.amount) filter (where p.pay = 'succeeded'), 0), coalesce(sum(p.amount - p.cost) filter (where p.pay = 'succeeded'), 0), 0
        from paid p group by 1
      union all
      select (d.done_at at time zone 'Africa/Accra')::date, 0, 0, 0, 0, 0, 0, 0, coalesce(sum(d.amount), 0)
        from dep d where d.status = 'succeeded' and d.done_at >= starts and d.done_at < ends group by 1
    ) x group by day
  ), bundles as (
    select label, sum(picked) as picked, sum(paid_orders) as paid_orders, sum(sales) as sales from (
      select coalesce(nullif(e.data->>'bundle', ''), 'Unknown') as label, count(distinct e.visit_id)::bigint as picked, 0::bigint as paid_orders, 0::numeric as sales from ev e where e.kind = 'bundle_selected' group by 1
      union all
      select coalesce(p.bundle, 'Unknown'), 0, count(*), coalesce(sum(p.amount) filter (where p.pay = 'succeeded'), 0) from paid p group by 1
    ) b group by label
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'started_at', (select min(created_at) from phase1.promotion_visits),
    'detail_since', (select min(at) from phase1.promotion_events),
    'totals', (select to_jsonb(t) from tot t),
    'platforms', coalesce((select jsonb_agg(to_jsonb(g) - 'dim' order by g.visitors desc, g.buyers desc) from grouped g where g.dim = 'platform'), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(g) - 'dim' order by g.visitors desc, g.buyers desc) from grouped g where g.dim = 'campaign'), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(to_jsonb(g) - 'dim' order by g.visitors desc, g.buyers desc) from grouped g where g.dim = 'country'), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(g) - 'dim' order by g.visitors desc, g.buyers desc) from grouped g where g.dim = 'device'), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from days d), '[]'::jsonb),
    'bundles', coalesce((select jsonb_agg(to_jsonb(b) order by b.paid_orders desc, b.picked desc) from bundles b), '[]'::jsonb),
    'visitor_count', (select count(*) from act),
    'visitors', coalesce((select jsonb_agg(to_jsonb(x) order by x.last_at desc) from (
      select a.id, a.created_at, a.last_at, a.landed, a.platform, a.source, a.campaign, a.click_id, a.country, a.region, a.city, a.device, a.os, a.browser, a.sessions,
        a.uid is not null as has_account, a.account_created, a.existing_customer, a.mtn_status, a.orders_paid, a.delivered, a.sales, a.profit, a.topup_amount,
        case when a.orders_paid > 0 then 'Paid' when a.started_payment then 'Started payment' when a.reached_pay then 'Reached pay screen'
          when a.entered_number then 'Entered number' when a.picked then 'Picked a bundle' when a.opened_buy then 'Opened buy'
          when a.topups_paid > 0 then 'Topped up wallet' when a.account_created then 'Created account' when a.signup_started then 'Started sign-up' else 'Looked only' end as furthest
      from act a order by a.last_at desc limit 300) x), '[]'::jsonb)
  ) into report;
  return report;
end $fn$;
revoke all on function phase1.admin_promo_tracking(date, date) from public, anon;
grant execute on function phase1.admin_promo_tracking(date, date) to authenticated, service_role;

create or replace function phase1.admin_promo_visitor(p_visit uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare report jsonb;
begin
  if coalesce(phase1.admin_role(auth.uid()), '') not in ('admin', 'master') then raise exception 'admin_required'; end if;
  select jsonb_build_object(
    'visit', (select to_jsonb(x) from (select v.id, v.created_at, v.last_seen_at, v.last_activity_at, v.sessions, v.source, v.medium, v.campaign, v.platform, v.click_id, v.referrer,
        v.landing_path, v.country, v.region, v.city, v.device, v.os, v.browser, v.signup_started_at, v.account_created_at, coalesce(v.user_id, v.new_account_id) is not null as has_account,
        (select p.email from phase1.profiles p where p.id = coalesce(v.user_id, v.new_account_id)) as account_email
      from phase1.promotion_visits v where v.id = p_visit) x),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'data', e.data, 'phone', e.phone,
        'order_reference', (select o.order_reference from phase1.orders o where o.id = e.order_id)) order by e.at, e.id)
      from phase1.promotion_events e where e.visit_id = p_visit), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('reference', o.order_reference, 'bundle', p.name, 'phone', o.recipient_phone, 'amount', o.amount,
        'profit', o.amount - coalesce(o.cost_amount, 0), 'status', o.status::text, 'payment', o.payment_status::text, 'provider', coalesce(o.payment_provider::text, case when o.wallet_ledger_entry_id is not null then 'wallet' end),
        'created_at', o.created_at, 'paid_at', o.paid_at, 'via', l.via, 'promo_price', exists (select 1 from phase1.promotion_redemptions r where r.order_id = o.id),
        'delivered_at', (select max(oe.created_at) from phase1.order_events oe where oe.order_id = o.id and oe.to_status::text = 'delivered')) order by o.created_at)
      from phase1.promotion_order_links() l join phase1.orders o on o.id = l.order_id left join phase1.data_products p on p.id = o.product_id where l.visit_id = p_visit), '[]'::jsonb),
    'topups', coalesce((select jsonb_agg(jsonb_build_object('amount', pi.amount, 'status', pi.status::text, 'provider', pi.provider::text, 'created_at', pi.created_at,
        'done_at', case when pi.status::text = 'succeeded' then coalesce(pi.verified_at, pi.updated_at) end) order by pi.created_at)
      from phase1.promotion_deposit_links() l join phase1.payment_intents pi on pi.id = l.intent_id where l.visit_id = p_visit), '[]'::jsonb)
  ) into report;
  return report;
end $fn$;
revoke all on function phase1.admin_promo_visitor(uuid) from public, anon;
grant execute on function phase1.admin_promo_visitor(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
