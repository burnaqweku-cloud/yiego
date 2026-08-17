-- Keep the delivery-speed snapshot fresh.
--
-- The supplier's tracker moves through the day, so a stale snapshot would tell
-- customers yesterday's story. Every five minutes is well inside the
-- supplier's rate limit, and the function throttles itself anyway, so a double
-- fire costs nothing.
--
-- The key below is the publishable key that already ships in the browser
-- bundle, not a secret: the function reaches the supplier using its own
-- server-side credentials.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'refresh-supplier-delivery-status',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/supplier-delivery-status',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_tAbh99C5tny6sMAiu6ZYrg_BWjkRIAX"}'::jsonb,
    body := '{"action":"refresh"}'::jsonb
  );
  $$
);
