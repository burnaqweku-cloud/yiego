-- Phone notifications for the DataYego app: payment received, data delivered, refunds, announcements.
-- The database queues them (push_outbox); the push-send function delivers them through Firebase.
-- Everything starts switched off (site_settings 'push_notifications'.enabled = false); only a test can be sent.

create table if not exists phase1.push_devices (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('fcm','webpush')),
  token text not null,
  device_id text,
  user_id uuid,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (channel, token)
);
create index if not exists push_devices_user_idx on phase1.push_devices (user_id) where disabled_at is null;
create index if not exists push_devices_device_idx on phase1.push_devices (device_id) where disabled_at is null;

create table if not exists phase1.push_order_watch (
  order_id uuid not null references phase1.orders(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (order_id, device_id)
);

create table if not exists phase1.push_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('order_paid','order_delivered','order_refunded','announcement','test')),
  dedupe_key text not null unique,
  order_id uuid, announcement_id uuid, user_id uuid, audience text,
  title text not null, body text not null, url text not null default '/',
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  send_after timestamptz not null default now(),
  attempts int not null default 0,
  claimed_at timestamptz, sent_at timestamptz,
  recipients int, delivered int, error text,
  created_at timestamptz not null default now()
);
create index if not exists push_outbox_pending_idx on phase1.push_outbox (send_after) where status = 'pending';

alter table phase1.push_devices enable row level security;
alter table phase1.push_order_watch enable row level security;
alter table phase1.push_outbox enable row level security;

insert into phase1.site_settings (key, value)
values ('push_notifications', '{"enabled":false,"order_paid":true,"order_delivered":true,"order_refunded":true,"announcements":true}'::jsonb)
on conflict (key) do nothing;

-- The app saves this phone's address. Signed-in phones are tied to the account.
create or replace function phase1.push_register(p_device text, p_channel text, p_token text, p_platform text default null)
returns boolean language plpgsql security definer set search_path = phase1, public as $$
begin
  if p_channel not in ('fcm','webpush') or coalesce(length(p_token), 0) not between 20 and 4096 or coalesce(length(p_device), 0) not between 8 and 80 then return false; end if;
  insert into phase1.push_devices (channel, token, device_id, user_id, platform)
  values (p_channel, p_token, p_device, auth.uid(), left(p_platform, 40))
  on conflict (channel, token) do update set device_id = excluded.device_id, user_id = coalesce(excluded.user_id, phase1.push_devices.user_id),
    platform = coalesce(excluded.platform, phase1.push_devices.platform), last_seen_at = now(), disabled_at = null;
  -- A phone has one address at a time: older ones for the same phone are retired.
  update phase1.push_devices set disabled_at = now() where channel = p_channel and device_id = p_device and token <> p_token and disabled_at is null;
  return true;
end $$;

-- The phone that places an order asks to hear about it (this is how guests get notified).
create or replace function phase1.push_watch_order(p_device text, p_order_reference text)
returns boolean language plpgsql security definer set search_path = phase1, public as $$
declare v_order uuid;
begin
  if coalesce(length(p_device), 0) not between 8 and 80 then return false; end if;
  select id into v_order from phase1.orders where order_reference = p_order_reference and created_at > now() - interval '2 hours';
  if v_order is null then return false; end if;
  if (select count(*) from phase1.push_order_watch where order_id = v_order) >= 3 then return false; end if;
  insert into phase1.push_order_watch (order_id, device_id) values (v_order, p_device) on conflict do nothing;
  return true;
end $$;

-- Queues one notification (once per dedupe key) and wakes the sender. Respects the switches; a test always goes.
create or replace function phase1.push_enqueue(p_kind text, p_dedupe text, p_title text, p_body text, p_url text default '/',
  p_order uuid default null, p_announcement uuid default null, p_user uuid default null, p_audience text default null, p_send_after timestamptz default null)
