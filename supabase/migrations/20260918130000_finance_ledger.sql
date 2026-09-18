-- ═══════════════════════════════════════════════════════════════════════
-- Finance ledger
--
-- Every movement of money is one entry with two or more postings that sum
-- to zero (debits positive, credits negative). Screens are views over this;
-- nothing is edited in place — mistakes are reversed with a new entry.
--
-- Automatic entries come from triggers on orders and payment_intents.
-- Manual entries (supplier top-ups, Paystack payouts, expenses, corrections)
-- come through the finance_record_* functions, which record who did it.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Accounts ───────────────────────────────────────────────────────────
create table if not exists phase1.finance_accounts (
  code text primary key,
  name text not null,
  kind text not null check (kind in ('asset','liability','income','expense','funding')),
  supplier_id uuid references phase1.suppliers(id),
  sort_order int not null default 100
);

-- ── Entries + postings ─────────────────────────────────────────────────
create table if not exists phase1.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                 -- order_paid, order_delivered, order_refunded, wallet_deposit, paystack_payout, supplier_topup, expense, adjustment, reversal
  reference text,                     -- order reference, payout id, etc. Unique per kind.
  occurred_at timestamptz not null,
  amount numeric(12,2) not null,      -- headline amount for lists
  source text not null default 'auto' check (source in ('auto','manual','seed')),
  supplier_id uuid references phase1.suppliers(id),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,                    -- admin user for manual entries
  reverses uuid references phase1.finance_entries(id),
  created_at timestamptz not null default now()
);
create unique index if not exists finance_entries_kind_ref_idx on phase1.finance_entries (kind, reference) where reference is not null;
create index if not exists finance_entries_occurred_idx on phase1.finance_entries (occurred_at desc);

create table if not exists phase1.finance_postings (
  id bigserial primary key,
  entry_id uuid not null references phase1.finance_entries(id) on delete cascade,
  account text not null references phase1.finance_accounts(code),
  amount numeric(12,2) not null       -- debit +, credit −
);
create index if not exists finance_postings_account_idx on phase1.finance_postings (account);

-- ── Seed accounts ──────────────────────────────────────────────────────
insert into phase1.suppliers (code, name, status, display_order, public_name, is_customer_visible, metadata)
select 'instantdatagh', 'InstantDataGH', 'disabled', 20, 'InstantDataGH', false, '{"notes":"Added ahead of integration; float tracked in finance ledger"}'::jsonb
where not exists (select 1 from phase1.suppliers where code='instantdatagh');

insert into phase1.finance_accounts (code, name, kind, supplier_id, sort_order) values
  ('paystack_transit',   'Paystack (awaiting payout)', 'asset', null, 10),
  ('bank',               'Bank',                        'asset', null, 11),
  ('float_databundleshub','Supplier float · DataBundlesHub','asset',(select id from phase1.suppliers where code='databundleshub'), 20),
  ('float_datamartgh',   'Supplier float · DataMartGH', 'asset',(select id from phase1.suppliers where code='datamartgh'), 21),
  ('float_instantdatagh','Supplier float · InstantDataGH','asset',(select id from phase1.suppliers where code='instantdatagh'), 22),
  ('customer_wallets',   'Customer wallet balances',    'liability', null, 30),
  ('owed_deliveries',    'Paid, not yet delivered',     'liability', null, 31),
  ('refunds_due',        'Refunds owed to customers',   'liability', null, 32),
  ('revenue',            'Bundle sales',                'income', null, 40),
  ('fee_income',         'Checkout fee collected (4%)', 'income', null, 41),
  ('cost_of_bundles',    'Bundle cost (supplier)',      'expense', null, 50),
  ('paystack_fees',      'Paystack fees',               'expense', null, 51),
  ('supplier_topup_fees','Supplier top-up charges',     'expense', null, 52),
  ('other_expenses',     'Other expenses',              'expense', null, 53),
  ('outside_funding',    'Money put in from outside',   'funding', null, 60)
on conflict (code) do nothing;

-- Supplier top-up charge: DBH 2%, DataMartGH 3%, InstantDataGH 2%.
update phase1.suppliers set metadata = metadata || jsonb_build_object('topup_fee_rate', case code when 'datamartgh' then 0.03 else 0.02 end)
where code in ('databundleshub','datamartgh','instantdatagh') and not (metadata ? 'topup_fee_rate');

