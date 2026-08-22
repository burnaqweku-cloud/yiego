-- Pick the supplier deterministically when the order is created.
--
-- Both functions selected a mapping with `limit 1` and no ordering, and without
-- checking the supplier was active. With one supplier that always returned the
-- same row; with two it returned an arbitrary one, so a live order ignored
-- supplier priority entirely. Rank by the supplier's display_order, with the
-- mapping id as a tie-break, and skip suppliers that are not active.

CREATE OR REPLACE FUNCTION phase1.create_wallet_data_order(p_user_id uuid, p_product_code text, p_recipient_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
declare
  v_wallet phase1.wallets%rowtype;
  v_product phase1.data_products%rowtype;
  v_network phase1.networks%rowtype;
  v_mapping phase1.supplier_product_mappings%rowtype;
  v_order_id uuid;
  v_order_reference text;
  v_ledger_reference text;
  v_balance_after numeric(12, 2);
begin
  if p_recipient_phone !~ '^0[0-9]{9}$' then
    raise exception 'invalid_recipient_phone';
  end if;

  select *
  into v_wallet
  from phase1.wallets
  where user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if p_product_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select *
    into v_product
    from phase1.data_products
    where id = p_product_code::uuid
      and is_active = true;
  else
    select *
    into v_product
    from phase1.data_products
    where app_product_code = p_product_code
      and is_active = true;
  end if;

  if not found then
    raise exception 'product_not_found';
  end if;

  select *
  into v_network
  from phase1.networks
  where id = v_product.network_id
    and is_active = true;

  if not found then
    raise exception 'network_not_available';
  end if;

  if v_network.is_paused then
    raise exception 'network_paused';
  end if;

  select m.*
  into v_mapping
  from phase1.supplier_product_mappings m
  join phase1.suppliers s on s.id = m.supplier_id
  where m.product_id = v_product.id
    and m.is_active = true
    and s.status = 'active'
  order by s.display_order asc, m.id asc
  limit 1;

  if not found then
    raise exception 'supplier_mapping_not_found';
  end if;

  if v_wallet.balance < v_product.customer_price then
    raise exception 'insufficient_wallet_balance';
  end if;

  v_order_id := gen_random_uuid();
  v_order_reference := 'YG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_ledger_reference := 'YGW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_balance_after := v_wallet.balance - v_product.customer_price;

  insert into phase1.orders (
    id,
    order_reference,
    user_id,
    recipient_phone,
    network_id,
    product_id,
    supplier_id,
    amount,
    cost_amount,
    currency,
    status,
    payment_status,
    supplier_idempotency_key
  )
  values (
    v_order_id,
    v_order_reference,
    p_user_id,
    p_recipient_phone,
    v_product.network_id,
    v_product.id,
    v_mapping.supplier_id,
    v_product.customer_price,
    v_product.cost_price,
    'GHS',
    'paid',
    'succeeded',
    gen_random_uuid()::text
  );

  insert into phase1.wallet_ledger_entries (
    wallet_id,
    user_id,
    direction,
    type,
    amount,
    balance_before,
    balance_after,
    status,
    reference,
    order_id,
    note
  )
  values (
    v_wallet.id,
    p_user_id,
    'debit',
    'purchase',
    v_product.customer_price,
    v_wallet.balance,
    v_balance_after,
    'posted',
    v_ledger_reference,
    v_order_id,
    'Wallet data purchase'
  );

  update phase1.wallets
  set balance = v_balance_after,
      updated_at = now()
  where id = v_wallet.id;

  update phase1.orders
  set wallet_ledger_entry_id = (
    select id
    from phase1.wallet_ledger_entries
    where reference = v_ledger_reference
  )
  where id = v_order_id;

  insert into phase1.order_events (
    order_id,
    event_type,
    from_status,
    to_status,
    message,
    metadata
  )
  values (
    v_order_id,
    'wallet.purchase_debited',
    'created',
    'paid',
    'Wallet debited for data purchase',
    jsonb_build_object(
      'ledgerReference', v_ledger_reference,
      'balanceAfter', v_balance_after
    )
  );

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderReference', v_order_reference,
    'ledgerReference', v_ledger_reference,
    'balanceAfter', v_balance_after
  );
end;
$function$
;

notify pgrst, 'reload schema';
