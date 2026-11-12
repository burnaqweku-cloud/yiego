-- Payment guard (12 Nov 2026): Kora took no successful payment for 19 hours and nobody was told.
-- Every 5 minutes: if a gateway has had 10 or more payment attempts from 6 or more different payers since
-- its last success (looking back 12 hours at most), every admin gets a phone notification (at most one an hour
-- per gateway). If the failing gateway is Kora and Kora is the live gateway, payments switch to Paystack.
-- It never switches TO Kora by itself. Back-tested on 14 days: Paystack never triggers (longest run: 6 attempts).

alter table phase1.push_outbox drop constraint if exists push_outbox_kind_check;
alter table phase1.push_outbox add constraint push_outbox_kind_check check (kind in ('order_paid','order_delivered','order_refunded','announcement','test','campaign','alert'));

-- 'alert' goes to one admin's phones and, like a test, ignores the customer notification switches.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'phase1' and p.proname = 'push_enqueue';
  if position($n$if p_kind <> 'test' then$n$ in d) = 0 then raise exception 'push_enqueue pattern not found'; end if;
  execute replace(d, $n$if p_kind <> 'test' then$n$, $r$if p_kind not in ('test','alert') then$r$);
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'phase1' and p.proname = 'push_recipients';
  if position($n$elsif j.kind in ('test','campaign') then$n$ in d) = 0 then raise exception 'push_recipients pattern not found'; end if;
  execute replace(d, $n$elsif j.kind in ('test','campaign') then$n$, $r$elsif j.kind in ('test','campaign','alert') then$r$);
end $$;

create or replace function phase1.payment_guard_run() returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare p text; v_last timestamptz; v_attempts int; v_payers int; v_live text; v_switched boolean; v_title text; v_body text; a record; v_out jsonb := '[]'::jsonb;
begin
  select value->>'provider' into v_live from phase1.site_settings where key = 'payment_gateway';
  foreach p in array array['paystack','kora'] loop
    select max(coalesce(i.verified_at, i.updated_at)) into v_last from phase1.payment_intents i where i.provider::text = p and i.status = 'succeeded';
    select count(*), count(distinct coalesce(i.user_id::text, i.order_id::text, i.id::text)) into v_attempts, v_payers
      from phase1.payment_intents i
      where i.provider::text = p and i.status <> 'succeeded' and i.created_at > greatest(coalesce(v_last, 'epoch'), now() - interval '12 hours') and i.created_at < now() - interval '3 minutes';
    v_out := v_out || jsonb_build_object('provider', p, 'attempts', v_attempts, 'payers', v_payers, 'last_ok', v_last);
    if v_attempts < 10 or v_payers < 6 then continue; end if;
    if p = 'kora' and v_live <> 'kora' then continue; end if; -- Kora is switched off: nothing new is being sent to it
    v_switched := false;
    if p = 'kora' and v_live = 'kora' then
      update phase1.site_settings set value = jsonb_set(value, '{provider}', '"paystack"'), updated_at = now() where key = 'payment_gateway';
      v_switched := true; v_live := 'paystack';
    end if;
    v_title := case when v_switched then 'Kora is failing: switched to Paystack' else initcap(p) || ' payments are failing' end;
    v_body := v_attempts || ' payment attempts and none went through since ' || coalesce(to_char(v_last at time zone 'Africa/Accra', 'DD Mon HH24:MI'), 'a long time') || ' (Ghana time).'
      || case when v_switched then ' New payments now go through Paystack.' when p = v_live or p = 'paystack' then ' Customers may be unable to pay. Check now.' else '' end;
    for a in select user_id from phase1.admin_users where is_active loop
      perform phase1.push_enqueue('alert', 'guard:' || p || ':' || to_char(now(), 'YYYYMMDDHH24') || ':' || a.user_id, v_title, v_body, '/admin/finance', null, null, a.user_id);
    end loop;
  end loop;
  insert into phase1.site_settings (key, value, updated_at) values ('payment_guard', jsonb_build_object('checked_at', now(), 'gateways', v_out), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_out;
end $$;
revoke all on function phase1.payment_guard_run() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'payment-guard';
select cron.schedule('payment-guard', '*/5 * * * *', 'select phase1.payment_guard_run()');
