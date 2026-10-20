-- Applied live 20 Oct 2026. The ledger only costs a bundle once, on delivery, so a second purchase of the same order
-- (19 Oct: 123 orders bought twice from DBH after the MTN approvals) never reached the books and the float sat
-- GH₵1,095 above what DBH actually held. Nightly reconciliation books that drift as bundle cost, visibly.
create or replace function phase1.finance_reconcile_supplier_floats(p_max_age interval default interval '24 hours', p_min_diff numeric default 1.00) returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
declare s record; v_book numeric; v_diff numeric; v_id uuid; out jsonb := '[]'::jsonb;
begin
  for s in select sp.id, sp.code, sp.name, sp.balance, sp.last_balance_checked_at from phase1.suppliers sp
           where sp.balance is not null and sp.last_balance_checked_at >= now() - p_max_age and exists (select 1 from phase1.finance_accounts a where a.code = 'float_'||sp.code) loop
    select balance into v_book from phase1.finance_balances where code = 'float_'||s.code;
    v_diff := round(s.balance - coalesce(v_book,0), 2);
    if abs(v_diff) < p_min_diff then continue; end if;
    v_id := phase1.finance_post('float_correction', 'float_reconcile:'||s.code||':'||to_char(now(),'YYYYMMDDHH24MI'), now(), abs(v_diff),
      jsonb_build_array(jsonb_build_object('account','float_'||s.code,'amount', v_diff), jsonb_build_object('account','cost_of_bundles','amount', -v_diff)),
      'auto', s.id, format('%s shows %s, books said %s (checked %s): difference booked as bundle cost', s.name, s.balance, v_book, to_char(s.last_balance_checked_at at time zone 'Africa/Accra','DD Mon HH24:MI')),
      jsonb_build_object('books_before', v_book, 'live', s.balance, 'checked_at', s.last_balance_checked_at));
    out := out || jsonb_build_object('supplier', s.code, 'books', v_book, 'live', s.balance, 'adjusted', v_diff, 'entry', v_id);
  end loop;
  return out;
end $$;
revoke all on function phase1.finance_reconcile_supplier_floats(interval, numeric) from public, anon, authenticated;
-- cron: reconcile-supplier-floats at 01:15 UTC daily → select phase1.finance_reconcile_supplier_floats();
-- First run on 20 Oct booked DBH −1,094.80 and Emma −132.90 as bundle cost.