returns bigint language plpgsql security definer set search_path = phase1, public as $$
declare s jsonb; v_id bigint; v_switch text;
begin
  if p_kind <> 'test' then
    select value into s from phase1.site_settings where key = 'push_notifications';
    v_switch := case when p_kind = 'announcement' then 'announcements' else p_kind end;
    if not coalesce((s->>'enabled')::boolean, false) or not coalesce((s->>v_switch)::boolean, true) then return null; end if;
  end if;
  insert into phase1.push_outbox (kind, dedupe_key, title, body, url, order_id, announcement_id, user_id, audience, send_after)
  values (p_kind, p_dedupe, left(p_title, 80), left(p_body, 240), coalesce(nullif(p_url, ''), '/'), p_order, p_announcement, p_user, p_audience, coalesce(p_send_after, now()))
  on conflict (dedupe_key) do nothing returning id into v_id;
  if v_id is not null and coalesce(p_send_after, now()) <= now() then
    begin
      perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/push-send', body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
    exception when others then null; -- the one-minute job picks it up
    end;
  end if;
  return v_id;
end $$;

-- Orders: paid, delivered, refunded. Never allowed to stop an order from saving.
create or replace function phase1.orders_push_trigger() returns trigger language plpgsql security definer set search_path = phase1, public as $$
declare v_url text := '/track-order?reference=' || new.order_reference; v_phone text := coalesce(new.recipient_phone, 'your number');
begin
  begin
    if new.paid_at is not null and old.paid_at is null and new.status not in ('delivered','refunded','cancelled') then
      perform phase1.push_enqueue('order_paid', 'order_paid:' || new.id, 'Payment received', 'We have your payment. Your data for ' || v_phone || ' is on its way.', v_url, new.id);
    end if;
    if new.status is distinct from old.status and new.status = 'delivered' then
      perform phase1.push_enqueue('order_delivered', 'order_delivered:' || new.id, 'Data delivered', 'Your data for ' || v_phone || ' has been delivered. Thank you for buying with DataYego.', v_url, new.id);
    elsif new.status is distinct from old.status and new.status = 'refunded' then
      perform phase1.push_enqueue('order_refunded', 'order_refunded:' || new.id, 'Order refunded', 'Your order for ' || v_phone || ' was refunded (' || coalesce(new.currency, 'GHS') || ' ' || trim(to_char(new.amount, 'FM999990.00')) || ').', v_url, new.id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists zz_orders_push_trg on phase1.orders;
create trigger zz_orders_push_trg after update of status, paid_at on phase1.orders for each row execute function phase1.orders_push_trigger();

-- Announcements: one notification when it is posted (or when it starts, if scheduled).
create or replace function phase1.announcements_push_trigger() returns trigger language plpgsql security definer set search_path = phase1, public as $$
begin
  begin
    if new.is_active and new.audience in ('everyone','customers','agents') then
      perform phase1.push_enqueue('announcement', 'announcement:' || new.id, new.title, regexp_replace(left(new.body, 200), '\s+', ' ', 'g'),
        case when new.audience = 'agents' then '/agent' else '/' end, null, new.id, null, new.audience, greatest(coalesce(new.starts_at, now()), now()));
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists announcements_push_trg on phase1.announcements;
create trigger announcements_push_trg after insert on phase1.announcements for each row execute function phase1.announcements_push_trigger();

-- Sender side (service role only).
create or replace function phase1.push_claim(p_limit int default 25)
returns table (id bigint, kind text, title text, body text, url text) language plpgsql security definer set search_path = phase1, public as $$
begin
  -- A send that never reported back is closed rather than repeated: a missed notification beats a double one.
  update phase1.push_outbox o set status = 'failed', error = coalesce(o.error, 'The sender stopped before finishing') where o.status = 'sending' and o.claimed_at < now() - interval '10 minutes';
  -- Old news is not worth a buzz.
  update phase1.push_outbox o set status = 'failed', error = 'Too old to send' where o.status = 'pending' and o.send_after < now() - interval '6 hours';
  return query
  update phase1.push_outbox o set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
  where o.id in (select x.id from phase1.push_outbox x where x.status = 'pending' and x.send_after <= now() order by x.id limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning o.id, o.kind, o.title, o.body, o.url;
end $$;

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
  elsif j.kind = 'test' then
    return query select d.id::text, d.channel, d.token from phase1.push_devices d where d.disabled_at is null and d.user_id = j.user_id;
  end if;
end $$;

create or replace function phase1.push_finish(p_id bigint, p_recipients int, p_delivered int, p_dead text[] default '{}', p_error text default null, p_retry boolean default false)
returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  if coalesce(array_length(p_dead, 1), 0) > 0 then
    update phase1.push_devices set disabled_at = now() where id::text = any(p_dead);
  end if;
  update phase1.push_outbox set
    status = case when p_retry and attempts < 5 then 'pending' when p_retry then 'failed' when p_recipients > 0 and p_delivered = 0 then 'failed' else 'sent' end,
    send_after = case when p_retry and attempts < 5 then now() + interval '1 minute' else send_after end,
    sent_at = case when p_retry then sent_at else now() end,
    recipients = p_recipients, delivered = p_delivered, error = left(p_error, 300)
  where id = p_id;
end $$;

-- Admin side.
create or replace function phase1.admin_push_overview() returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v_role text := coalesce(phase1.admin_role(auth.uid()), '');
begin
  if v_role not in ('admin','master') then raise exception 'admin_required'; end if;
  return jsonb_build_object(
    'settings', (select value from phase1.site_settings where key = 'push_notifications'),
    'can_edit', v_role = 'master',
    'phones', (select count(*) from phase1.push_devices where disabled_at is null),
    'phones_signed_in', (select count(*) from phase1.push_devices where disabled_at is null and user_id is not null),
    'my_phones', (select count(*) from phase1.push_devices where disabled_at is null and user_id = auth.uid()),
    'sent_today', (select coalesce(sum(delivered), 0) from phase1.push_outbox where status = 'sent' and sent_at > date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra'),
    'recent', coalesce((select jsonb_agg(to_jsonb(r)) from (select id, kind, title, body, status, recipients, delivered, error, created_at, sent_at from phase1.push_outbox order by id desc limit 20) r), '[]'::jsonb));
end $$;

create or replace function phase1.admin_push_save(p_settings jsonb) returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v jsonb;
begin
  if coalesce(phase1.admin_role(auth.uid()), '') <> 'master' then raise exception 'master_required'; end if;
  v := jsonb_build_object('enabled', coalesce((p_settings->>'enabled')::boolean, false), 'order_paid', coalesce((p_settings->>'order_paid')::boolean, true),
    'order_delivered', coalesce((p_settings->>'order_delivered')::boolean, true), 'order_refunded', coalesce((p_settings->>'order_refunded')::boolean, true),
    'announcements', coalesce((p_settings->>'announcements')::boolean, true));
  insert into phase1.site_settings (key, value, updated_at, updated_by) values ('push_notifications', v, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return v;
end $$;

-- Sends a test to the phones signed in to the admin's own account. Returns how many phones that is.
create or replace function phase1.admin_push_test() returns int language plpgsql security definer set search_path = phase1, public as $$
declare n int;
begin
  if coalesce(phase1.admin_role(auth.uid()), '') not in ('admin','master') then raise exception 'admin_required'; end if;
  select count(*) into n from phase1.push_devices where disabled_at is null and user_id = auth.uid();
  if n > 0 then
    perform phase1.push_enqueue('test', 'test:' || gen_random_uuid(), 'DataYego notifications work', 'This is a test. Tap to open the app.', '/', null, null, auth.uid());
  end if;
  return n;
end $$;

revoke all on function phase1.push_enqueue(text,text,text,text,text,uuid,uuid,uuid,text,timestamptz), phase1.push_claim(int), phase1.push_recipients(bigint), phase1.push_finish(bigint,int,int,text[],text,boolean) from public, anon, authenticated;
grant execute on function phase1.push_claim(int), phase1.push_recipients(bigint), phase1.push_finish(bigint,int,int,text[],text,boolean) to service_role;
grant execute on function phase1.push_register(text,text,text,text), phase1.push_watch_order(text,text) to anon, authenticated;
revoke all on function phase1.admin_push_overview(), phase1.admin_push_save(jsonb), phase1.admin_push_test() from public, anon;
grant execute on function phase1.admin_push_overview(), phase1.admin_push_save(jsonb), phase1.admin_push_test() to authenticated;

-- Safety net: every minute, wake the sender if something is waiting.
select cron.unschedule(jobid) from cron.job where jobname = 'push-send';
select cron.schedule('push-send', '* * * * *', $job$select net.http_post(url:='https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/push-send',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')),timeout_milliseconds:=30000) where exists (select 1 from phase1.push_outbox where status = 'pending' and send_after <= now())$job$);
