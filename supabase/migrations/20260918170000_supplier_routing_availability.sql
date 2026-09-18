-- ═══════════════════════════════════════════════════════════════════════
-- Supplier routing + availability controls + InstantDataGH catalogue
--
-- • networks.preferred_supplier_id — which supplier fulfils this network.
--   The admin flips it; fulfillment obeys it when a mapping exists.
-- • networks.is_paused / data_products.is_paused — switch a whole network
--   or one bundle off. The shop shows the reason; a guard trigger refuses
--   any order for a paused product no matter which path created it.
-- • InstantDataGH product mappings at the prices from the supplier site.
-- ═══════════════════════════════════════════════════════════════════════

alter table phase1.networks add column if not exists preferred_supplier_id uuid references phase1.suppliers(id);
alter table phase1.data_products add column if not exists is_paused boolean not null default false;
alter table phase1.data_products add column if not exists pause_reason text;

-- ── InstantDataGH mappings (AirtelTigo + Telecel) ──────────────────────
do $$
declare v_sup uuid; v_at uuid; v_tel uuid; r record;
begin
  select id into v_sup from phase1.suppliers where code='instantdatagh';
  select id into v_at from phase1.networks where code='airteltigo';
  select id into v_tel from phase1.networks where code='telecel';
  update phase1.suppliers set base_url='https://instantdatagh.com/api.php', name='InstantDataGH', public_name='InstantDataGH', is_customer_visible=false where id=v_sup;

  for r in select * from (values
    (v_at,1,3.70),(v_at,2,7.40),(v_at,3,11.10),(v_at,4,14.80),(v_at,5,18.50),(v_at,6,22.20),(v_at,7,25.90),(v_at,8,29.60),(v_at,9,33.30),(v_at,10,36.50),(v_at,12,43.80),(v_at,15,54.75),(v_at,20,73.00),(v_at,25,95.00),(v_at,30,109.50),(v_at,40,146.00),(v_at,50,182.50),
    (v_tel,10,35.00),(v_tel,15,52.50),(v_tel,20,70.00),(v_tel,25,87.50),(v_tel,30,105.00),(v_tel,35,133.00),(v_tel,40,140.00),(v_tel,45,157.50),(v_tel,50,175.00),(v_tel,100,350.00)
  ) as t(network_id, gb, price)
  loop
    insert into phase1.supplier_product_mappings (product_id, supplier_id, supplier_network_code, supplier_capacity, supplier_price, customer_price, is_active, metadata)
    select p.id, v_sup, case when p.network_id=v_at then 'AirtelTigo' else 'Telecel' end, r.gb::text, r.price, p.customer_price, true, '{"source":"instantdatagh.com 2026-09-18"}'::jsonb
    from phase1.data_products p where p.network_id=r.network_id and p.capacity_gb=r.gb
      and not exists (select 1 from phase1.supplier_product_mappings m where m.product_id=p.id and m.supplier_id=v_sup);
  end loop;

  -- AirtelTigo goes through InstantDataGH (DataMartGH keeps failing it out of stock).
  update phase1.networks set preferred_supplier_id=v_sup where id=v_at;
end $$;

-- ── Admin controls ─────────────────────────────────────────────────────
create or replace function phase1.admin_set_network_supplier(p_actor uuid, p_network_code text, p_supplier_code text) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare v_sup uuid; v_net uuid; v_n int;
begin
  perform phase1.finance_assert_admin(p_actor);
  select id into v_net from phase1.networks where code=p_network_code; if v_net is null then raise exception 'unknown_network'; end if;
  if p_supplier_code is null or p_supplier_code='' then update phase1.networks set preferred_supplier_id=null, updated_at=now() where id=v_net; return jsonb_build_object('network', p_network_code, 'supplier', null); end if;
  select id into v_sup from phase1.suppliers where code=p_supplier_code; if v_sup is null then raise exception 'unknown_supplier'; end if;
  select count(*) into v_n from phase1.supplier_product_mappings m join phase1.data_products p on p.id=m.product_id where m.supplier_id=v_sup and p.network_id=v_net and m.is_active;
  if v_n = 0 then raise exception 'supplier_has_no_bundles_for_network'; end if;
  update phase1.networks set preferred_supplier_id=v_sup, updated_at=now() where id=v_net;
  return jsonb_build_object('network', p_network_code, 'supplier', p_supplier_code, 'bundles', v_n);
end $$;

create or replace function phase1.admin_pause_network(p_actor uuid, p_network_code text, p_paused boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.finance_assert_admin(p_actor);
  update phase1.networks set is_paused=p_paused, pause_reason=case when p_paused then coalesce(nullif(trim(p_reason),''), 'Currently unavailable. Please try again later.') else null end, updated_at=now() where code=p_network_code;
end $$;

create or replace function phase1.admin_pause_product(p_actor uuid, p_product_id uuid, p_paused boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.finance_assert_admin(p_actor);
  update phase1.data_products set is_paused=p_paused, pause_reason=case when p_paused then coalesce(nullif(trim(p_reason),''), 'Currently unavailable. Please try again later.') else null end, updated_at=now() where id=p_product_id;
end $$;

create or replace function phase1.admin_set_supplier_status(p_actor uuid, p_supplier_code text, p_status phase1.supplier_status) returns void
language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.finance_assert_admin(p_actor);
  update phase1.suppliers set status=p_status, updated_at=now() where code=p_supplier_code;
end $$;

grant execute on function phase1.admin_set_network_supplier(uuid,text,text), phase1.admin_pause_network(uuid,text,boolean,text), phase1.admin_pause_product(uuid,uuid,boolean,text), phase1.admin_set_supplier_status(uuid,text,phase1.supplier_status) to authenticated;

-- ── Guard: no order for a paused bundle or network, whichever path made it ──
create or replace function phase1.orders_availability_guard() returns trigger language plpgsql as $$
declare v_reason text;
begin
  select coalesce(case when n.is_paused then n.pause_reason end, case when p.is_paused then p.pause_reason end) into v_reason
  from phase1.data_products p join phase1.networks n on n.id=p.network_id where p.id=new.product_id and (n.is_paused or p.is_paused);
  if v_reason is not null then raise exception 'bundle_unavailable: %', v_reason; end if;
  return new;
end $$;
drop trigger if exists orders_availability_guard_trg on phase1.orders;
create trigger orders_availability_guard_trg before insert on phase1.orders for each row execute function phase1.orders_availability_guard();

-- The shop reads pause flags for anonymous visitors too.
grant select (id, code, name, is_active, is_paused, pause_reason, display_order) on phase1.networks to anon, authenticated;
