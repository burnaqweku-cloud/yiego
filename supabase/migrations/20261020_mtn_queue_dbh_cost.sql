-- Admin → MTN verification: estimate of what DBH will charge before anything is sent.
-- admin_mtn_queue() now carries dbh_cost (DBH's price list for that bundle); admin_mtn_dbh_wallet() gives the last
-- wallet reading. A trigger keeps DBH's price list in step with the price on every successful purchase reply,
-- so the list can no longer drift from what they actually charge. Applied live on 20 Oct 2026.

CREATE OR REPLACE FUNCTION phase1.admin_mtn_dbh_wallet()
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'phase1', 'public'
AS $function$
  select case when phase1.caller_is_admin() then (
    select jsonb_build_object('balance', s.balance, 'checked_at', s.last_balance_checked_at) from phase1.suppliers s where s.code = 'databundleshub'
  ) else null end;
$function$;
grant execute on function phase1.admin_mtn_dbh_wallet() to authenticated;

CREATE OR REPLACE FUNCTION phase1.dbh_price_from_purchase() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phase1','public' AS $function$
declare v_price numeric; v_gb numeric; v_net text;
begin
  if new.action <> 'purchase' or new.call_status <> 'success' then return new; end if;
  if new.supplier_id is distinct from (select id from phase1.suppliers where code = 'databundleshub') then return new; end if;
  v_price := (new.response_payload->'data'->>'price')::numeric;
  v_gb := (new.response_payload->'data'->>'capacity')::numeric;
  v_net := case new.response_payload->'data'->>'network' when 'YELLO' then 'MTN' else new.response_payload->'data'->>'network' end;
  if v_price is null or v_gb is null or v_net is null then return new; end if;
  update phase1.supplier_product_mappings m set supplier_price = v_price, updated_at = now()
  from phase1.data_products p
  where m.product_id = p.id and m.supplier_id = new.supplier_id and m.is_active and p.capacity_gb = v_gb and m.supplier_network_code = v_net
    and m.supplier_price is distinct from v_price;
  return new;
exception when others then return new;
end $function$;
create or replace trigger supplier_api_logs_dbh_price after insert on phase1.supplier_api_logs for each row execute function phase1.dbh_price_from_purchase();

-- admin_mtn_queue(): same as 20261020_mtn_verification_admin.sql plus
--   'dbh_cost', (select m.supplier_price from phase1.supplier_product_mappings m join phase1.suppliers s on s.id = m.supplier_id
--                where s.code = 'databundleshub' and m.product_id = o.product_id and m.is_active limit 1),
CREATE OR REPLACE FUNCTION phase1.admin_mtn_queue()
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'phase1', 'public'
AS $function$
  select case when phase1.caller_is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_reference', o.order_reference, 'phone', o.recipient_phone, 'bundle', regexp_replace(coalesce(p.name,''), '^.*?—\s*', ''),
      'amount', o.amount, 'store_name', a.store_name, 'paid_at', coalesce(o.paid_at, o.created_at), 'held_since', o.admin_resolution_updated_at,
      'days_waiting', extract(day from now() - coalesce(o.admin_resolution_updated_at, o.created_at))::int,
      'check_status', b.status, 'check_message', b.message, 'checked_at', b.checked_at,
      'supplier_purchase_id', o.supplier_purchase_id,
      'dbh_cost', (select m.supplier_price from phase1.supplier_product_mappings m join phase1.suppliers s on s.id = m.supplier_id where s.code = 'databundleshub' and m.product_id = o.product_id and m.is_active limit 1),
      'send', (select jsonb_build_object('outcome', s.outcome, 'sent_at', s.sent_at, 'detail', s.detail) from phase1.mtn_verification_sends s where s.order_id = o.id)
    ) order by coalesce(o.admin_resolution_updated_at, o.created_at))
    from phase1.orders o
    left join phase1.data_products p on p.id = o.product_id
    left join phase1.agents a on a.id = o.agent_id
    left join phase1.beneficiary_checks b on b.msisdn = (case when regexp_replace(o.recipient_phone,'\D','','g') like '233%' then '0'||substr(regexp_replace(o.recipient_phone,'\D','','g'),4) else regexp_replace(o.recipient_phone,'\D','','g') end)
    where o.admin_resolution_status = 'awaiting_verification' and o.status::text = 'processing' and o.payment_status::text = 'succeeded'
  ), '[]'::jsonb) else null end;
$function$;
