-- Follow-ups: a short, polite sequence of messages (email + app notification) for people who signed up
-- or installed the app but never bought, and for customers who went quiet. Off by default
-- (site_settings 'follow_ups'.enabled). The database decides who is due and never picks anyone twice
-- for the same message; the follow-up-run function only delivers.

create table if not exists phase1.follow_up_messages (
  key text primary key,
  track text not null check (track in ('first','back')),
  step int not null,
  wait_days int not null,
  is_offer boolean not null default false,
  enabled boolean not null default true,
  subject text not null, heading text not null, body text not null,
  cta_label text not null, cta_path text not null,
  push_title text not null, push_body text not null,
  updated_at timestamptz not null default now(),
  unique (track, step)
);

create table if not exists phase1.follow_up_sends (
  id bigint generated always as identity primary key,
  person text not null,                 -- user id, or 'd:<device id>' for an app with no account
  user_id uuid, device_id text, email text,
  track text not null, step int not null, message_key text not null,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'claimed' check (status in ('claimed','sent','failed')),
  emailed boolean not null default false, pushed boolean not null default false,
  error text,
  created_at timestamptz not null default now(), sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz,
  unique (person, track, step)
);
create index if not exists follow_up_sends_user_idx on phase1.follow_up_sends (user_id);
create index if not exists follow_up_sends_created_idx on phase1.follow_up_sends (created_at);

create table if not exists phase1.follow_up_optouts (email text primary key, created_at timestamptz not null default now());

alter table phase1.follow_up_messages enable row level security;
alter table phase1.follow_up_sends enable row level security;
alter table phase1.follow_up_optouts enable row level security;

insert into phase1.site_settings (key, value) values ('follow_ups', '{"enabled":false,"daily_cap":80}'::jsonb) on conflict (key) do nothing;

insert into phase1.follow_up_messages (key, track, step, wait_days, is_offer, subject, heading, body, cta_label, cta_path, push_title, push_body) values
('first_1','first',1,1,false,'Your DataYego account is ready','Buy your first bundle in under a minute',
 E'Hi {name},\n\nYour DataYego account is set up and ready to use.\n\nPick a network, choose a bundle, enter the number and pay with mobile money. MTN, Telecel and AirtelTigo bundles are delivered straight to the phone, usually within minutes.\n\nYou can track every order from your account.',
 'Buy data','/shop','Your account is ready','Buy your first data bundle in under a minute.'),
('first_2','first',2,3,false,'Data that does not expire in a week','Bundles that last',
 E'Hi {name},\n\nA quick note in case you have not tried us yet.\n\nOur bundles are not the daily or weekly kind. Most of them last up to 90 days, so you use your data at your own pace.\n\nYou pay with mobile money, and you can see the price before you pay. No hidden charges.',
 'See today''s prices','/shop','Bundles that last','Most DataYego bundles last up to 90 days. See today''s prices.'),
('first_3','first',3,6,true,'A welcome price for you: MTN 1GB for GH₵ {offer_price}','MTN 1GB for GH₵ {offer_price}',
 E'Hi {name},\n\nWe would like you to try DataYego, so here is a welcome price just for you: MTN 1GB for GH₵ {offer_price} instead of GH₵ {normal_price}.\n\nIt works once, for one MTN number, and it is yours for the next 7 days.\n\nThis is the last reminder we will send you.',
 'Claim my 1GB','/g/welcome','MTN 1GB for GH₵ {offer_price}','A welcome price just for you, for the next 7 days.'),
('back_1','back',1,30,false,'It has been a while','Need data again?',
 E'Hi {name},\n\nIt has been a while since your last order on DataYego.\n\nPrices change from time to time, so it is worth a look. Your account, wallet and past orders are all still there.',
 'See today''s prices','/shop','Need data again?','It has been a while. See today''s prices on DataYego.'),
('back_2','back',2,7,true,'Welcome back: MTN 1GB for GH₵ {offer_price}','MTN 1GB for GH₵ {offer_price}',
 E'Hi {name},\n\nTo welcome you back, here is a special price: MTN 1GB for GH₵ {offer_price} instead of GH₵ {normal_price}.\n\nIt works once, for one MTN number, and it is yours for the next 7 days.\n\nThis is the last reminder we will send you.',
 'Claim my 1GB','/g/welcome','Welcome back: 1GB for GH₵ {offer_price}','A special price for you, for the next 7 days.')