-- ── Core: post one balanced entry, idempotent on (kind, reference) ─────
create or replace function phase1.finance_post(
  p_kind text, p_reference text, p_occurred_at timestamptz, p_amount numeric,
  p_postings jsonb,            -- [{"account":"bank","amount":12.34}, ...]
  p_source text default 'auto', p_supplier_id uuid default null, p_note text default null,
  p_metadata jsonb default '{}'::jsonb, p_created_by uuid default null, p_reverses uuid default null
) returns uuid language plpgsql security definer set search_path = phase1, public as $$
declare v_id uuid; v_sum numeric; v_p jsonb;
begin
  if p_reference is not null and exists (select 1 from phase1.finance_entries where kind=p_kind and reference=p_reference) then
    return (select id from phase1.finance_entries where kind=p_kind and reference=p_reference);
  end if;
  select coalesce(sum((x->>'amount')::numeric),0) into v_sum from jsonb_array_elements(p_postings) x;
  if abs(v_sum) > 0.005 then raise exception 'finance_post: postings do not balance (sum %)', v_sum; end if;
  insert into phase1.finance_entries (kind, reference, occurred_at, amount, source, supplier_id, note, metadata, created_by, reverses)
  values (p_kind, p_reference, p_occurred_at, p_amount, p_source, p_supplier_id, p_note, coalesce(p_metadata,'{}'::jsonb), p_created_by, p_reverses)
  returning id into v_id;
  for v_p in select * from jsonb_array_elements(p_postings) loop
    if abs((v_p->>'amount')::numeric) >= 0.005 then
      insert into phase1.finance_postings (entry_id, account, amount) values (v_id, v_p->>'account', round((v_p->>'amount')::numeric, 2));
    end if;
  end loop;
  return v_id;
end $$;

-- ── Automatic: orders ──────────────────────────────────────────────────
-- paid   → money arrives (Paystack transit, or customer wallet goes down); we now owe a delivery
-- delivered → the owed delivery becomes revenue; bundle cost leaves the supplier float
-- refunded  → the owed delivery becomes a refund owed
create or replace function phase1.finance_post_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = phase1, public as $$
declare o record; v_fee numeric; v_via text; v_float text; v_delivered_at timestamptz; v_refunded_at timestamptz;
begin
  select o1.*, s.code as supplier_code into o from phase1.orders o1 left join phase1.suppliers s on s.id=o1.supplier_id where o1.id=p_order_id;
  if not found or o.paid_at is null then return; end if;

  -- How was it paid? A succeeded Paystack intent means card/momo; otherwise wallet.
  if exists (select 1 from phase1.payment_intents pi where pi.order_id=o.id and pi.provider='paystack' and pi.status='succeeded') then v_via := 'paystack'; else v_via := 'wallet'; end if;
  v_fee := case when v_via='paystack' then round(o.amount * 0.04, 2) else 0 end;

  if v_via='paystack' then
    perform phase1.finance_post('order_paid', o.order_reference, o.paid_at, o.amount + v_fee,
      jsonb_build_array(jsonb_build_object('account','paystack_transit','amount', o.amount + v_fee),
                        jsonb_build_object('account','owed_deliveries','amount', -o.amount),
                        jsonb_build_object('account','fee_income','amount', -v_fee)),
      'auto', o.supplier_id, null, jsonb_build_object('via','paystack','base',o.amount,'fee',v_fee));
  else
    perform phase1.finance_post('order_paid', o.order_reference, o.paid_at, o.amount,
      jsonb_build_array(jsonb_build_object('account','customer_wallets','amount', o.amount),
                        jsonb_build_object('account','owed_deliveries','amount', -o.amount)),
      'auto', o.supplier_id, null, jsonb_build_object('via','wallet','base',o.amount));
  end if;

  if o.status = 'delivered' then
    v_float := case when o.supplier_code is not null then 'float_'||o.supplier_code else null end;
    select max(created_at) into v_delivered_at from phase1.order_events where order_id=o.id and to_status='delivered';
    perform phase1.finance_post('order_delivered', o.order_reference, coalesce(v_delivered_at, o.updated_at), o.amount,
      jsonb_build_array(jsonb_build_object('account','owed_deliveries','amount', o.amount),
                        jsonb_build_object('account','revenue','amount', -o.amount))
      || case when v_float is not null and coalesce(o.cost_amount,0) > 0
           then jsonb_build_array(jsonb_build_object('account','cost_of_bundles','amount', o.cost_amount),
                                  jsonb_build_object('account',v_float,'amount', -o.cost_amount))
           else '[]'::jsonb end,
      'auto', o.supplier_id, case when v_float is null or coalesce(o.cost_amount,0)=0 then 'No supplier cost recorded on this order' end,
      jsonb_build_object('cost', o.cost_amount, 'supplier', o.supplier_code));
  elsif o.status = 'refunded' then
    select max(created_at) into v_refunded_at from phase1.order_events where order_id=o.id and to_status='refunded';
    perform phase1.finance_post('order_refunded', o.order_reference, coalesce(v_refunded_at, o.updated_at), o.amount,
      jsonb_build_array(jsonb_build_object('account','owed_deliveries','amount', o.amount),
                        jsonb_build_object('account','refunds_due','amount', -o.amount)),
      'auto', o.supplier_id, null, jsonb_build_object('failure_reason', o.failure_reason));
  end if;
