-- Paystack settlements (payouts to the bank), pulled by sync-paystack-settlements.
-- Each successful settlement becomes one paystack_payout ledger entry with the
-- gross/net/fee split. A seeded payout for the same day and net amount is
-- reversed and replaced, so the reported figures give way to Paystack's own.
create table if not exists phase1.paystack_settlements (
  id bigint primary key,                 -- Paystack settlement id
  status text not null,
  gross numeric(12,2) not null,
  net numeric(12,2) not null,
  fees numeric(12,2) not null,
  settlement_date timestamptz,
  raw jsonb not null default '{}'::jsonb,
  entry_id uuid references phase1.finance_entries(id),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table phase1.paystack_settlements enable row level security;
drop policy if exists paystack_settlements_admin_read on phase1.paystack_settlements;
create policy paystack_settlements_admin_read on phase1.paystack_settlements for select to authenticated using (exists (select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active));
grant select on phase1.paystack_settlements to authenticated;

create or replace function phase1.finance_apply_paystack_settlement(
  p_id bigint, p_status text, p_gross numeric, p_net numeric, p_fees numeric, p_settlement_date timestamptz, p_raw jsonb
) returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v_entry uuid; v_seed record; v_action text := 'unchanged';
begin
  insert into phase1.paystack_settlements (id, status, gross, net, fees, settlement_date, raw)
  values (p_id, p_status, p_gross, p_net, p_fees, p_settlement_date, p_raw)
  on conflict (id) do update set status=excluded.status, gross=excluded.gross, net=excluded.net, fees=excluded.fees, settlement_date=excluded.settlement_date, raw=excluded.raw, updated_at=now();

  if p_status <> 'success' then return jsonb_build_object('id', p_id, 'action', 'not_settled', 'status', p_status); end if;
  if exists (select 1 from phase1.paystack_settlements where id=p_id and entry_id is not null) then
    return jsonb_build_object('id', p_id, 'action', 'already_booked');
  end if;

  -- A reported payout for the same day and amount was seeded by hand: retire it.
  select e.* into v_seed from phase1.finance_entries e
   where e.kind='paystack_payout' and e.source='seed'
     and abs(e.amount - p_net) < 0.01
     and e.occurred_at::date = coalesce(p_settlement_date, now())::date
     and not exists (select 1 from phase1.finance_entries r where r.reverses=e.id)
   limit 1;
  if found then
    perform phase1.finance_post('reversal', null, now(), v_seed.amount,
      (select jsonb_agg(jsonb_build_object('account',account,'amount',-amount)) from phase1.finance_postings where entry_id=v_seed.id),
      'auto', null, 'Replaced by Paystack settlement '||p_id, jsonb_build_object('of_kind','paystack_payout','of_reference',v_seed.reference), null, v_seed.id);
    v_action := 'replaced_seed';
  else
    v_action := 'booked';
  end if;

  v_entry := phase1.finance_record_payout(null, p_net, coalesce(p_settlement_date, now()), 'paystack:'||p_id, p_gross, 'Paystack settlement '||p_id, 'auto');
  update phase1.paystack_settlements set entry_id=v_entry, updated_at=now() where id=p_id;
  return jsonb_build_object('id', p_id, 'action', v_action, 'net', p_net, 'fees', p_fees);
end $$;

select cron.schedule('sync-paystack-settlements', '15 */4 * * *',
  $$SELECT net.http_post('https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/sync-paystack-settlements','{}'::jsonb,'{}'::jsonb,'{"Content-Type": "application/json"}'::jsonb, 30000)$$)
where not exists (select 1 from cron.job where jobname='sync-paystack-settlements');
