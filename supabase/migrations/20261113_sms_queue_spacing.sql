-- Queued texts: never sent twice, and never in a burst.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- 13 Nov 2026: twelve agents were approved together. Their texts left within 20 seconds of each other and the network
-- delivered three. Two of the twelve were also sent twice, because two sending runs overlapped: a run picked the
-- waiting rows but only marked them when it finished, so a second run starting meanwhile picked the same rows.
--   * A picked row is now held for 4 minutes (claimed_until). No other run can pick it while it is held; the run
--     releases it when it records the result, and a run that died releases it by time. The same hold protects
--     service_outbox (PIN texts and emails), which had the same gap.
--   * sms_queue.not_before: a text is not sent before this time. An approval text is given the next free slot,
--     5 minutes after the one before it (the owner's choice), so approving many people at once no longer sends a burst.
--   * At most 3 queued texts leave in one run.

alter table phase1.sms_queue add column if not exists not_before timestamptz, add column if not exists claimed_until timestamptz;
alter table phase1.service_outbox add column if not exists claimed_until timestamptz;

create or replace function phase1.service_outbox_claim()
returns jsonb language plpgsql security definer set search_path to 'phase1', 'public' as $function$
declare v jsonb; q jsonb; s phase1.sms_settings;
begin
  perform phase1.service_sweep();
  select * into s from phase1.sms_settings where id = true;
  with picked as (update phase1.service_outbox x set attempts = attempts + 1, claimed_until = now() + interval '4 minutes'
    where x.status = 'pending' and x.attempts < 3 and (x.claimed_until is null or x.claimed_until < now()) returning x.order_id)
  select coalesce(jsonb_agg(phase1.service_order_json(o) || jsonb_build_object('id', o.id, 'email', coalesce(o.guest_email, (select email from auth.users u where u.id = o.user_id)), 'user_id', o.user_id)), '[]'::jsonb) into v
  from picked join phase1.service_orders o on o.id = picked.order_id;
  with due as (select x.id from phase1.sms_queue x
    where x.status = 'pending' and x.attempts < 3 and (x.claimed_until is null or x.claimed_until < now()) and (x.not_before is null or x.not_before <= now())
    order by coalesce(x.not_before, x.created_at), x.id limit 3 for update skip locked),
  picked as (update phase1.sms_queue x set attempts = attempts + 1, claimed_until = now() + interval '4 minutes' from due where x.id = due.id returning x.id, x.phone, x.message, x.sender)
  select coalesce(jsonb_agg(to_jsonb(picked)), '[]'::jsonb) into q from picked;
  return jsonb_build_object('deliver', v, 'queue', q,
    'sms', jsonb_build_object('enabled', coalesce(s.services_enabled, false), 'sender', coalesce(s.services_sender, 'Dyservice')),
    'check', coalesce((select jsonb_agg(o.pay_reference) from phase1.service_orders o where o.paid_at is null and o.pay_reference is not null and o.status in ('awaiting_payment','expired') and o.created_at between now() - interval '3 hours' and now() - interval '90 seconds'), '[]'::jsonb));
end $function$;

create or replace function phase1.sms_queue_done(p_id bigint, p_result text)
returns void language sql security definer set search_path to 'phase1', 'public' as $function$
  update phase1.sms_queue set status = case when p_result = 'sent' then 'sent' when attempts >= 3 then 'failed' else 'pending' end, result = p_result, sent_at = now(), claimed_until = null where id = p_id $function$;

create or replace function phase1.service_outbox_done(p_order uuid, p_sms text, p_email text)
returns void language sql security definer set search_path to 'phase1', 'public' as $function$
  update phase1.service_outbox set status = case when p_sms = 'sent' or p_email = 'sent' or attempts >= 3 then 'sent' else 'pending' end, sms = p_sms, email = p_email, sent_at = now(), claimed_until = null where order_id = p_order $function$;

create or replace function phase1.agent_approved_sms_trigger()
returns trigger language plpgsql security definer set search_path to 'phase1', 'public' as $function$
declare s phase1.sms_settings; v_phone text; v_last timestamptz;
begin
  begin
    if new.status::text = 'approved' and old.status::text is distinct from 'approved' then
      select * into s from phase1.sms_settings where id = true;
      v_phone := phase1.service_norm_phone(new.phone);
      if coalesce(s.agents_enabled, false) and v_phone is not null then
        -- the next free slot: 5 minutes after the last text that is waiting or has just gone
        select max(t) into v_last from (
          select coalesce(x.not_before, x.created_at) as t from phase1.sms_queue x where x.status = 'pending'
          union all select x.sent_at from phase1.sms_queue x where x.status = 'sent' and x.sent_at > now() - interval '5 minutes') z;
        insert into phase1.sms_queue (kind, phone, message, sender, dedupe_key, not_before)
        values ('agent_approved', v_phone, left(replace(s.agent_approved_text, '{name}', coalesce(nullif(split_part(trim(coalesce(new.full_name, '')), ' ', 1), ''), 'there')), 300), left(s.agents_sender, 11), 'agent_approved:' || new.id,
          case when v_last is null then null else greatest(now(), v_last + interval '5 minutes') end)
        on conflict (dedupe_key) do nothing;
        perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay', body := '{"action":"run"}'::jsonb,
          headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
      end if;
    end if;
  exception when others then null; -- an SMS problem must never block an approval
  end;
  return new;
end $function$;

-- service-pay's two-minute job: a queued text only counts as work once its time has come.
select cron.unschedule(jobid) from cron.job where jobname = 'service-pay';
select cron.schedule('service-pay', '*/2 * * * *', $job$select net.http_post(url:='https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay',body:='{"action":"run"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')),timeout_milliseconds:=60000) where exists (select 1 from phase1.service_orders where (paid_at is null and pay_reference is not null and created_at > now() - interval '3 hours') or status = 'awaiting_payment') or exists (select 1 from phase1.sms_queue where status = 'pending' and (not_before is null or not_before <= now())) or exists (select 1 from phase1.service_outbox where status = 'pending') or exists (select 1 from phase1.service_registrations where status in ('queued','sending','submitted')) or exists (select 1 from phase1.service_sms_due())$job$);

-- Same day, on the owner's word: the nine approval texts that were sent and never delivered were queued again,
-- one every 5 minutes (dedupe keys ending ':resend1'), to see whether spacing is what gets them delivered.
