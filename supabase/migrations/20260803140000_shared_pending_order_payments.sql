-- Prepared orders, resumable payments and shared YieGo payment requests.

alter table phase1.orders
  add column if not exists recipient_phone_normalized text,
  add column if not exists payment_arrangement text not null default 'unselected',
  add column if not exists selected_payment_method text,
  add column if not exists payment_expires_at timestamptz,
  add column if not exists paid_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists is_open boolean not null default true,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_reason text;

update phase1.orders set recipient_phone_normalized = regexp_replace(recipient_phone, '[^0-9]', '', 'g') where recipient_phone_normalized is null;
update phase1.orders set payment_expires_at = created_at + interval '24 hours' where payment_expires_at is null and payment_status in ('created', 'pending');
update phase1.orders set is_open = status not in ('delivered', 'cancelled', 'refunded', 'failed') where is_open is distinct from (status not in ('delivered', 'cancelled', 'refunded', 'failed'));
update phase1.orders set status='cancelled',payment_status='abandoned',is_open=false,closed_at=now(),closed_reason='payment_expired_migration',updated_at=now() where is_open and payment_status in ('created','pending') and payment_expires_at<=now();

with ranked as (
  select id,row_number() over(partition by recipient_phone_normalized order by created_at desc,id desc) rn
  from phase1.orders where is_open
)
update phase1.orders o set status='cancelled',payment_status=case when o.payment_status in ('created','pending') then 'abandoned' else o.payment_status end,is_open=false,closed_at=now(),closed_reason='duplicate_open_order_migration',updated_at=now()
from ranked r where o.id=r.id and r.rn>1;

alter table phase1.orders alter column recipient_phone_normalized set not null;
alter table phase1.orders drop constraint if exists orders_payment_arrangement_check;
alter table phase1.orders add constraint orders_payment_arrangement_check check(payment_arrangement in ('unselected','self','shared'));
alter table phase1.orders drop constraint if exists orders_selected_payment_method_check;
alter table phase1.orders add constraint orders_selected_payment_method_check check(selected_payment_method is null or selected_payment_method in ('wallet','paystack'));
create unique index if not exists orders_one_open_per_recipient_idx on phase1.orders(recipient_phone_normalized) where is_open;
create index if not exists orders_owner_open_created_idx on phase1.orders(user_id,is_open,created_at desc);
create index if not exists orders_payment_expiry_idx on phase1.orders(payment_expires_at) where is_open and payment_status in ('created','pending');

create or replace function phase1.close_expired_unpaid_orders()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  with expired as (
    update phase1.orders set status='cancelled',payment_status='abandoned',is_open=false,closed_at=now(),closed_reason='payment_expired',updated_at=now()
    where is_open and payment_status in ('created','pending') and payment_expires_at is not null and payment_expires_at<=now() returning id
  ) select count(*) into v_count from expired;
  return v_count;
end;$$;