on conflict (key) do nothing;

-- The offer: an invitation-only giveaway price. Only people who were sent an offer message in the last 7 days can claim it.
alter table phase1.campaigns add column if not exists invite_only boolean not null default false;
insert into phase1.campaigns (slug, title, blurb, product_id, price, max_redemptions, per_phone, per_user, per_device, is_active, require_account, invite_only)
select 'welcome', 'MTN 1GB for GH₵ 3.50', 'A welcome price from DataYego: 1GB of MTN data for GH₵ 3.50. One per person, by invitation.', p.id, 3.50, 300, 1, 1, 1, true, true, true
from phase1.data_products p where p.app_product_code = 'mtn-1' and not exists (select 1 from phase1.campaigns where slug = 'welcome');

create or replace function phase1.follow_up_invited(p_user uuid) returns boolean language sql stable security definer set search_path = phase1, public as $$
  select p_user is not null and exists (
    select 1 from phase1.follow_up_sends s join phase1.follow_up_messages m on m.key = s.message_key
    where m.is_offer and s.status = 'sent' and s.sent_at > now() - interval '7 days'
      and (s.user_id = p_user or s.device_id in (select d.device_id from phase1.push_devices d where d.user_id = p_user))) $$;
revoke all on function phase1.follow_up_invited(uuid) from public, anon, authenticated;

-- The invitation-only offer never shows as the public giveaway, and only invited people can claim it.
create or replace function phase1.campaign_current() returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select phase1.campaign_public(c.slug) from phase1.campaigns c join phase1.data_products p on p.id = c.product_id join phase1.networks n on n.id = p.network_id
  where c.is_active and not c.invite_only and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now()) and phase1.campaign_used(c.id) < c.max_redemptions and not p.is_paused and not n.is_paused
  order by c.created_at desc limit 1 $$;

create or replace function phase1.campaign_claim(p_slug text, p_phone text, p_device text default null) returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.campaigns%rowtype; v_phone text; v_net text; v_pfx_net text; v_tok text; v_existing phase1.campaign_redemptions%rowtype;
begin
  select * into c from phase1.campaigns where slug = lower(p_slug);
  if c.id is null or not c.is_active or c.starts_at > now() or (c.ends_at is not null and c.ends_at <= now()) then raise exception 'campaign_closed'; end if;
  if c.require_account and auth.uid() is null then raise exception 'sign_in_required'; end if;
  if c.invite_only and not phase1.follow_up_invited(auth.uid()) then raise exception 'not_invited'; end if;
  v_phone := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if v_phone ~ '^233[0-9]{9}$' then v_phone := '0' || substr(v_phone, 4); end if;
  if v_phone !~ '^0[0-9]{9}$' then raise exception 'phone_invalid'; end if;
  select lower(n.code) into v_net from phase1.data_products p join phase1.networks n on n.id = p.network_id where p.id = c.product_id;
  v_pfx_net := lower(coalesce(phase1.network_for_prefix(v_phone), ''));
  if not (v_pfx_net = v_net or (v_pfx_net = 'airteltigo' and v_net = 'at') or (v_pfx_net = 'telecel' and v_net in ('telecel','vodafone'))) then raise exception 'wrong_network'; end if;
  if exists (select 1 from phase1.orders o where o.recipient_phone_normalized = v_phone and o.is_open and o.payment_status = 'succeeded') then raise exception 'order_in_progress'; end if;
  if exists (select 1 from phase1.orders o where o.recipient_phone_normalized = v_phone and o.is_open and o.payment_status <> 'succeeded' and o.created_at > now() - interval '30 minutes') then raise exception 'unpaid_order_open'; end if;
  update phase1.campaign_redemptions set status = 'expired', updated_at = now() where campaign_id = c.id and status in ('reserved','ordered') and reserved_until <= now();
  select * into v_existing from phase1.campaign_redemptions where campaign_id = c.id and recipient_phone = v_phone and status = 'reserved' and reserved_until > now() limit 1;
  if v_existing.id is not null then return jsonb_build_object('token', v_existing.token, 'price', c.price, 'phone', v_phone); end if;
  if (select count(*) from phase1.campaign_redemptions where campaign_id = c.id and recipient_phone = v_phone and status in ('paid','ordered')) >= c.per_phone then raise exception 'phone_used'; end if;
  if auth.uid() is not null and (select count(*) from phase1.campaign_redemptions where campaign_id = c.id and user_id = auth.uid() and status in ('paid','ordered','reserved')) >= c.per_user then raise exception 'account_used'; end if;
  if p_device is not null and (select count(*) from phase1.campaign_redemptions where campaign_id = c.id and device_hash = p_device and status in ('paid','ordered','reserved')) >= c.per_device then raise exception 'device_used'; end if;
  if phase1.campaign_used(c.id) >= c.max_redemptions then raise exception 'campaign_full'; end if;
  insert into phase1.campaign_redemptions (campaign_id, recipient_phone, user_id, device_hash) values (c.id, v_phone, auth.uid(), left(p_device, 120)) returning token into v_tok;
  return jsonb_build_object('token', v_tok, 'price', c.price, 'phone', v_phone);
