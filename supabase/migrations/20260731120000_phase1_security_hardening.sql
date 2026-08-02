-- Phase 1 security hardening and app access grants

-- Safer search path for the shared trigger helper.
create or replace function phase1.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keep admin lookup available for policies, but make the execution target explicit.
create or replace function phase1.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = phase1, pg_catalog
as $$
  select exists (
    select 1
    from phase1.admin_users au
    where au.user_id = check_user_id
      and au.is_active = true
  );
$$;

-- Frontend reads need schema/table visibility.
grant usage on schema phase1 to anon, authenticated, service_role;

grant select on phase1.networks to anon, authenticated, service_role;
grant select on phase1.data_products to anon, authenticated, service_role;

grant select, update on phase1.profiles to authenticated, service_role;
grant select on phase1.wallets to authenticated, service_role;
grant select on phase1.wallet_ledger_entries to authenticated, service_role;
grant select on phase1.orders to authenticated, service_role;
grant select on phase1.payment_intents to authenticated, service_role;
grant select on phase1.order_events to authenticated, service_role;

grant select on phase1.admin_users to authenticated, service_role;
grant select on phase1.suppliers to authenticated, service_role;
grant select on phase1.supplier_api_logs to authenticated, service_role;
grant select on phase1.webhook_events to authenticated, service_role;
grant select on phase1.number_verifications to authenticated, service_role;
grant select on phase1.supplier_health_checks to authenticated, service_role;
grant select on phase1.audit_logs to authenticated, service_role;

grant all privileges on phase1.admin_roles to service_role;
grant all privileges on phase1.admin_user_roles to service_role;
grant all privileges on phase1.suppliers to service_role;
grant all privileges on phase1.supplier_product_mappings to service_role;
grant all privileges on phase1.admin_notes to service_role;

-- Privileged RPCs should only be callable from backend code using the service role.
revoke all on function phase1.credit_wallet_deposit(uuid, text) from public, anon, authenticated;
grant execute on function phase1.credit_wallet_deposit(uuid, text) to service_role;

revoke all on function phase1.create_wallet_data_order(uuid, text, text) from public, anon, authenticated;
grant execute on function phase1.create_wallet_data_order(uuid, text, text) to service_role;

-- Make the admin lookup explicit too.
grant execute on function phase1.is_admin(uuid) to authenticated, service_role;

