-- Apply only to the active external phase1 database.
-- Books a fee-deducted MTN verification refund: the full order debt and pending fee clear,
-- Paystack pays back only the refunded amount, and the retained Paystack fee is recorded as fee income.
CREATE OR REPLACE FUNCTION phase1.finance_clear_paystack_refund(p_order_id uuid, p_refund_reference text, p_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
declare o record; v_charged numeric; v_fee numeric; v_pending numeric; v_fee_account text; v_refunded numeric; v_retained numeric;
begin
  select id, order_reference, amount, supplier_id, paid_at into o from phase1.orders where id=p_order_id;
  if o.id is null or o.paid_at < phase1.finance_start_at() then return null; end if;
  if exists (select 1 from phase1.finance_entries where kind='refund_paid' and reference=o.order_reference) then return null; end if;
  select amount into v_charged from phase1.payment_intents where order_id=o.id and status='succeeded' order by verified_at desc limit 1;
  v_charged := coalesce(v_charged, o.amount);
  v_fee := round(v_charged - o.amount, 2);
  v_pending := phase1.order_fee_pending(o.order_reference);
  v_fee_account := case when v_pending >= v_fee - 0.005 then 'fees_pending' else 'fee_income' end;
  select (metadata->>'refundAmount')::numeric into v_refunded from phase1.order_events
   where order_id=o.id and event_type='refund.completed' and metadata->>'policy'='mtn_verification_fee' order by created_at desc limit 1;
  if v_refunded is null or v_refunded <= 0 or v_refunded >= v_charged then
    return phase1.finance_post('refund_paid', o.order_reference, p_at, v_charged,
      jsonb_build_array(jsonb_build_object('account','refunds_due','amount', o.amount), jsonb_build_object('account', v_fee_account, 'amount', v_fee), jsonb_build_object('account','paystack_transit','amount', -v_charged)),
      'auto', o.supplier_id, 'Refund paid to customer by Paystack, fee included (ref '||coalesce(p_refund_reference,'?')||')', jsonb_build_object('refundReference', p_refund_reference, 'method','paystack','fee', v_fee), null);
  end if;
  v_retained := round(v_charged - v_refunded, 2);
  return phase1.finance_post('refund_paid', o.order_reference, p_at, v_refunded,
    jsonb_build_array(jsonb_build_object('account','refunds_due','amount', o.amount), jsonb_build_object('account', v_fee_account, 'amount', v_fee),
      jsonb_build_object('account','paystack_transit','amount', -v_refunded), jsonb_build_object('account','fee_income','amount', -v_retained)),
    'auto', o.supplier_id, 'MTN verification refund by Paystack minus actual Paystack fee (ref '||coalesce(p_refund_reference,'?')||')',
    jsonb_build_object('refundReference', p_refund_reference, 'method','paystack','fee', v_fee, 'policy','mtn_verification_fee', 'refunded', v_refunded, 'retainedFee', v_retained), null);
end $function$;
