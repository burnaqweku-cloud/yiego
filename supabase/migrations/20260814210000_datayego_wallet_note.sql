-- DataYego rename: the wallet ledger note for shared payments said "Paid for
-- another YieGo order". Recreate the live function (definition pulled via
-- pg_get_functiondef, so no drift) with the new brand name. Historical ledger
-- rows keep the old wording — they are records of what was shown at the time.
CREATE OR REPLACE FUNCTION phase1.pay_prepared_order_with_wallet(p_order_reference text, p_payer_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order phase1.orders%rowtype;
  v_wallet phase1.wallets%rowtype;
  v_ref text;
  v_after numeric(12,2);
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
  v_ref:='YGW-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  v_after:=v_wallet.balance-v_order.amount;
  insert into phase1.wallet_ledger_entries(wallet_id,user_id,direction,type,amount,balance_before,balance_after,status,reference,order_id,note)
  values(v_wallet.id,p_payer_user_id,'debit','purchase',v_order.amount,v_wallet.balance,v_after,'posted',v_ref,v_order.id,case when v_order.user_id=p_payer_user_id then 'Wallet data purchase' else 'Paid for another DataYego order' end);
  update phase1.wallets set balance=v_after,updated_at=now() where id=v_wallet.id;
  update phase1.orders set payment_status='succeeded',status='paid',payment_arrangement=case when user_id=p_payer_user_id then 'self' else 'shared' end,selected_payment_method='wallet',paid_by_user_id=p_payer_user_id,paid_at=now(),wallet_ledger_entry_id=(select id from phase1.wallet_ledger_entries where reference=v_ref),updated_at=now() where id=v_order.id;
  insert into phase1.order_events(order_id,event_type,from_status,to_status,message,metadata,created_by)
  values(v_order.id,'payment.succeeded',v_order.status,'paid','Wallet payment completed',jsonb_build_object('ledgerReference',v_ref,'paidBy',p_payer_user_id),p_payer_user_id);
  return jsonb_build_object('orderId',v_order.id,'orderReference',v_order.order_reference,'ledgerReference',v_ref,'balanceAfter',v_after);
end;
$function$
;

notify pgrst, 'reload schema';