end $$;

-- Phone notifications gain a 'campaign' kind, which can go to one account or one phone.
alter table phase1.push_outbox add column if not exists device_id text;
alter table phase1.push_outbox drop constraint if exists push_outbox_kind_check;
alter table phase1.push_outbox add constraint push_outbox_kind_check check (kind in ('order_paid','order_delivered','order_refunded','announcement','test','campaign'));

create or replace function phase1.push_recipients(p_id bigint)
returns table (device text, channel text, token text) language plpgsql security definer set search_path = phase1, public as $$
declare j phase1.push_outbox; o phase1.orders;
begin
  select * into j from phase1.push_outbox x where x.id = p_id;
  if j.id is null then return; end if;
  if j.kind in ('order_paid','order_delivered','order_refunded') then
    select * into o from phase1.orders x where x.id = j.order_id;
    return query select d.id::text, d.channel, d.token from phase1.push_devices d
      where d.disabled_at is null and (d.device_id in (select w.device_id from phase1.push_order_watch w where w.order_id = j.order_id)
        or (d.user_id is not null and d.user_id in (o.user_id, o.paid_by_user_id)));
  elsif j.kind = 'announcement' then
    return query select d.id::text, d.channel, d.token from phase1.push_devices d
      where d.disabled_at is null and (j.audience in ('everyone','customers')
        or (j.audience = 'agents' and d.user_id in (select a.user_id from phase1.agents a where a.status = 'active')));
  elsif j.kind in ('test','campaign') then
    return query select d.id::text, d.channel, d.token from phase1.push_devices d
      where d.disabled_at is null and ((j.user_id is not null and d.user_id = j.user_id) or (j.device_id is not null and d.device_id = j.device_id));
  end if;
end $$;