end $$;

create or replace function phase1.finance_orders_trigger() returns trigger language plpgsql as $$
begin
  if new.paid_at is not null and (tg_op='INSERT' or old.paid_at is distinct from new.paid_at or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) then
    perform phase1.finance_post_order(new.id);
  end if;
  return new;
end $$;
drop trigger if exists finance_orders_trg on phase1.orders;
create trigger finance_orders_trg after insert or update on phase1.orders for each row execute function phase1.finance_orders_trigger();

-- ── Automatic: wallet deposits ─────────────────────────────────────────
create or replace function phase1.finance_post_deposit(p_intent_id uuid) returns void
language plpgsql security definer set search_path = phase1, public as $$
declare pi record;
begin
  select * into pi from phase1.payment_intents where id=p_intent_id and purpose='wallet_deposit' and status='succeeded';
  if not found then return; end if;
  perform phase1.finance_post('wallet_deposit', pi.provider_reference, coalesce(pi.verified_at, pi.updated_at), pi.amount,
    jsonb_build_array(jsonb_build_object('account','paystack_transit','amount', pi.amount),
                      jsonb_build_object('account','customer_wallets','amount', -pi.amount)),
    'auto', null, null, jsonb_build_object('user_id', pi.user_id));
end $$;

create or replace function phase1.finance_deposits_trigger() returns trigger language plpgsql as $$
begin
  if new.purpose='wallet_deposit' and new.status='succeeded' then perform phase1.finance_post_deposit(new.id); end if;
  return new;
end $$;
drop trigger if exists finance_deposits_trg on phase1.payment_intents;
create trigger finance_deposits_trg after insert or update on phase1.payment_intents for each row execute function phase1.finance_deposits_trigger();

-- ── Manual recording (admin only) ──────────────────────────────────────
create or replace function phase1.finance_assert_admin(p_actor uuid) returns void language plpgsql as $$
begin
  if p_actor is null or not exists (select 1 from phase1.admin_users where user_id=p_actor and is_active) then
    raise exception 'admin_required';
  end if;
end $$;

-- Supplier top-up. p_amount is the float the supplier credited; the charge
-- (DBH 2%, DataMartGH 3%, InstantDataGH 2%) is added on top as an expense.
create or replace function phase1.finance_record_topup(
  p_actor uuid, p_supplier_code text, p_amount numeric, p_occurred_at timestamptz,
  p_paid_from text default 'outside_funding', p_fee numeric default null, p_note text default null, p_reference text default null
) returns uuid language plpgsql security definer set search_path = phase1, public as $$
declare s record; v_fee numeric; v_ref text;
begin
  perform phase1.finance_assert_admin(p_actor);
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
end $$;

-- Paystack payout. p_net is what landed in the bank. If the gross settled
-- amount is known, the difference is booked as Paystack fees.
create or replace function phase1.finance_record_payout(
  p_actor uuid, p_net numeric, p_occurred_at timestamptz, p_reference text default null, p_gross numeric default null, p_note text default null, p_source text default 'manual'
) returns uuid language plpgsql security definer set search_path = phase1, public as $$
declare v_gross numeric; v_fees numeric;
begin
  if p_source = 'manual' then perform phase1.finance_assert_admin(p_actor); end if;
  v_gross := coalesce(p_gross, p_net); v_fees := round(v_gross - p_net, 2);
  return phase1.finance_post('paystack_payout', coalesce(p_reference, 'payout:'||to_char(p_occurred_at,'YYYY-MM-DD')||':'||p_net), p_occurred_at, p_net,
    jsonb_build_array(jsonb_build_object('account','bank','amount', p_net),
                      jsonb_build_object('account','paystack_fees','amount', v_fees),
                      jsonb_build_object('account','paystack_transit','amount', -v_gross)),
    p_source, null, p_note, jsonb_build_object('gross', v_gross, 'fees', v_fees), p_actor);
end $$;

