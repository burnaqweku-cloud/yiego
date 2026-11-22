-- Moving the business's own money from Kora into the master balance (owner, 22 Nov 2026): "any money that me personally
-- put into the business ... it shouldn't be capital ... the money I want to put into the master balance is also money
-- already from the business". It used to be recorded as "Partner put in" (capital), which lowered profit by the same
-- amount, because Kora's balance on the Finance page is read live from Kora and had already gone down.
--   finance_move_to_bank(amount, charge, note, occurred_at): bank +amount; kora_held −(amount + charge) (records only:
--   the page reads Kora live); kora_fees +charge. Capital never moves, so profit stays the same except for Kora's charge,
--   which is a real cost. Master admin with the two-step check, like every other money record.
-- Paystack needs nothing: its settlements are already booked into the bank by themselves (kind 'paystack_payout').

create or replace function phase1.finance_move_to_bank(p_amount numeric, p_charge numeric default 0, p_note text default null, p_occurred_at timestamptz default now())
returns uuid language plpgsql security definer set search_path = phase1, public as $$
declare v_actor uuid := auth.uid(); v_amt numeric := round(coalesce(p_amount, 0), 2); v_fee numeric := round(coalesce(p_charge, 0), 2);
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), ''); v_postings jsonb;
begin
  if not phase1.caller_is_admin(v_actor, true) then raise exception 'master_admin_required'; end if;
  if v_amt <= 0 or v_amt > 100000 then raise exception 'amount_required'; end if;
  if v_fee < 0 or v_fee > v_amt then raise exception 'charge_invalid'; end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'date_in_future'; end if;
  v_postings := jsonb_build_array(
    jsonb_build_object('account', 'bank', 'amount', v_amt),
    jsonb_build_object('account', 'kora_held', 'amount', -(v_amt + v_fee)));
  if v_fee > 0 then v_postings := v_postings || jsonb_build_array(jsonb_build_object('account', 'kora_fees', 'amount', v_fee)); end if;
  return phase1.finance_post('master_adjustment', 'master:move_in:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), coalesce(p_occurred_at, now()), v_amt,
    v_postings, 'manual', null, coalesce(v_note, 'Moved from Kora to the master balance'),
    jsonb_build_object('kind', 'move_in', 'from', 'kora_held', 'charge', v_fee), v_actor);
end $$;

revoke execute on function phase1.finance_move_to_bank(numeric, numeric, text, timestamptz) from public, anon;
grant execute on function phase1.finance_move_to_bank(numeric, numeric, text, timestamptz) to authenticated;
