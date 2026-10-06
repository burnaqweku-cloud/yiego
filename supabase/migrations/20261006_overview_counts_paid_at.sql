-- PENDING APPLY (Supabase MCP auth dropped at 03:50 UTC): Overview "paid" figures should count by paid_at, matching the Orders page.
create or replace function phase1.admin_overview_counts(p_from timestamptz) returns jsonb language sql stable security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then (
    with o as (select * from phase1.orders where created_at >= coalesce(p_from, '2026-01-01'::timestamptz)),
         paid as (select * from phase1.orders where payment_status = 'succeeded' and coalesce(paid_at, created_at) >= coalesce(p_from, '2026-01-01'::timestamptz))
    select jsonb_build_object(
      'created', (select count(*) from o),
      'unpaid', (select count(*) from o where payment_status not in ('succeeded','refunded')),
      'paid', (select count(*) from paid),
      'delivered', (select count(*) from paid where status = 'delivered'),
      'in_flight', (select count(*) from paid where status in ('paid','processing','pending_supplier') and coalesce(admin_resolution_status,'') not in ('awaiting_verification','wrong_network')),
      'cooldown', (select count(*) from paid where status in ('paid','processing','pending_supplier') and supplier_retry_after is not null),
      'verification', (select count(*) from paid where admin_resolution_status = 'awaiting_verification'),
      'wrong_network', (select count(*) from paid where admin_resolution_status = 'wrong_network'),
      'failed', (select count(*) from paid where status::text like 'failed%' and admin_resolution_status is distinct from 'wrong_network'),
      'refunded', (select count(*) from o where payment_status = 'refunded'),
      'revenue', (select coalesce(sum(amount),0) from paid))) end
$$;
