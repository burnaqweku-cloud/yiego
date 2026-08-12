-- Close expired-but-open unpaid orders on a schedule.
--
-- Until now phase1.close_expired_unpaid_orders() only ran inside the
-- prepared-order RPCs, i.e. when a signed-in user opened the buy flow. Guest
-- orders could therefore hold the one-open-order-per-recipient slot
-- (orders_one_open_per_recipient_idx) long after their 24h payment window
-- lapsed, blocking that phone number from any new checkout.
create extension if not exists pg_cron;

-- cron.schedule upserts by job name, so re-running this migration is safe.
select cron.schedule(
  'close-expired-unpaid-orders',
  '*/15 * * * *',
  $$select phase1.close_expired_unpaid_orders()$$
);
