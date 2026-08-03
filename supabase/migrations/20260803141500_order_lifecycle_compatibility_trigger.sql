create or replace function phase1.sync_order_lifecycle_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.recipient_phone_normalized := regexp_replace(coalesce(new.recipient_phone, ''), '[^0-9]', '', 'g');

  if new.payment_expires_at is null and new.payment_status in ('created', 'pending') then
    new.payment_expires_at := coalesce(new.created_at, now()) + interval '24 hours';
  end if;

  if new.status in ('delivered', 'cancelled', 'refunded') then
    new.is_open := false;
    new.closed_at := coalesce(new.closed_at, now());
    new.closed_reason := coalesce(new.closed_reason, new.status::text);
  elsif new.status = 'failed' and new.payment_status <> 'succeeded' then
    new.is_open := false;
    new.closed_at := coalesce(new.closed_at, now());
    new.closed_reason := coalesce(new.closed_reason, 'failed_before_payment');
  else
    new.is_open := true;
    new.closed_at := null;
    new.closed_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_order_lifecycle_fields_trigger on phase1.orders;
create trigger sync_order_lifecycle_fields_trigger
before insert or update of recipient_phone, status, payment_status, payment_expires_at
on phase1.orders
for each row execute function phase1.sync_order_lifecycle_fields();

notify pgrst, 'reload schema';