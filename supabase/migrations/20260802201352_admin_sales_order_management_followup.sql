create index if not exists orders_admin_resolution_updated_by_idx
  on phase1.orders (admin_resolution_updated_by)
  where admin_resolution_updated_by is not null;

drop policy if exists data_products_public_active_read on phase1.data_products;
drop policy if exists data_products_admin_read_all on phase1.data_products;

create policy data_products_anon_active_read
on phase1.data_products
for select
to anon
using (is_active = true);

create policy data_products_authenticated_read
on phase1.data_products
for select
to authenticated
using (is_active = true or (select private.is_phase1_admin()));

notify pgrst, 'reload schema';
