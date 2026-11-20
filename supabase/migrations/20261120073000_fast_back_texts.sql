-- 20 Nov 2026 (owner): "fast delivery is back" text to our own customers. 593 rows of kind 'fast_back' were queued in
-- phase1.sms_queue (sender Dyverify, one a minute 08:00-17:52 Ghana, dedupe key fast_back:20nov:<phone>): people who
-- bought MTN on datayego.com in the last 30 days, not agents (by account or by number), not store customers
-- (home_store_id), not admins, nobody with a paid order still open (payer or any number they bought for, so the 95
-- held for MTN verification are left out), not the 3 test numbers (they got it first: all delivered).
-- Owner was still worried MTN could slow again, so: if MTN slows while texts are still waiting (typical time over
-- 30 minutes, or the longest real wait over an hour), the rest are paused (status 'paused', which the sender never
-- picks) and an admin alert goes out once. Resuming is a manual step: set them back to 'pending' with fresh one-a-minute
-- not_before times.
alter table phase1.sms_queue drop constraint if exists sms_queue_status_check;
alter table phase1.sms_queue add constraint sms_queue_status_check check (status = any (array['pending','sent','failed','paused']));

create or replace function phase1.fast_back_guard()
returns text language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare s jsonb := phase1.delivery_speed_by_network()->'MTN'; med numeric; lng numeric; n int;
begin
  if not exists (select 1 from phase1.sms_queue where kind = 'fast_back' and status = 'pending') then return 'nothing_waiting'; end if;
  med := nullif(s->>'median_minutes','')::numeric; lng := nullif(s->>'longest_minutes','')::numeric;
  if coalesce(med, 0) <= 30 and coalesce(lng, 0) <= 60 then return 'fast'; end if;
  update phase1.sms_queue set status = 'paused' where kind = 'fast_back' and status = 'pending';
  get diagnostics n = row_count;
  perform phase1.admin_alert('fast_back_paused:' || to_char(now() at time zone 'Africa/Accra', 'YYYY-MM-DD'),
    'Fast-delivery texts paused',
    format('MTN slowed down (typical %s min, longest wait %s min), so %s "orders arrive in minutes" texts are on hold. Nothing more goes out until they are resumed.', coalesce(round(med)::text,'?'), coalesce(round(lng)::text,'?'), n),
    '/admin');
  return 'paused ' || n;
end $$;
revoke all on function phase1.fast_back_guard() from public, anon, authenticated;

select cron.schedule('fast-back-guard', '*/5 * * * *', 'select phase1.fast_back_guard()');
