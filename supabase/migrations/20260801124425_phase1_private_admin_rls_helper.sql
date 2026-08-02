-- Keep the SECURITY DEFINER admin lookup outside the exposed Data API schema.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_phase1_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from phase1.admin_users au
    where au.user_id = check_user_id and au.is_active = true
  );
$$;
revoke all on function private.is_phase1_admin(uuid) from public, anon;
grant execute on function private.is_phase1_admin(uuid) to authenticated, service_role;

alter policy "admin_notes_admin_all" on phase1.admin_notes using ((select private.is_phase1_admin())) with check ((select private.is_phase1_admin()));
alter policy "admin_roles_admin_all" on phase1.admin_roles using ((select private.is_phase1_admin())) with check ((select private.is_phase1_admin()));
alter policy "admin_user_roles_admin_all" on phase1.admin_user_roles using ((select private.is_phase1_admin())) with check ((select private.is_phase1_admin()));
alter policy "admin_users_admin_read" on phase1.admin_users using ((select private.is_phase1_admin()));
alter policy "audit_logs_admin_read" on phase1.audit_logs using ((select private.is_phase1_admin()));
alter policy "number_verifications_admin_read" on phase1.number_verifications using ((select private.is_phase1_admin()));
alter policy "supplier_api_logs_admin_read" on phase1.supplier_api_logs using ((select private.is_phase1_admin()));
alter policy "supplier_health_checks_admin_read" on phase1.supplier_health_checks using ((select private.is_phase1_admin()));
alter policy "supplier_product_mappings_admin_all" on phase1.supplier_product_mappings using ((select private.is_phase1_admin())) with check ((select private.is_phase1_admin()));
alter policy "suppliers_admin_all" on phase1.suppliers using ((select private.is_phase1_admin())) with check ((select private.is_phase1_admin()));
alter policy "webhook_events_admin_read" on phase1.webhook_events using ((select private.is_phase1_admin()));
alter policy "profiles_read_own" on phase1.profiles using ((id = (select auth.uid())) or (select private.is_phase1_admin()));
alter policy "profiles_update_own" on phase1.profiles using ((id = (select auth.uid())) or (select private.is_phase1_admin())) with check ((id = (select auth.uid())) or (select private.is_phase1_admin()));
alter policy "wallets_read_own" on phase1.wallets using ((user_id = (select auth.uid())) or (select private.is_phase1_admin()));
alter policy "orders_read_own" on phase1.orders using ((user_id = (select auth.uid())) or (select private.is_phase1_admin()));
alter policy "ledger_read_own" on phase1.wallet_ledger_entries using ((user_id = (select auth.uid())) or (select private.is_phase1_admin()));
alter policy "payment_intents_read_own" on phase1.payment_intents using ((user_id = (select auth.uid())) or (select private.is_phase1_admin()));
alter policy "order_events_read_own" on phase1.order_events using ((select private.is_phase1_admin()) or exists (select 1 from phase1.orders o where o.id = order_events.order_id and o.user_id = (select auth.uid())));

revoke all on function phase1.is_admin(uuid) from public, anon, authenticated, service_role;
drop function phase1.is_admin(uuid);
