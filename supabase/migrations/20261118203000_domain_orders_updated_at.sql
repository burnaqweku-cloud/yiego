-- Applied live 18 Nov 2026 (owner): admin_domain_connect / admin_domain_refresh / admin_domain_complete set updated_at,
-- which domain_orders never had, so Connect failed with "column updated_at of relation domain_orders does not exist".
-- Tested after the fix (in a rolled-back transaction): Connect queues both Cloudflare hostnames and sets the store's
-- domain to pending, Check now reads the replies, Completed sets status live and books domains_pending -> domain_income once.
alter table phase1.domain_orders add column if not exists updated_at timestamptz not null default now();
