-- DY Services texts: a record of every text, and whether the phone got it.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- "Sent" only ever meant the SMS provider took the text. Tests on 13 Nov 2026 showed about a third of accepted texts
-- never reached the phone, and nothing told us. The provider can say what the network did with each text
-- (GET /api/v1/status/<job id>); service-pay now keeps the job id and asks. One row per text sent:
--   accepted = false          the provider refused it (refusal says why)
--   delivery = 'delivered'    the network delivered it
--   delivery = 'not_delivered' / 'failed'   sent, and the network says it did not arrive
--   delivery = 'pending' / 'sent' / 'unknown'   sent, no final report yet
-- The text itself is never stored here (it can carry a PIN).

create table if not exists phase1.service_sms (
  id bigserial primary key,
  order_id uuid references phase1.service_orders(id) on delete set null,
  queue_id bigint references phase1.sms_queue(id) on delete set null,
  part int not null default 1,
  parts int not null default 1,
  phone text not null,
  sender text not null,
  chars int not null default 0,
  accepted boolean not null default false,
  job_id text,
  refusal text,
  sent_at timestamptz not null default now(),
  delivery text not null default 'pending' check (delivery in ('pending','sent','delivered','not_delivered','failed','unknown')),
  delivery_reason text,
  delivery_checked_at timestamptz,
  delivery_checks int not null default 0,
  delivery_raw jsonb
);
alter table phase1.service_sms enable row level security; -- no policies: only the server and the admin function below read it
create index if not exists service_sms_sent_idx on phase1.service_sms (sent_at desc);
create index if not exists service_sms_due_idx on phase1.service_sms (sent_at) where accepted and job_id is not null and delivery in ('pending','sent','unknown');
revoke all on phase1.service_sms from public, anon, authenticated;
grant select, insert, update on phase1.service_sms to service_role;
grant usage, select on sequence phase1.service_sms_id_seq to service_role;

-- Which texts to ask about now. First after 45 seconds, then at doubling gaps (the network can take a day to give up
-- on a phone that is off), 20 times at most, never past 3 days.
create or replace function phase1.service_sms_due() returns table (id bigint, job_id text) language sql stable security definer set search_path = phase1, public as $$
  select s.id, s.job_id from phase1.service_sms s
  where s.accepted and s.job_id is not null and s.delivery in ('pending','sent','unknown') and s.delivery_checks < 20 and s.sent_at > now() - interval '3 days'
    and coalesce(s.delivery_checked_at, s.sent_at) + interval '45 seconds' * power(2, least(s.delivery_checks, 8)) <= now()
  order by coalesce(s.delivery_checked_at, s.sent_at) limit 40 $$;

-- Records one answer. A final answer (delivered / not delivered / failed) is never overwritten by a vaguer one.
create or replace function phase1.service_sms_report(p_id bigint, p_delivery text, p_reason text, p_raw jsonb) returns void language sql security definer set search_path = phase1, public as $$
  update phase1.service_sms set
    delivery = case when delivery in ('delivered','not_delivered','failed') then delivery when p_delivery in ('delivered','not_delivered','failed','sent','pending') then p_delivery else delivery end,
    delivery_reason = coalesce(nullif(left(p_reason, 200), ''), delivery_reason),
    delivery_checked_at = now(), delivery_checks = delivery_checks + 1, delivery_raw = coalesce(p_raw, delivery_raw)
  where id = p_id $$;

revoke all on function phase1.service_sms_due(), phase1.service_sms_report(bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function phase1.service_sms_due(), phase1.service_sms_report(bigint, text, text, jsonb) to service_role;

-- The admin Text messages page: the same settings as before, plus the last texts and today's count.
create or replace function phase1.admin_sms_senders() returns jsonb language plpgsql security definer set search_path = phase1, public as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return (select jsonb_build_object('can_edit', phase1.caller_is_admin(null, true), 'services_enabled', services_enabled, 'services_sender', services_sender, 'agents_enabled', agents_enabled, 'agents_sender', agents_sender,
    'agent_approved_text', agent_approved_text, 'verify_sender', sender_id, 'verify_enabled', verified_enabled, 'credits', credits_remaining,
    'recent', coalesce((select jsonb_agg(to_jsonb(x)) from (select kind, right(phone, 4) as phone_end, status, result, created_at from phase1.sms_queue order by id desc limit 10) x), '[]'::jsonb),
    'texts', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select s.id, s.sent_at, right(s.phone, 4) as phone_end, s.sender, s.part, s.parts, s.accepted, s.refusal, s.delivery, s.delivery_reason, s.delivery_checked_at,
        o.reference as order_reference, q.kind as queue_kind
      from phase1.service_sms s left join phase1.service_orders o on o.id = s.order_id left join phase1.sms_queue q on q.id = s.queue_id
      order by s.id desc limit 40) x), '[]'::jsonb),
    'texts_today', (select jsonb_build_object('sent', count(*) filter (where accepted), 'delivered', count(*) filter (where accepted and delivery = 'delivered'),
        'not_delivered', count(*) filter (where accepted and delivery in ('not_delivered','failed')), 'waiting', count(*) filter (where accepted and delivery in ('pending','sent','unknown')),
        'refused', count(*) filter (where not accepted))
      from phase1.service_sms where sent_at >= date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra'))
    from phase1.sms_settings where id = true);
end $$;

-- service-pay's two-minute job also runs when a text is waiting for its delivery report.
select cron.unschedule(jobid) from cron.job where jobname = 'service-pay';
select cron.schedule('service-pay', '*/2 * * * *', $job$select net.http_post(url:='https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay',body:='{"action":"run"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')),timeout_milliseconds:=60000) where exists (select 1 from phase1.service_orders where (paid_at is null and pay_reference is not null and created_at > now() - interval '3 hours') or status = 'awaiting_payment') or exists (select 1 from phase1.sms_queue where status = 'pending') or exists (select 1 from phase1.service_outbox where status = 'pending') or exists (select 1 from phase1.service_registrations where status in ('queued','sending','submitted')) or exists (select 1 from phase1.service_sms_due())$job$);

-- Same day, on the owner's word ("turn it on"), after the delivery reports showed the wording delivered:
-- texts for service orders and for agent approval are switched on, and the approval text carries the dashboard link.
update phase1.sms_settings set services_enabled = true, agents_enabled = true,
  agent_approved_text = 'Hi {name}, you are approved as a DY agent. Sign in at datayego.com/agent to activate your store and start selling.'
where id = true;
