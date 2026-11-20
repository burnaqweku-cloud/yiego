-- A phone notification to the master admin account whenever an agent or a sub-agent asks to withdraw
-- (owner, 20 Nov 2026: "through my master admin acc only"). Its own kind, 'payout_request', so the
-- notification list names it. It always goes, like admin alerts: the customer notification switches
-- do not turn it off. Only phones signed in to an active master account receive it.

alter table phase1.push_outbox drop constraint if exists push_outbox_kind_check;
alter table phase1.push_outbox add constraint push_outbox_kind_check check (kind in (
  'order_paid','order_delivered','order_refunded','announcement','test','campaign','alert',
  'service_delivered','service_refunded','agent_approved','payout_request'));

create or replace function phase1.push_enqueue(p_kind text, p_dedupe text, p_title text, p_body text, p_url text default '/',
  p_order uuid default null, p_announcement uuid default null, p_user uuid default null, p_audience text default null, p_send_after timestamptz default null)
returns bigint language plpgsql security definer set search_path = phase1, public as $$
declare s jsonb; v_id bigint; v_switch text;
begin
  if p_kind not in ('test','alert','payout_request') then
    select value into s from phase1.site_settings where key = 'push_notifications';
    v_switch := case when p_kind = 'announcement' then 'announcements' when p_kind in ('service_delivered','service_refunded') then 'services' else p_kind end;
    if not coalesce((s->>'enabled')::boolean, false) or not coalesce((s->>v_switch)::boolean, true) then return null; end if;
  end if;
  insert into phase1.push_outbox (kind, dedupe_key, title, body, url, order_id, announcement_id, user_id, audience, send_after)
  values (p_kind, p_dedupe, left(p_title, 80), left(p_body, 240), coalesce(nullif(p_url, ''), '/'), p_order, p_announcement, p_user, p_audience, coalesce(p_send_after, now()))
  on conflict (dedupe_key) do nothing returning id into v_id;
  if v_id is not null and coalesce(p_send_after, now()) <= now() then
    begin
      perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/push-send', body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
    exception when others then null;
    end;
  end if;
  return v_id;
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
        or (j.audience = 'agents' and d.user_id in (select a.user_id from phase1.agents a where a.status = 'active' and a.parent_agent_id is null)));
  elsif j.kind = 'payout_request' then
    -- Only phones signed in to an active master account, checked again at send time.
    return query select d.id::text, d.channel, d.token from phase1.push_devices d
      where d.disabled_at is null and d.user_id = j.user_id
        and exists (select 1 from phase1.admin_users a where a.user_id = j.user_id and a.role = 'master' and a.is_active);
  elsif j.kind in ('test','campaign','alert','service_delivered','service_refunded','agent_approved') then
    return query select d.id::text, d.channel, d.token from phase1.push_devices d
      where d.disabled_at is null and ((j.user_id is not null and d.user_id = j.user_id) or (j.device_id is not null and d.device_id = j.device_id));
  end if;
end $$;

-- Builds the notification for one withdrawal request and queues it for every active master account.
-- p_test sends the same notification marked as a test (used to check it reaches the phone).
create or replace function phase1.push_payout_request(p_payout uuid, p_test boolean default false)
returns int language plpgsql security definer set search_path = phase1, public as $$
declare p phase1.agent_payouts; g phase1.agents; v_parent text; v_who text; v_body text; n int := 0; m record;
begin
  select * into p from phase1.agent_payouts where id = p_payout;
  if p.id is null then return 0; end if;
  select * into g from phase1.agents where id = p.agent_id;
  if g.parent_agent_id is not null then
    select coalesce(nullif(trim(a.store_name), ''), a.slug) into v_parent from phase1.agents a where a.id = g.parent_agent_id;
  end if;
  v_who := coalesce(nullif(trim(g.store_name), ''), g.slug, 'An agent')
    || case when g.parent_agent_id is not null then ' (sub-agent under ' || coalesce(v_parent, 'an agent') || ')' else '' end;
  v_body := v_who || ' wants to withdraw GH₵' || trim(to_char(p.amount, 'FM999999990.00'))
    || '. Send GH₵' || trim(to_char(p.net, 'FM999999990.00')) || ' to ' || coalesce(p.momo_number, 'their MoMo')
    || case when nullif(trim(p.momo_name), '') is not null then ' (' || trim(p.momo_name) || ')' else '' end || '.';
  for m in select u.user_id from phase1.admin_users u where u.role = 'master' and u.is_active loop
    perform phase1.push_enqueue('payout_request',
      'payout_request:' || p.id || ':' || m.user_id || case when p_test then ':test:' || gen_random_uuid() else '' end,
      case when p_test then 'Withdrawal request (test)' else 'Withdrawal request' end,
      v_body, '/admin/agents/payouts', null, null, m.user_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- A new request queues the notification. Never allowed to stop the request from saving.
create or replace function phase1.agent_payouts_push_trigger() returns trigger language plpgsql security definer set search_path = phase1, public as $$
begin
  begin
    if new.status = 'requested' then perform phase1.push_payout_request(new.id); end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists zz_agent_payouts_push_trg on phase1.agent_payouts;
create trigger zz_agent_payouts_push_trg after insert on phase1.agent_payouts for each row execute function phase1.agent_payouts_push_trigger();

revoke all on function phase1.push_payout_request(uuid, boolean), phase1.agent_payouts_push_trigger() from public, anon, authenticated;
