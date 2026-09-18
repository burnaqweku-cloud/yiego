-- DataBundlesHub refuses a second order to the same number within 10 minutes
-- of the previous one, delivered or not. That is a cooldown, not a failure:
-- the order is parked with a retry time and re-sent automatically by the
-- sync job once the window has passed.
alter table phase1.orders
  add column if not exists supplier_retry_after timestamptz,
  add column if not exists supplier_retry_count integer not null default 0;

create index if not exists orders_supplier_retry_due_idx
  on phase1.orders (supplier_retry_after)
  where supplier_retry_after is not null and supplier_purchase_id is null;

comment on column phase1.orders.supplier_retry_after is
  'Set when the supplier asked us to wait (e.g. DBH 10-minute per-number cooldown). The sync job re-sends the order once this time has passed.';
