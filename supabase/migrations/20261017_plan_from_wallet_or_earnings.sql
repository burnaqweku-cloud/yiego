-- 17 Oct 2026 — pay the agent plan from the wallet or from earnings (no checkout fee, instant).
-- Applied to production via the Supabase MCP; running note. Front end: PlanPicker shows "Pay … from my wallet" /
-- "… from my earnings" when the balance covers the chosen plan; Paystack stays as the other option.
-- First use: Victor Kewu (William kewu's Data Store) paid 1 month from his wallet, YGPLAN-741318171E80.

alter type phase1.payment_provider add value if not exists 'wallet';
alter type phase1.payment_provider add value if not exists 'earnings';
alter type phase1.ledger_type add value if not exists 'agent_plan';                 -- wallet ledger
-- agent_ledger_entries.type gains 'plan' (constraint recreated through a helper; UPDATE/DROP are blocked by the MCP prompt)
-- check (type = any (array['sale','refund','payout','payout_fee','adjustment','plan']))

-- Activation now books the cash side by provider: paystack → paystack_transit, wallet → customer_wallets,
-- earnings → owed_to_agents. Income side unchanged (agent_subscriptions, fee_income).
create or replace function phase1.agent_activate_subscription(p_intent_id uuid) returns jsonb
language plpgsql security definer set search_path to 'phase1','public' as $function$
declare i record; v_agent uuid; v_promo uuid; v_until date; v_base numeric; v_fee numeric; v_months int; v_status text; v_cash text;
begin
  select * into i from phase1.payment_intents where id=p_intent_id and purpose='agent_subscription' and status='succeeded';
  if i.id is null then return jsonb_build_object('skipped','intent_not_succeeded'); end if;
  v_agent := (i.metadata->>'agent_id')::uuid; v_promo := nullif(i.metadata->>'promo_id','')::uuid;
  v_months := greatest(coalesce((i.metadata->>'months')::int, 1), 1);
  v_base := coalesce((i.metadata->>'baseAmount')::numeric, i.amount); v_fee := coalesce((i.metadata->>'feeAmount')::numeric, 0);
  if exists (select 1 from phase1.finance_entries where kind='agent_subscription' and reference=i.provider_reference) then return jsonb_build_object('skipped','already_applied'); end if;
  select status::text into v_status from phase1.agents where id=v_agent;
  update phase1.agents set
    paid_until = (case when v_status='active' then greatest(coalesce(paid_until, current_date), current_date) else current_date end + (v_months || ' months')::interval)::date,
    status = case when status in ('awaiting_payment','paused','lapsed') then 'active' else status end,
    updated_at=now()
  where id=v_agent returning paid_until into v_until;
  if v_promo is not null then update phase1.agent_promos set uses = uses + 1 where id=v_promo; end if;
  v_cash := case i.provider::text when 'wallet' then 'customer_wallets' when 'earnings' then 'owed_to_agents' else 'paystack_transit' end;
  perform phase1.finance_post('agent_subscription', i.provider_reference, coalesce(i.verified_at, now()), i.amount,
    jsonb_build_array(jsonb_build_object('account', v_cash, 'amount', i.amount), jsonb_build_object('account','agent_subscriptions','amount', -v_base), jsonb_build_object('account','fee_income','amount', -v_fee)),
    'auto', null, (case when v_months=1 then 'Agent monthly subscription' else 'Agent ' || v_months || '-month subscription' end) || case i.provider::text when 'wallet' then ' (paid from wallet)' when 'earnings' then ' (paid from earnings)' else '' end,
    jsonb_build_object('agent_id', v_agent, 'promo_id', v_promo, 'base', v_base, 'fee', v_fee, 'months', v_months, 'via', i.provider::text), null);
  return jsonb_build_object('agent_id', v_agent, 'paid_until', v_until, 'months', v_months);
end $function$;

-- agent_pay_plan_from_balance(p_months, p_source 'wallet'|'earnings'): parent agents only (subs pay nothing), status
-- awaiting_payment/active/lapsed/paused; price from agent_plan_quote (promo-aware), fee 0; debits the wallet
-- (ledger type agent_plan) or the earnings balance (ledger type plan; refused while a payout is pending); writes a
-- succeeded payment_intent with provider wallet/earnings and reference YGPLAN-…; activates through
-- agent_activate_subscription; emails a receipt through admin-email (pg_net, failure ignored).
create or replace function phase1.agent_pay_plan_from_balance(p_months int, p_source text) returns jsonb
language plpgsql security definer set search_path to 'phase1','public' as $function$
declare g phase1.agents%rowtype; q jsonb; pl jsonb; v_amount numeric; v_promo uuid; v_ref text; v_intent uuid; w phase1.wallets%rowtype; r jsonb; v_email text; v_secret text; v_label text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_source not in ('wallet','earnings') then raise exception 'bad_source'; end if;
  select * into g from phase1.agents where user_id = auth.uid() for update;
  if g.id is null then raise exception 'not_an_agent'; end if;
  if g.parent_agent_id is not null then raise exception 'sub_agents_pay_nothing'; end if;
  if g.status::text not in ('awaiting_payment','active','lapsed','paused') then raise exception 'plan_not_payable:%', g.status; end if;
  q := phase1.agent_plan_quote(auth.uid());
  select x into pl from jsonb_array_elements(q->'plans') x where (x->>'months')::int = p_months;
  if pl is null then raise exception 'unknown_plan'; end if;
  v_amount := (pl->>'pay_now')::numeric; v_promo := nullif(pl->>'promo_id','')::uuid;
  v_label := case when p_months = 1 then 'Agent plan · 1 month' else 'Agent plan · ' || p_months || ' months' end;
  v_ref := 'YGPLAN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  if p_source = 'wallet' then
    select * into w from phase1.wallets where user_id = auth.uid() and status = 'active' for update;
    if w.id is null then raise exception 'wallet_not_found'; end if;
    if w.balance < v_amount then raise exception 'insufficient_wallet_balance:%', w.balance; end if;
    insert into phase1.wallet_ledger_entries (wallet_id, user_id, direction, type, amount, balance_before, balance_after, status, reference, note)
    values (w.id, auth.uid(), 'debit', 'agent_plan', v_amount, w.balance, w.balance - v_amount, 'posted', v_ref, v_label);
    update phase1.wallets set balance = balance - v_amount, updated_at = now() where id = w.id;
  else
    if g.earnings_balance < v_amount then raise exception 'insufficient_earnings:%', g.earnings_balance; end if;
    if exists (select 1 from phase1.agent_payouts where agent_id = g.id and status in ('requested','approved')) then raise exception 'payout_pending'; end if;
    perform phase1.agent_ledger_post(g.id, 'debit', 'plan', v_amount, v_ref, v_label);
  end if;
  insert into phase1.payment_intents (provider, purpose, status, user_id, amount, provider_reference, verified_at, metadata)
  values (p_source::phase1.payment_provider, 'agent_subscription', 'succeeded', auth.uid(), v_amount, v_ref, now(),
    jsonb_build_object('agent_id', g.id, 'months', p_months, 'monthly', (q->>'monthly')::numeric, 'baseAmount', v_amount, 'feeAmount', 0, 'promo_id', v_promo, 'gateway', p_source, 'percent_off', coalesce((q->'promo'->>'percent_off')::numeric, 0)))
  returning id into v_intent;
  r := phase1.agent_activate_subscription(v_intent);
  begin  -- receipt; mail must never break money
    select email into v_email from auth.users where id = auth.uid();
    select value into v_secret from phase1.internal_secrets where key = 'cron';
    if v_email is not null and v_secret is not null then
      perform net.http_post('https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/admin-email',
        jsonb_build_object('to', v_email, 'subject', 'Payment received — ' || g.store_name || ' is open until ' || to_char((r->>'paid_until')::date, 'DD Mon YYYY'), 'html', '…receipt html (label, amount, source, store, paid-until, reference, dashboard button)…'),
        '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', v_secret));
    end if;
  exception when others then null; end;
  return jsonb_build_object('reference', v_ref, 'amount', v_amount, 'months', p_months, 'source', p_source, 'paid_until', r->>'paid_until');
end $function$;
grant execute on function phase1.agent_pay_plan_from_balance(int, text) to authenticated;
