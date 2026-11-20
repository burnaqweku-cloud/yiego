-- Verified follow-ups get a third reminder on day 7, between day 3 and day 14 (owner, 20 Nov 2026:
-- "a 7 days gap ... After 7 day, 14 days"). Numbers already in the flow get their day-7 row now
-- (same start time, same skip as their day-3 row); new numbers get 3, 7 and 14 from the hourly seed.

alter table phase1.verified_followups drop constraint if exists verified_followups_stage_check;
alter table phase1.verified_followups add constraint verified_followups_stage_check check (stage in (3, 7, 14));

create or replace function phase1.verified_followup_seed()
returns integer language plpgsql security definer set search_path = phase1, public as $$
declare n int := 0; k int;
begin
  insert into phase1.verified_followups (p9, phone, stage, store_slug, base_at, due_at)
  select v.p9, v.phone, st.stage, v.store_slug, v.sent_at, v.sent_at + make_interval(days => st.stage)
  from (select distinct on (right(regexp_replace(o.recipient_phone, '\D', '', 'g'), 9))
          right(regexp_replace(o.recipient_phone, '\D', '', 'g'), 9) as p9, phase1.service_norm_phone(o.recipient_phone) as phone,
          a.slug as store_slug, x.sent_at
        from phase1.order_sms_outbox x join phase1.orders o on o.id = x.order_id left join phase1.agents a on a.id = o.agent_id
        where x.kind = 'verified' and x.status = 'sent' and x.delivery_status = 'delivered' and x.sent_at >= '2026-11-17'
        order by right(regexp_replace(o.recipient_phone, '\D', '', 'g'), 9), x.sent_at desc) v
  cross join (values (3), (7), (14)) as st(stage)
  where v.phone is not null
  on conflict (p9, stage) do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into phase1.verified_followups (p9, phone, stage, store_slug, base_at, due_at)
  select t.p9, t.phone, st.stage, case when t.origin like 'store:%' then substr(t.origin, 7) end, q.sent_at, q.sent_at + make_interval(days => st.stage)
  from phase1.number_verified_texts t
  join phase1.sms_queue q on q.dedupe_key = 'number_verified:' || t.p9 and q.status = 'sent'
  join phase1.service_sms s on s.queue_id = q.id and s.delivery = 'delivered'
  cross join (values (3), (7), (14)) as st(stage)
  on conflict (p9, stage) do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

-- Day-7 rows for numbers already in the flow, keeping any skip their day-3 row already has.
insert into phase1.verified_followups (p9, phone, stage, store_slug, base_at, due_at, skipped)
select f.p9, f.phone, 7, f.store_slug, f.base_at, f.base_at + interval '7 days', f.skipped
from phase1.verified_followups f where f.stage = 3
on conflict (p9, stage) do nothing;

create or replace function phase1.verified_followup_drip()
returns text language plpgsql security definer set search_path = phase1, public as $$
declare r record; h int := extract(hour from now() at time zone 'Africa/Accra'); v_link text; v_msg text;
begin
  if h < 8 or h >= 20 then return 'night'; end if;
  if not coalesce((select (value->>'enabled')::boolean from phase1.site_settings where key = 'verified_followups'), false) then return 'off'; end if;
  if exists (select 1 from phase1.sms_queue where kind in ('verified_followup', 'number_verified') and status = 'pending') then return 'waiting'; end if;
  for r in select * from phase1.verified_followups where queued_at is null and skipped is null and due_at <= now() order by due_at, id limit 1 for update skip locked loop
    if exists (select 1 from phase1.orders o where right(regexp_replace(coalesce(o.recipient_phone, ''), '\D', '', 'g'), 9) = r.p9
                 and o.payment_status::text = 'succeeded' and coalesce(o.paid_at, o.created_at) > r.base_at) then
      update phase1.verified_followups set skipped = 'bought_since' where p9 = r.p9 and queued_at is null and skipped is null; return 'skipped';
    end if;
    if exists (select 1 from phase1.agents a left join phase1.profiles p on p.id = a.user_id
                 where right(regexp_replace(coalesce(a.contact_phone, ''), '\D', '', 'g'), 9) = r.p9 or right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = r.p9) then
      update phase1.verified_followups set skipped = 'agent' where p9 = r.p9 and queued_at is null and skipped is null; return 'skipped';
    end if;
    select case when a.custom_domain_status = 'active' and nullif(a.custom_domain, '') is not null then lower(a.custom_domain) else a.slug || '.datayego.com' end
      into v_link from phase1.agents a where a.slug = r.store_slug;
    v_link := coalesce(v_link, 'datayego.com');
    v_msg := case r.stage
               when 3 then 'Your number is verified and ready. Your next order goes through instantly. Order now: '
               when 7 then 'Time to buy again? Your number is verified, so your order arrives in minutes. Order now: '
               else 'Running low? Your number is verified, so every order goes through instantly. Buy again: ' end || v_link;
    insert into phase1.sms_queue (kind, phone, message, sender, dedupe_key) values ('verified_followup', r.phone, v_msg, 'Dyverify', 'vfu:' || r.stage || ':' || r.p9)
      on conflict (dedupe_key) do nothing;
    update phase1.verified_followups set queued_at = now(), message = v_msg where id = r.id;
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay', body := '{"action":"run"}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
    return 'queued';
  end loop;
  return 'nothing_due';
end $$;
