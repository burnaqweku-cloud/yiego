-- Number-verified texts without an order, second step (17 Nov 2026). Applied live 17 Nov 2026.
-- Owner: 79% of the numbers that bought did so on our site, so the numbers we cannot place get datayego.com rather than
-- no address ("we can't just risk it all"); the one number whose account belongs to an agent's store (maxlow) gets
-- that store's address. The 7 sent earlier without an address are not sent again.
-- Pace: one a minute. The drip now runs every minute and wakes service-pay itself after queuing (as the renewal
-- texts do), so each text leaves within seconds of being queued and the next one a minute later; still only one
-- waiting at a time and only 8:00-20:00 Ghana time.
update phase1.number_verified_texts set message = message || ' datayego.com', origin = 'unknown_ours'
 where origin = 'checked_only' and queued_at is null and skipped is null and p9 <> '538097453';
update phase1.number_verified_texts set message = message || ' maxlow.datayego.com', origin = 'store:maxlow'
 where p9 = '538097453' and queued_at is null;

create or replace function phase1.number_verified_drip() returns text
language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare r record; h int := extract(hour from now() at time zone 'Africa/Accra');
begin
  if h < 8 or h >= 20 then return 'night'; end if;
  if exists (select 1 from phase1.sms_queue where kind = 'number_verified' and status = 'pending') then return 'waiting'; end if;
  for r in select * from phase1.number_verified_texts where queued_at is null and skipped is null order by created_at, p9 limit 1 for update skip locked loop
    if exists (select 1 from phase1.orders o where right(regexp_replace(coalesce(o.recipient_phone, ''), '\D', '', 'g'), 9) = r.p9 and o.payment_status::text = 'succeeded') then
      update phase1.number_verified_texts set skipped = 'bought_since' where p9 = r.p9; return 'skipped';
    end if;
    insert into phase1.sms_queue (kind, phone, message, sender, dedupe_key) values ('number_verified', r.phone, r.message, 'Dyverify', 'number_verified:' || r.p9)
      on conflict (dedupe_key) do nothing;
    update phase1.number_verified_texts set queued_at = now() where p9 = r.p9;
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay', body := '{"action":"run"}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
    return 'queued';
  end loop;
  return 'done';
end $$;
revoke all on function phase1.number_verified_drip() from public, anon, authenticated;

select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'number-verified-drip'), schedule := '* * * * *', active := true);
