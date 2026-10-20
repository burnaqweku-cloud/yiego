-- Applied live 20 Oct 2026. Delivery reports from Vynfy (GET /api/v1/status/<task_id>) recorded per text
-- by the sms-status-sync function; never used to re-queue anything automatically.
alter table phase1.order_sms_outbox
  add column if not exists delivery_status text check (delivery_status in ('delivered','not_delivered','failed','sent','pending','unknown')),
  add column if not exists delivery_checked_at timestamptz,
  add column if not exists delivery_checks integer not null default 0,
  add column if not exists delivery_raw jsonb;
-- Vynfy's webhook identifies a text by its per-message id (not the task id) and gives a reason on failure.
alter table phase1.order_sms_outbox add column if not exists provider_message_id text, add column if not exists delivery_reason text;
create index if not exists order_sms_outbox_message_idx on phase1.order_sms_outbox(provider_message_id);