-- Any other expense paid from the bank or from outside.
create or replace function phase1.finance_record_expense(
  p_actor uuid, p_amount numeric, p_occurred_at timestamptz, p_note text, p_paid_from text default 'bank'
) returns uuid language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.finance_assert_admin(p_actor);
  if p_paid_from not in ('bank','outside_funding') then raise exception 'paid_from must be bank or outside_funding'; end if;
  return phase1.finance_post('expense', null, p_occurred_at, p_amount,
    jsonb_build_array(jsonb_build_object('account','other_expenses','amount', p_amount),
                      jsonb_build_object('account',p_paid_from,'amount', -p_amount)),
    'manual', null, p_note, '{}'::jsonb, p_actor);
end $$;

-- Reverse an entry: same postings, opposite signs, linked.
create or replace function phase1.finance_reverse(p_actor uuid, p_entry_id uuid, p_note text) returns uuid
language plpgsql security definer set search_path = phase1, public as $$
declare e record; v_postings jsonb;
begin
  perform phase1.finance_assert_admin(p_actor);
  select * into e from phase1.finance_entries where id=p_entry_id;
  if not found then raise exception 'entry_not_found'; end if;
  if exists (select 1 from phase1.finance_entries where reverses=p_entry_id) then raise exception 'already_reversed'; end if;
  select jsonb_agg(jsonb_build_object('account',account,'amount',-amount)) into v_postings from phase1.finance_postings where entry_id=p_entry_id;
  return phase1.finance_post('reversal', null, now(), e.amount, v_postings, 'manual', e.supplier_id, p_note, jsonb_build_object('of_kind', e.kind, 'of_reference', e.reference), p_actor, p_entry_id);
end $$;

-- ── Balances ───────────────────────────────────────────────────────────
-- Shown the way people read them: assets/expenses positive when we have
-- or spent; liabilities/income/funding positive when owed or earned.
create or replace view phase1.finance_balances as
select a.code, a.name, a.kind, a.supplier_id, a.sort_order,
  round(case when a.kind in ('asset','expense') then coalesce(sum(p.amount),0) else -coalesce(sum(p.amount),0) end, 2) as balance
from phase1.finance_accounts a left join phase1.finance_postings p on p.account=a.code
group by a.code, a.name, a.kind, a.supplier_id, a.sort_order;

create or replace function phase1.finance_overview(p_from timestamptz default null, p_to timestamptz default null) returns jsonb
language sql stable security definer set search_path = phase1, public as $$
with bal as (select * from phase1.finance_balances),
period as (
  select p.account, sum(p.amount) as amt
  from phase1.finance_postings p join phase1.finance_entries e on e.id=p.entry_id
  where (p_from is null or e.occurred_at >= p_from) and (p_to is null or e.occurred_at < p_to)
  group by p.account
),
pl as (
  select
    -coalesce((select amt from period where account='revenue'),0) as revenue,
    -coalesce((select amt from period where account='fee_income'),0) as fee_income,
     coalesce((select amt from period where account='cost_of_bundles'),0) as cost_of_bundles,
     coalesce((select amt from period where account='paystack_fees'),0) as paystack_fees,
     coalesce((select amt from period where account='supplier_topup_fees'),0) as topup_fees,
     coalesce((select amt from period where account='other_expenses'),0) as other_expenses
)
select jsonb_build_object(
  'cash', jsonb_build_object(
    'bank', (select balance from bal where code='bank'),
    'paystack_transit', (select balance from bal where code='paystack_transit'),
    'supplier_float', (select jsonb_object_agg(replace(code,'float_',''), balance) from bal where code like 'float_%')),
  'owed', jsonb_build_object(
    'customer_wallets', (select balance from bal where code='customer_wallets'),
    'undelivered', (select balance from bal where code='owed_deliveries'),
    'undelivered_count', (select count(*) from phase1.orders where paid_at is not null and status not in ('delivered','refunded','cancelled')),
    'refunds_due', (select balance from bal where code='refunds_due')),
  'funding', jsonb_build_object('outside', (select balance from bal where code='outside_funding')),
  'period', (select jsonb_build_object(
    'revenue', revenue, 'fee_income', fee_income, 'cost_of_bundles', cost_of_bundles,
    'paystack_fees', paystack_fees, 'topup_fees', topup_fees, 'other_expenses', other_expenses,
    'gross_profit', revenue - cost_of_bundles,
    'net', revenue + fee_income - cost_of_bundles - paystack_fees - topup_fees - other_expenses,
    'net_excluding_fee_passthrough', revenue - cost_of_bundles - paystack_fees - topup_fees - other_expenses) from pl),
  'all_time', jsonb_build_object(
    'cash_in', (select coalesce(sum(amount),0) from phase1.finance_entries where kind in ('order_paid','wallet_deposit') and (metadata->>'via') is distinct from 'wallet'),
    'payouts_received', (select coalesce(sum(amount),0) from phase1.finance_entries where kind='paystack_payout'),
    'supplier_topups', (select coalesce(sum(amount),0) from phase1.finance_entries where kind='supplier_topup'),
    'delivered_revenue', (select balance from bal where code='revenue'))
);
$$;