-- Who is due a message right now. One row per person at most; nobody inside 3 days of their last message.
create or replace function phase1.follow_up_due()
returns table (person text, user_id uuid, device_id text, email text, name text, track text, step int, message_key text)
language sql stable security definer set search_path = phase1, public as $$
  with last_send as (
    select s.person, s.track, max(s.step) as step, max(coalesce(s.sent_at, s.created_at)) as at from phase1.follow_up_sends s group by 1, 2),
  recent as (select s.person from phase1.follow_up_sends s where coalesce(s.sent_at, s.created_at) > now() - interval '3 days'),
  buyers as (select o.user_id as id, max(o.paid_at) as last_paid from phase1.orders o where o.user_id is not null and o.paid_at is not null group by 1
             union all select o.paid_by_user_id, max(o.paid_at) from phase1.orders o where o.paid_by_user_id is not null and o.paid_at is not null group by 1),
  last_buy as (select id, max(last_paid) as last_paid from buyers group by 1),
  people as (
    select u.id, lower(u.email) as email, u.created_at, nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '') as name
    from auth.users u left join phase1.profiles p on p.id = u.id
    where u.email is not null and u.email_confirmed_at is not null and coalesce(u.banned_until, now()) <= now()
      and phase1.admin_role(u.id) is null
      and not exists (select 1 from phase1.agents a where a.user_id = u.id)
      and not exists (select 1 from phase1.follow_up_optouts x where x.email = lower(u.email))),
  -- Signed up, never bought.
  first_users as (
    select pe.id::text as person, pe.id as user_id, null::text as device_id, pe.email, pe.name, 'first'::text as track, coalesce(ls.step, 0) + 1 as step,
           coalesce(ls.at, pe.created_at) as since
    from people pe left join last_send ls on ls.person = pe.id::text and ls.track = 'first'
    where not exists (select 1 from last_buy b where b.id = pe.id)
      -- someone who was already followed up on their phone before making an account is not started again
      and not exists (select 1 from phase1.push_devices d join phase1.follow_up_sends s on s.person = 'd:' || d.device_id where d.user_id = pe.id)),
  -- Has the app with notifications on, no account, never bought from that phone.
  first_devices as (
    select 'd:' || d.device_id, null::uuid, d.device_id, null::text, null::text, 'first'::text, coalesce(ls.step, 0) + 1, coalesce(ls.at, min(d.created_at))
    from phase1.push_devices d left join last_send ls on ls.person = 'd:' || d.device_id and ls.track = 'first'
    where d.disabled_at is null and d.user_id is null and d.device_id is not null
      and not exists (select 1 from phase1.push_order_watch w join phase1.orders o on o.id = w.order_id where w.device_id = d.device_id and o.paid_at is not null)
    group by d.device_id, ls.step, ls.at),
  -- Bought before, quiet for a while. Started once; the second message only if they still have not bought.
  back_users as (
    select pe.id::text, pe.id, null::text, pe.email, pe.name, 'back'::text, coalesce(ls.step, 0) + 1, coalesce(ls.at, b.last_paid)
    from people pe join last_buy b on b.id = pe.id left join last_send ls on ls.person = pe.id::text and ls.track = 'back'
    where (ls.step is null and b.last_paid < now() - interval '30 days') or (ls.step is not null and b.last_paid < ls.at)),
  candidates as (select * from first_users union all select * from first_devices union all select * from back_users)
  select c.person, c.user_id, c.device_id, c.email, c.name, c.track, c.step, m.key
  from candidates c join phase1.follow_up_messages m on m.track = c.track and m.step = c.step and m.enabled
  where c.since <= now() - make_interval(days => m.wait_days) and c.person not in (select r.person from recent r)
    -- the offer is only made while there are offers left
    and (not m.is_offer or exists (select 1 from phase1.campaigns k where k.slug = 'welcome' and k.is_active and phase1.campaign_used(k.id) < k.max_redemptions))
  order by c.step desc, c.since desc $$;
revoke all on function phase1.follow_up_due() from public, anon, authenticated;

-- The sender takes the next few. Daytime only (9am to 7pm in Ghana), inside the daily limit.
create or replace function phase1.follow_up_claim(p_limit int default 20)
returns table (id bigint, token uuid, email text, name text, message_key text, subject text, heading text, body text, cta_label text, cta_path text)
language plpgsql security definer set search_path = phase1, public as $$
declare s jsonb; v_room int; v_hour int := extract(hour from now() at time zone 'Africa/Accra'); r record; v_id bigint; v_token uuid; v_offer text; v_normal text; v_pushed boolean;
  m phase1.follow_up_messages;
