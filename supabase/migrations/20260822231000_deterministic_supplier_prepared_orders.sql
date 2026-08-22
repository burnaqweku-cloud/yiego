-- Same deterministic supplier choice for the prepared-order path.
-- It shares the `limit 1` with no ordering that sent a live order to the
-- wrong supplier, and it stamps supplier_id at insert, so it decides the
-- route before fulfilment ever runs.

CREATE OR REPLACE FUNCTION phase1.prepare_data_order(p_user_id uuid, p_product_code text, p_recipient_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phone text;
  v_product phase1.data_products%rowtype;
  v_network phase1.networks%rowtype;
  v_mapping phase1.supplier_product_mappings%rowtype;
  v_existing phase1.orders%rowtype;
  v_order phase1.orders%rowtype;
begin
  perform phase1.close_expired_unpaid_orders();
  v_phone := regexp_replace(coalesce(p_recipient_phone, ''), '[^0-9]', '', 'g');
  if v_phone !~ '^0[0-9]{9}$' then raise exception 'invalid_recipient_phone'; end if;
  select * into v_existing from phase1.orders where recipient_phone_normalized = v_phone and is_open order by created_at desc limit 1;
  if found then return jsonb_build_object('existing', true, 'orderId', v_existing.id, 'orderReference', v_existing.order_reference); end if;
  if p_product_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select * into v_product from phase1.data_products where id = p_product_code::uuid and is_active;
  else
    select * into v_product from phase1.data_products where app_product_code = p_product_code and is_active;
  end if;
  if not found then raise exception 'product_not_found'; end if;
  select * into v_network from phase1.networks where id = v_product.network_id and is_active;
  if not found then raise exception 'network_not_available'; end if;
  if v_network.is_paused then raise exception 'network_paused'; end if;
  select m.* into v_mapping from phase1.supplier_product_mappings m join phase1.suppliers s on s.id = m.supplier_id where m.product_id = v_product.id and m.is_active and s.status = 'active' order by s.display_order asc, m.id asc limit 1;
  if not found then raise exception 'supplier_mapping_not_found'; end if;
  insert into phase1.orders (order_reference,user_id,recipient_phone,recipient_phone_normalized,network_id,product_id,supplier_id,amount,cost_amount,currency,status,payment_status,payment_arrangement,payment_expires_at,is_open,supplier_idempotency_key)
  values ('YG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),p_user_id,v_phone,v_phone,v_product.network_id,v_product.id,v_mapping.supplier_id,v_product.customer_price,v_product.cost_price,'GHS','awaiting_payment','pending','unselected',now()+interval '24 hours',true,gen_random_uuid()::text)
  returning * into v_order;
  insert into phase1.order_events(order_id,event_type,from_status,to_status,message,metadata,created_by)
  values(v_order.id,'order.prepared','created','awaiting_payment','Order prepared before payment selection',jsonb_build_object('expiresAt',v_order.payment_expires_at),p_user_id);
  return jsonb_build_object('existing',false,'orderId',v_order.id,'orderReference',v_order.order_reference,'amount',v_order.amount,'recipientPhone',v_order.recipient_phone,'expiresAt',v_order.payment_expires_at);
exception when unique_violation then
  select * into v_existing from phase1.orders where recipient_phone_normalized=v_phone and is_open order by created_at desc limit 1;
  return jsonb_build_object('existing',true,'orderId',v_existing.id,'orderReference',v_existing.order_reference);
end;
$function$
;

notify pgrst, 'reload schema';
