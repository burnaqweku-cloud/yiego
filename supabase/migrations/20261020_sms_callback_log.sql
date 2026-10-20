-- Applied live 20 Oct 2026. Raw log of Vynfy delivery callbacks (sms-callback function) and the
-- dedicated callback secret (internal_secrets 'sms_callback', generated in the database).
create table if not exists phase1.sms_callback_log (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  task_id text, status text, delivery text, reason text, body jsonb
);
grant all on phase1.sms_callback_log to service_role;
revoke all on phase1.sms_callback_log from anon, authenticated;
alter table phase1.sms_callback_log enable row level security;
create index if not exists sms_callback_log_task_idx on phase1.sms_callback_log(task_id);
insert into phase1.internal_secrets(key, value) select 'sms_callback', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where not exists (select 1 from phase1.internal_secrets where key='sms_callback');