begin
  select value into s from phase1.site_settings where key = 'follow_ups';
  select trim(to_char(k.price, 'FM990.00')), trim(to_char(p.customer_price, 'FM990.00')) into v_offer, v_normal from phase1.campaigns k join phase1.data_products p on p.id = k.product_id where k.slug = 'welcome';
  -- Previews asked for by an admin go out at once, whatever the switch says.
  for r in select x.* from phase1.follow_up_sends x where x.track = 'preview' and x.status = 'claimed' and x.created_at > now() - interval '30 minutes' loop
    select * into m from phase1.follow_up_messages where key = r.message_key;
    id := r.id; token := r.token; email := r.email; name := null; message_key := m.key;
    subject := replace(replace(m.subject, '{offer_price}', v_offer), '{normal_price}', v_normal); heading := replace(replace(m.heading, '{offer_price}', v_offer), '{normal_price}', v_normal);
    body := replace(replace(m.body, '{offer_price}', v_offer), '{normal_price}', v_normal); cta_label := m.cta_label; cta_path := m.cta_path;
    return next;
  end loop;
  if not coalesce((s->>'enabled')::boolean, false) or v_hour < 9 or v_hour >= 19 then return; end if;
  v_room := least(greatest(p_limit, 1), coalesce((s->>'daily_cap')::int, 80) - (select count(*) from phase1.follow_up_sends x where x.track <> 'preview' and x.created_at >= date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra')::int);
  if v_room <= 0 then return; end if;
  for r in select * from phase1.follow_up_due() limit v_room loop
    select * into m from phase1.follow_up_messages where key = r.message_key;
    insert into phase1.follow_up_sends (person, user_id, device_id, email, track, step, message_key)
    values (r.person, r.user_id, r.device_id, r.email, r.track, r.step, r.message_key)
    on conflict (person, track, step) do nothing returning follow_up_sends.id, follow_up_sends.token into v_id, v_token;
    if v_id is null then continue; end if;
    -- The app notification, for anyone who has notifications on. It opens the same page as the email button.
    v_pushed := exists (select 1 from phase1.push_devices d where d.disabled_at is null and ((r.user_id is not null and d.user_id = r.user_id) or (r.device_id is not null and d.device_id = r.device_id)))
      and phase1.push_enqueue('campaign', 'follow_up:' || v_id, replace(m.push_title, '{offer_price}', v_offer), replace(m.push_body, '{offer_price}', v_offer),
        m.cta_path || '?n=' || v_token, null, null, r.user_id, null, null) is not null;
    if v_pushed and r.device_id is not null then update phase1.push_outbox set device_id = r.device_id where dedupe_key = 'follow_up:' || v_id; end if;
    update phase1.follow_up_sends x set pushed = v_pushed,
      -- a phone with no account has no email: the notification is the whole message
      status = case when r.email is null then (case when v_pushed then 'sent' else 'failed' end) else x.status end,
      sent_at = case when r.email is null then now() else x.sent_at end,
      error = case when r.email is null and not v_pushed then 'Notifications are switched off' else null end
    where x.id = v_id;
    if r.email is null then continue; end if;
    id := v_id; token := v_token; email := r.email; name := r.name; message_key := m.key;
    subject := replace(replace(m.subject, '{offer_price}', v_offer), '{normal_price}', v_normal); heading := replace(replace(m.heading, '{offer_price}', v_offer), '{normal_price}', v_normal);
    body := replace(replace(m.body, '{offer_price}', v_offer), '{normal_price}', v_normal); cta_label := m.cta_label; cta_path := m.cta_path;
    return next;
  end loop;
end $$;

create or replace function phase1.follow_up_finish(p_id bigint, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = phase1, public as $$
  update phase1.follow_up_sends set status = case when p_ok or pushed then 'sent' else 'failed' end, emailed = p_ok, sent_at = now(), error = left(p_error, 300) where id = p_id $$;

-- From the email: opened, clicked, unsubscribe.
create or replace function phase1.follow_up_seen(p_token uuid, p_what text) returns void language sql security definer set search_path = phase1, public as $$
  update phase1.follow_up_sends set opened_at = coalesce(opened_at, now()), clicked_at = case when p_what = 'click' then coalesce(clicked_at, now()) else clicked_at end where token = p_token $$;
create or replace function phase1.follow_up_unsubscribe(p_token uuid) returns boolean language plpgsql security definer set search_path = phase1, public as $$
declare v_email text;
begin
  select email into v_email from phase1.follow_up_sends where token = p_token;
  if v_email is null then return false; end if;
  insert into phase1.follow_up_optouts (email) values (lower(v_email)) on conflict do nothing;
  return true;
end $$;

-- Admin.
create or replace function phase1.admin_follow_ups() returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v_role text := coalesce(phase1.admin_role(auth.uid()), '');
begin
  if v_role not in ('admin','master') then raise exception 'admin_required'; end if;
  return jsonb_build_object(
    'settings', (select value from phase1.site_settings where key = 'follow_ups'),
    'can_edit', v_role = 'master',
    'waiting', (select jsonb_build_object('first', count(*) filter (where d.track = 'first' and d.user_id is not null), 'app', count(*) filter (where d.device_id is not null), 'back', count(*) filter (where d.track = 'back')) from phase1.follow_up_due() d),
    'sent_today', (select count(*) from phase1.follow_up_sends x where x.track <> 'preview' and x.created_at >= date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra'),
    'unsubscribed', (select count(*) from phase1.follow_up_optouts),
    'offer', (select jsonb_build_object('price', k.price, 'normal', p.customer_price, 'used', phase1.campaign_used(k.id), 'max', k.max_redemptions, 'active', k.is_active) from phase1.campaigns k join phase1.data_products p on p.id = k.product_id where k.slug = 'welcome'),
    'messages', (select jsonb_agg(to_jsonb(x) order by x.track desc, x.step) from (
      select m.*, 
        (select count(*) from phase1.follow_up_sends s where s.message_key = m.key and s.track <> 'preview' and s.status = 'sent') as sent,
        (select count(*) from phase1.follow_up_sends s where s.message_key = m.key and s.track <> 'preview' and s.opened_at is not null) as opened,
        (select count(*) from phase1.follow_up_sends s where s.message_key = m.key and s.track <> 'preview' and s.clicked_at is not null) as clicked,
        -- bought after this message, and before any later one
        (select count(*) from phase1.follow_up_sends s where s.message_key = m.key and s.track <> 'preview' and s.status = 'sent' and s.user_id is not null and exists (
           select 1 from phase1.orders o where (o.user_id = s.user_id or o.paid_by_user_id = s.user_id) and o.paid_at > s.sent_at
             and not exists (select 1 from phase1.follow_up_sends s2 where s2.person = s.person and s2.track = s.track and s2.step > s.step and s2.sent_at < o.paid_at))) as bought
      from phase1.follow_up_messages m) x));
end $$;

create or replace function phase1.admin_follow_up_settings(p_enabled boolean, p_daily_cap int) returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v jsonb := jsonb_build_object('enabled', coalesce(p_enabled, false), 'daily_cap', least(greatest(coalesce(p_daily_cap, 80), 10), 500));
begin
  if coalesce(phase1.admin_role(auth.uid()), '') <> 'master' then raise exception 'master_required'; end if;
  insert into phase1.site_settings (key, value, updated_at, updated_by) values ('follow_ups', v, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return v;
end $$;

create or replace function phase1.admin_follow_up_save(p_key text, p_subject text, p_heading text, p_body text, p_cta_label text, p_push_title text, p_push_body text, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = phase1, public as $$
begin
  if coalesce(phase1.admin_role(auth.uid()), '') <> 'master' then raise exception 'master_required'; end if;
  if least(length(trim(p_subject)), length(trim(p_heading)), length(trim(p_body)), length(trim(p_cta_label)), length(trim(p_push_title)), length(trim(p_push_body))) < 2 then raise exception 'empty_field'; end if;
  update phase1.follow_up_messages set subject = left(trim(p_subject), 120), heading = left(trim(p_heading), 120), body = left(trim(p_body), 2000), cta_label = left(trim(p_cta_label), 40),
    push_title = left(trim(p_push_title), 60), push_body = left(trim(p_push_body), 160), enabled = coalesce(p_enabled, true), updated_at = now() where key = p_key;
  return found;
end $$;

-- Sends one message to the admin's own email so they can see exactly what customers get.
create or replace function phase1.admin_follow_up_preview(p_key text) returns text language plpgsql security definer set search_path = phase1, public as $$
declare v_email text;
begin
  if coalesce(phase1.admin_role(auth.uid()), '') not in ('admin','master') then raise exception 'admin_required'; end if;
  if not exists (select 1 from phase1.follow_up_messages where key = p_key) then raise exception 'unknown_message'; end if;
  select email into v_email from auth.users where id = auth.uid();
  delete from phase1.follow_up_sends where person = auth.uid()::text and track = 'preview';
  insert into phase1.follow_up_sends (person, user_id, email, track, step, message_key) values (auth.uid()::text, auth.uid(), v_email, 'preview', 0, p_key);
  perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/follow-up-run', body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
  return v_email;
end $$;

revoke all on function phase1.follow_up_claim(int), phase1.follow_up_finish(bigint, boolean, text) from public, anon, authenticated;
grant execute on function phase1.follow_up_claim(int), phase1.follow_up_finish(bigint, boolean, text) to service_role;
grant execute on function phase1.follow_up_seen(uuid, text), phase1.follow_up_unsubscribe(uuid) to anon, authenticated, service_role;
revoke all on function phase1.admin_follow_ups(), phase1.admin_follow_up_settings(boolean, int), phase1.admin_follow_up_save(text,text,text,text,text,text,text,boolean), phase1.admin_follow_up_preview(text) from public, anon;
grant execute on function phase1.admin_follow_ups(), phase1.admin_follow_up_settings(boolean, int), phase1.admin_follow_up_save(text,text,text,text,text,text,text,boolean), phase1.admin_follow_up_preview(text) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'follow-up-run';
select cron.schedule('follow-up-run', '7,37 * * * *', $job$select net.http_post(url:='https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/follow-up-run',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')),timeout_milliseconds:=60000) where coalesce((select (value->>'enabled')::boolean from phase1.site_settings where key='follow_ups'), false)$job$);
