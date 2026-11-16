-- Renewal texts for agents (owner, 16 Nov 2026). Applied live 16 Nov 2026.
-- A main agent on a paid plan gets one text 7 days before the plan ends, one 3 days before and one the day before
-- (the emails from agent-reminders carry on as before). Wording was tested on our two test numbers first: all six
-- delivered. It avoids words the networks silently drop ("data", "bundle", "airtime", network names, https links).
-- Rules:
--  * main agents only (sub-agents pay no plan), status active, plan date set; an agent who renews gets a new plan
--    date, so the texts for the old date never go (each text is keyed by agent + plan date + stage).
--  * one stage at a time: 4–7 days left → the 7-day text, 2–3 days → the 3-day text (with the real count), 1 day → the
--    24-hour text. A missed run catches up with the stage that is true now, never sends a stale one.
--  * only 9:00–19:00 Ghana time; queued 5 minutes apart behind anything already waiting (as the approval texts are);
--    respects the agents' SMS switch (sms_settings.agents_enabled) and sender.
--  * sending goes through the existing queue (sms_queue → service-pay), which holds a row while it sends it.
create or replace function phase1.agent_renewal_sms_run() returns int
language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare s phase1.sms_settings; r record; v_last timestamptz; v_slot timestamptz; v_n int := 0; v_today date := (now() at time zone 'Africa/Accra')::date;
  v_hour int := extract(hour from now() at time zone 'Africa/Accra'); v_msg text; v_stage text; v_left int; v_id bigint;
begin
  select * into s from phase1.sms_settings where id = true;
  if not coalesce(s.agents_enabled, false) or v_hour < 9 or v_hour >= 19 then return 0; end if;
  for r in
    select a.id, a.paid_until, phase1.service_norm_phone(coalesce(nullif(p.phone, ''), a.whatsapp)) as phone,
           coalesce(nullif(split_part(trim(coalesce(p.full_name, '')), ' ', 1), ''), 'there') as first_name
    from phase1.agents a left join phase1.profiles p on p.id = a.user_id
    where a.parent_agent_id is null and a.status = 'active' and a.paid_until is not null
      and a.paid_until - v_today between 1 and 7
    order by a.paid_until, a.id
  loop
    continue when r.phone is null;
    v_left := r.paid_until - v_today;
    if v_left >= 4 then
      v_stage := '7d'; v_msg := format('Hi %s, your DY store plan ends on %s. Renew at datayego.com/agent to keep your store open.', r.first_name, to_char(r.paid_until, 'FMDD Mon'));
    elsif v_left >= 2 then
      v_stage := '3d'; v_msg := format('Hi %s, your DY store plan ends in %s days (%s). Renew at datayego.com/agent so your customers can keep buying.', r.first_name, v_left, to_char(r.paid_until, 'FMDD Mon'));
    else
      v_stage := '1d'; v_msg := format('Hi %s, your DY store plan ends tomorrow. Renew now at datayego.com/agent so your store does not close.', r.first_name);
    end if;
    continue when exists (select 1 from phase1.sms_queue q where q.dedupe_key = 'agent_renew:' || v_stage || ':' || r.id || ':' || r.paid_until);
    select max(t) into v_last from (
      select coalesce(x.not_before, x.created_at) as t from phase1.sms_queue x where x.status = 'pending'
      union all select x.sent_at from phase1.sms_queue x where x.status = 'sent' and x.sent_at > now() - interval '5 minutes') z;
    v_slot := case when v_last is null then null else greatest(now(), v_last + interval '5 minutes') end;
    insert into phase1.sms_queue (kind, phone, message, sender, dedupe_key, not_before)
    values ('agent_renew_' || v_stage, r.phone, left(v_msg, 300), left(s.agents_sender, 11), 'agent_renew:' || v_stage || ':' || r.id || ':' || r.paid_until, v_slot)
    on conflict (dedupe_key) do nothing returning id into v_id;
    if v_id is not null then v_n := v_n + 1; end if;
    v_id := null;
  end loop;
  if v_n > 0 then
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay', body := '{"action":"run"}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
  end if;
  return v_n;
end $$;
revoke all on function phase1.agent_renewal_sms_run() from public, anon, authenticated;
grant execute on function phase1.agent_renewal_sms_run() to service_role;
-- every hour at :10 (the function itself keeps to 9:00–19:00 Ghana time)
select cron.schedule('agent-renewal-texts', '10 * * * *', 'select phase1.agent_renewal_sms_run()');
