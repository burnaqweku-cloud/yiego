-- Lock down trigger helpers and make payment events explicitly backend-only.
alter function phase1.set_updated_at() set search_path = pg_catalog;
revoke execute on function phase1.set_updated_at() from public, anon, authenticated;
revoke execute on function phase1.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function phase1.is_admin(uuid) from public, anon;
grant execute on function phase1.is_admin(uuid) to authenticated, service_role;

create policy "payment_events_service_role_all" on phase1.payment_events
  for all to service_role using (true) with check (true);