create or replace function phase1.prepare_data_order(p_user_id uuid,p_product_code text,p_recipient_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_phone text; v_product phase1.data_products%rowtype; v_network phase1.networks%rowtype; v_mapping phase1.supplier_product_mappings%rowtype; v_existing phase1.orders%rowtype; v_order phase1.orders%rowtype;
begin
  perform phase1.close_expired_unpaid_orders();
  v_phone:=regexp_replace(coalesce(p_recipient_phone,''),'[^0-9]','','g');
  if v_phone !~ '^0[0-9]{9}$' then raise exception 'invalid_recipient_phone'; end if;
  select * into v_existing from phase1.orders where recipient_phone_normalized=v_phone and is_open order by created_at desc limit 1;
  if found then return jsonb_build_object('existing',true,'orderId',v_existing.id,'orderReference',v_existing.order_reference); end if;
  if p_product_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then select * into v_product from phase1.data_products where id=p_product_code::uuid and is_active; else select * into v_product from phase1.data_products where app_product_code=p_product_code and is_active; end if;
  if not found then raise exception 'product_not_found'; end if;
  select * into v_network from phase1.networks where id=v_product.network_id and is_active;
  if not found then raise exception 'network_not_available'; end if;
  if v_network.is_paused then raise exception 'network_paused'; end if;
  select * into v_mapping from phase1.supplier_product_mappings where product_id=v_product.id and is_active limit 1;
  if not found then raise exception 'supplier_mapping_not_found'; end if;
  insert into phase1.orders(order_reference,user_id,recipient_phone,recipient_phone_normalized,network_id,product_id,supplier_id,amount,cost_amount,currency,status,payment_status,payment_arrangement,payment_expires_at,is_open,supplier_idempotency_key)
  values('YG-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),p_user_id,v_phone,v_phone,v_product.network_id,v_product.id,v_mapping.supplier_id,v_product.customer_price,v_product.cost_price,'GHS','awaiting_payment','pending','unselected',now()+interval '24 hours',true,gen_random_uuid()::text) returning * into v_order;
  insert into phase1.order_events(order_id,event_type,from_status,to_status,message,metadata,created_by) values(v_order.id,'order.prepared','created','awaiting_payment','Order prepared before payment selection',jsonb_build_object('expiresAt',v_order.payment_expires_at),p_user_id);
  return jsonb_build_object('existing',false,'orderId',v_order.id,'orderReference',v_order.order_reference,'amount',v_order.amount,'recipientPhone',v_order.recipient_phone,'expiresAt',v_order.payment_expires_at);
exception when unique_violation then
  select * into v_existing from phase1.orders where recipient_phone_normalized=v_phone and is_open order by created_at desc limit 1;
  return jsonb_build_object('existing',true,'orderId',v_existing.id,'orderReference',v_existing.order_reference);
end;$$;

create or replace function phase1.pay_prepared_order_with_wallet(p_order_reference text,p_payer_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order phase1.orders%rowtype; v_wallet phase1.wallets%rowtype; v_ref text; v_after numeric(12,2);
begin
  perform phase1.close_expired_unpaid_orders();
  select * into v_order from phase1.orders where order_reference=upper(trim(p_order_reference)) for update;
  if not found then raise exception 'order_not_found'; end if;
  if not v_order.is_open then raise exception 'order_closed'; end if;
  if v_order.payment_status='succeeded' then raise exception 'order_already_paid'; end if;
  if v_order.payment_expires_at<=now() then raise exception 'order_expired'; end if;
  select * into v_wallet from phase1.wallets where user_id=p_payer_user_id and status='active' for update;
  if not found then raise exception 'wallet_not_found'; end if;
  if v_wallet.balance<v_order.amount then raise exception 'insufficient_wallet_balance'; end if;
  v_ref:='YGW-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)); v_after:=v_wallet.balance-v_order.amount;
  insert into phase1.wallet_ledger_entries(wallet_id,user_id,direction,type,amount,balance_before,balance_after,status,reference,order_id,note) values(v_wallet.id,p_payer_user_id,'debit','purchase',v_order.amount,v_wallet.balance,v_after,'posted',v_ref,v_order.id,case when v_order.user_id=p_payer_user_id then 'Wallet data purchase' else 'Paid for another YieGo order' end);
  update phase1.wallets set balance=v_after,updated_at=now() where id=v_wallet.id;
  update phase1.orders set payment_status='succeeded',status='paid',payment_arrangement=case when user_id=p_payer_user_id then 'self' else 'shared' end,selected_payment_method='wallet',paid_by_user_id=p_payer_user_id,paid_at=now(),wallet_ledger_entry_id=(select id from phase1.wallet_ledger_entries where reference=v_ref),updated_at=now() where id=v_order.id;
  insert into phase1.order_events(order_id,event_type,from_status,to_status,message,metadata,created_by) values(v_order.id,'payment.succeeded',v_order.status,'paid','Wallet payment completed',jsonb_build_object('ledgerReference',v_ref,'paidBy',p_payer_user_id),p_payer_user_id);
  return jsonb_build_object('orderId',v_order.id,'orderReference',v_order.order_reference,'ledgerReference',v_ref,'balanceAfter',v_after);
end;$$;

revoke all on function phase1.prepare_data_order(uuid,text,text) from public,anon,authenticated;
grant execute on function phase1.prepare_data_order(uuid,text,text) to service_role;
revoke all on function phase1.pay_prepared_order_with_wallet(text,uuid) from public,anon,authenticated;
grant execute on function phase1.pay_prepared_order_with_wallet(text,uuid) to service_role;
revoke all on function phase1.close_expired_unpaid_orders() from public,anon,authenticated;
grant execute on function phase1.close_expired_unpaid_orders() to service_role;
notify pgrst,'reload schema';