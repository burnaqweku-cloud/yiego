CREATE OR REPLACE FUNCTION phase1.finance_record_topup(p_actor uuid, p_supplier_code text, p_amount numeric, p_occurred_at timestamp with time zone, p_paid_from text DEFAULT 'outside_funding'::text, p_fee numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
declare s record; v_fee numeric; v_ref text;
begin
  perform phase1.finance_assert_master(p_actor);
  select * into s from phase1.suppliers where code=p_supplier_code;
  if not found then raise exception 'unknown_supplier'; end if;
  if p_paid_from not in ('bank','outside_funding') then raise exception 'paid_from must be bank or outside_funding'; end if;
  v_fee := coalesce(p_fee, round(p_amount * coalesce((s.metadata->>'topup_fee_rate')::numeric, 0), 2));
  v_ref := coalesce(p_reference, 'topup:'||p_supplier_code||':'||to_char(p_occurred_at,'YYYYMMDDHH24MISS')||':'||p_amount);
  return phase1.finance_post('supplier_topup', v_ref, p_occurred_at, p_amount,
    jsonb_build_array(jsonb_build_object('account','float_'||p_supplier_code,'amount', p_amount),
                      jsonb_build_object('account','supplier_topup_fees','amount', v_fee),
                      jsonb_build_object('account',p_paid_from,'amount', -(p_amount + v_fee))),
    'manual', s.id, p_note, jsonb_build_object('fee', v_fee, 'paid_from', p_paid_from), p_actor);
end $function$

