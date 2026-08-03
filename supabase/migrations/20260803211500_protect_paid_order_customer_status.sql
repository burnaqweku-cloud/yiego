create or replace function phase1.protect_paid_order_customer_status()
returns trigger
language plpgsql
security definer
set search_path = phase1, public
as $$
begin
  if new.payment_status = 'succeeded'::phase1.payment_status
     and new.status = 'failed_needs_review'::phase1.order_status
     and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) then
    new.admin_resolution_status := 'processing';
    new.admin_resolution_reason := 'Your payment was successful. Delivery is taking longer than expected while we review your order.';
    new.admin_resolution_updated_at := now();
    new.admin_resolution_updated_by := null;
  end if;

  if new.status in ('delivered'::phase1.order_status, 'refunded'::phase1.order_status, 'cancelled'::phase1.order_status) then
    if new.admin_resolution_updated_by is null then
      new.admin_resolution_status := null;
      new.admin_resolution_reason := null;
      new.admin_resolution_updated_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_paid_order_customer_status on phase1.orders;
create trigger trg_protect_paid_order_customer_status
before insert or update of status, payment_status on phase1.orders
for each row execute function phase1.protect_paid_order_customer_status();

revoke all on function phase1.protect_paid_order_customer_status() from public, anon, authenticated;
grant execute on function phase1.protect_paid_order_customer_status() to service_role;

update phase1.orders
set admin_resolution_status = 'processing',
    admin_resolution_reason = 'Your payment was successful. Delivery is taking longer than expected while we review your order.',
    admin_resolution_updated_at = now(),
    admin_resolution_updated_by = null
where payment_status = 'succeeded'
  and status = 'failed_needs_review';
