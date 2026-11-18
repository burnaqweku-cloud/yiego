-- Applied live 18 Nov 2026 (owner): backup for domain payments. Every 5 minutes, the domain-payment-check function asks
-- Paystack about domain payments still waiting (last 3 days). When Paystack says one succeeded and its signal never
-- arrived, it records the same charge.success event, so zz_payment_events_domain_trg marks the order paid exactly once.
-- Only calls the function when there is something to check.
select cron.unschedule(jobid) from cron.job where jobname = 'domain-payment-check';
select cron.schedule('domain-payment-check', '*/5 * * * *', $job$
  select net.http_post(url:='https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/domain-payment-check', body:='{}'::jsonb,
    headers:=jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')),
    timeout_milliseconds:=60000)
  where exists (select 1 from phase1.payment_intents where purpose = 'domain_purchase' and status = 'pending'
    and created_at > now() - interval '3 days' and created_at < now() - interval '2 minutes')
$job$);