-- Admins read the ledger through PostgREST; only the functions write.
alter table phase1.finance_entries enable row level security;
alter table phase1.finance_postings enable row level security;
alter table phase1.finance_accounts enable row level security;
drop policy if exists finance_entries_admin_read on phase1.finance_entries;
create policy finance_entries_admin_read on phase1.finance_entries for select to authenticated using (exists (select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active));
drop policy if exists finance_postings_admin_read on phase1.finance_postings;
create policy finance_postings_admin_read on phase1.finance_postings for select to authenticated using (exists (select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active));
drop policy if exists finance_accounts_admin_read on phase1.finance_accounts;
create policy finance_accounts_admin_read on phase1.finance_accounts for select to authenticated using (exists (select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active));
grant select on phase1.finance_entries, phase1.finance_postings, phase1.finance_accounts, phase1.finance_balances to authenticated;
grant execute on function phase1.finance_overview(timestamptz, timestamptz), phase1.finance_record_topup(uuid,text,numeric,timestamptz,text,numeric,text,text), phase1.finance_record_payout(uuid,numeric,timestamptz,text,numeric,text,text), phase1.finance_record_expense(uuid,numeric,timestamptz,text,text), phase1.finance_reverse(uuid,uuid,text) to authenticated;

-- ── Backfill from existing data ────────────────────────────────────────
do $$ declare r record; begin
  for r in select id from phase1.orders where paid_at is not null order by paid_at loop perform phase1.finance_post_order(r.id); end loop;
  for r in select id from phase1.payment_intents where purpose='wallet_deposit' and status='succeeded' order by created_at loop perform phase1.finance_post_deposit(r.id); end loop;
end $$;

do $$ begin
-- ── Seed: what has happened so far, as reported on 18 Sep 2026 ─────────
-- Supplier top-ups (float credited; charges added on top; paid from outside the business).
perform phase1.finance_post('supplier_topup', 'seed:topup:databundleshub', '2026-09-12T08:00:00Z', 2300,
  '[{"account":"float_databundleshub","amount":2300},{"account":"supplier_topup_fees","amount":46},{"account":"outside_funding","amount":-2346}]'::jsonb,
  'seed', (select id from phase1.suppliers where code='databundleshub'), 'Opening top-ups to 18 Sep as reported; date approximate', '{"fee":46,"paid_from":"outside_funding"}'::jsonb);
perform phase1.finance_post('supplier_topup', 'seed:topup:datamartgh', '2026-09-12T08:00:00Z', 200,
  '[{"account":"float_datamartgh","amount":200},{"account":"supplier_topup_fees","amount":6},{"account":"outside_funding","amount":-206}]'::jsonb,
  'seed', (select id from phase1.suppliers where code='datamartgh'), 'Opening top-ups to 18 Sep as reported; date approximate', '{"fee":6,"paid_from":"outside_funding"}'::jsonb);
perform phase1.finance_post('supplier_topup', 'seed:topup:instantdatagh', '2026-09-12T08:00:00Z', 100,
  '[{"account":"float_instantdatagh","amount":100},{"account":"supplier_topup_fees","amount":2},{"account":"outside_funding","amount":-102}]'::jsonb,
  'seed', (select id from phase1.suppliers where code='instantdatagh'), 'Opening top-up as reported; supplier not yet integrated', '{"fee":2,"paid_from":"outside_funding"}'::jsonb);

-- Paystack payouts received (net amounts; gross/fees to be filled by the settlements sync).
perform phase1.finance_record_payout(null, v.net, v.d, 'seed:payout:'||to_char(v.d,'YYYY-MM-DD'), null, 'Reported payout; Paystack fees not yet split out', 'seed')
from (values
  (4.07::numeric,   '2026-09-12T12:00:00Z'::timestamptz),
  (245.36, '2026-09-13T12:00:00Z'),
  (383.02, '2026-09-14T12:00:00Z'),
  (327.02, '2026-09-15T12:00:00Z'),
  (644.83, '2026-09-16T12:00:00Z'),
  (509.96, '2026-09-17T12:00:00Z'),
  (422.28, '2026-09-18T12:00:00Z')
) as v(net, d);
end $$;
