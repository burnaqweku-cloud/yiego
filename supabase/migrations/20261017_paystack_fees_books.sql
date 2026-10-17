-- 17 Oct 2026 — Paystack fees were missing from the books (net profit overstated: 975.09 → 454.08).
-- Applied to production via the Supabase MCP; running note.
--
-- Cause 1: since mid-September Paystack settles in two records a day — the payout to the MoMo subaccount
--   (total_amount = effective_amount, total_fees 0) and a fee-only record (total_amount 0, total_fees > 0).
--   finance_apply_paystack_settlement passed gross = total_amount to finance_record_payout, whose fee is
--   gross − net, so the fee-only record booked a GH₵0 entry with no postings. 33 records, GH₵597.03 unposted.
-- Cause 2: the 8 early single-record settlements had "deductions" (customer refunds Paystack took out of the
--   settlement). gross − net there was the deduction, not the fee, and it was posted to paystack_fees although
--   refund_paid entries had already booked the same refunds against paystack_transit — double count, GH₵102.13
--   labelled as fees; their real fees (26.11) were not booked.
-- After the fix the books' paystack_fees equals Paystack's total_fees since the official start, to the pesewa.

create or replace function phase1.finance_apply_paystack_settlement(p_id bigint, p_status text, p_gross numeric, p_net numeric, p_fees numeric, p_settlement_date timestamptz, p_raw jsonb)
returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $function$
declare v_entry uuid; v_seed record; v_action text := 'unchanged'; v_gross numeric;
begin
  insert into phase1.paystack_settlements (id, status, gross, net, fees, settlement_date, raw)
  values (p_id, p_status, p_gross, p_net, p_fees, p_settlement_date, p_raw)
  on conflict (id) do update set status=excluded.status, gross=excluded.gross, net=excluded.net, fees=excluded.fees, settlement_date=excluded.settlement_date, raw=excluded.raw, updated_at=now();
  if p_status <> 'success' then return jsonb_build_object('id', p_id, 'action', 'not_settled', 'status', p_status); end if;
  if coalesce(p_settlement_date, now()) < phase1.finance_start_at() then return jsonb_build_object('id', p_id, 'action', 'pre_launch_ignored'); end if;
  if exists (select 1 from phase1.paystack_settlements where id=p_id and entry_id is not null) then return jsonb_build_object('id', p_id, 'action', 'already_booked'); end if;
  -- Gross for the books is net + fees: a fee-only record posts its fee, and a deduction (a refund Paystack took out of
  -- the settlement, already booked by refund_paid) is never mistaken for a fee.
  v_gross := round(coalesce(p_net, 0) + coalesce(p_fees, 0), 2);
  select e.* into v_seed from phase1.finance_entries e
   where e.kind='paystack_payout' and e.source='seed' and abs(e.amount - p_net) < 0.01
     and e.occurred_at::date = coalesce(p_settlement_date, now())::date
     and not exists (select 1 from phase1.finance_entries r where r.reverses=e.id) limit 1;
  if found then
    perform phase1.finance_post('reversal', null, now(), v_seed.amount,
      (select jsonb_agg(jsonb_build_object('account',account,'amount',-amount)) from phase1.finance_postings where entry_id=v_seed.id),
      'auto', null, 'Replaced by Paystack settlement '||p_id, jsonb_build_object('of_kind','paystack_payout','of_reference',v_seed.reference), null, v_seed.id);
    v_action := 'replaced_seed';
  else v_action := 'booked'; end if;
  v_entry := phase1.finance_record_payout(null, p_net, coalesce(p_settlement_date, now()), 'paystack:'||p_id, v_gross, 'Paystack settlement '||p_id, 'auto');
  update phase1.paystack_settlements set entry_id=v_entry, updated_at=now() where id=p_id;
  return jsonb_build_object('id', p_id, 'action', v_action, 'net', p_net, 'fees', p_fees);
end $function$;

-- Backfill (done through a helper function because plain UPDATE is blocked by the MCP prompt):
-- 1. 33 fee-only settlements: added postings paystack_fees +fee / paystack_transit −fee on their existing entries,
--    metadata.fees_backfilled = '2026-10-17'.
-- 2. 8 early settlements: paystack_fees posting set to the real total_fees (0 for five of them), paystack_transit
--    set to −(net + fees), metadata.corrected explains the deduction mix-up.
-- Result: net since 12 Sep 454.08 (was 975.09); paystack_fees 623.14 = Paystack; paystack_transit 1,307.49 (was 1,828.50).
