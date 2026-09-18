-- Supplier top-up detection.
-- Every supplier balance we observe (from a purchase receipt or a balance
-- poll) is recorded. When the balance rises between two readings, that is
-- a top-up: a candidate is created for an admin to confirm (or dismiss),
-- and confirming books it through finance_record_topup.

create table if not exists phase1.supplier_balance_readings (
  id bigserial primary key,
  supplier_id uuid not null references phase1.suppliers(id),
  balance numeric(12,2) not null,
  observed_at timestamptz not null default now(),
  source text not null,                     -- purchase | poll | manual
  raw jsonb
);
create index if not exists supplier_balance_readings_idx on phase1.supplier_balance_readings (supplier_id, observed_at desc);

create table if not exists phase1.supplier_topup_candidates (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references phase1.suppliers(id),
  amount numeric(12,2) not null,            -- the observed jump in float
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  detected_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed')),
  entry_id uuid references phase1.finance_entries(id),
  resolved_by uuid,
  resolved_at timestamptz,
  note text
);
alter table phase1.supplier_balance_readings enable row level security;
alter table phase1.supplier_topup_candidates enable row level security;
drop policy if exists sbr_admin_read on phase1.supplier_balance_readings;
create policy sbr_admin_read on phase1.supplier_balance_readings for select to authenticated using (exists (select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active));
drop policy if exists stc_admin_read on phase1.supplier_topup_candidates;
create policy stc_admin_read on phase1.supplier_topup_candidates for select to authenticated using (exists (select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active));
grant select on phase1.supplier_balance_readings, phase1.supplier_topup_candidates to authenticated;

-- Record a reading; raise a candidate if the float went up by more than a rounding error.
create or replace function phase1.finance_note_supplier_balance(
  p_supplier_code text, p_balance numeric, p_observed_at timestamptz default now(), p_source text default 'poll', p_raw jsonb default null, p_detect boolean default true
) returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare s record; prev record; v_jump numeric; v_cand uuid;
begin
  select * into s from phase1.suppliers where code=p_supplier_code;
  if not found then return jsonb_build_object('error','unknown_supplier'); end if;
  select * into prev from phase1.supplier_balance_readings where supplier_id=s.id and observed_at <= p_observed_at order by observed_at desc limit 1;
  insert into phase1.supplier_balance_readings (supplier_id, balance, observed_at, source, raw) values (s.id, p_balance, p_observed_at, p_source, p_raw);
  update phase1.suppliers set balance=p_balance, last_balance_checked_at=p_observed_at where id=s.id and (last_balance_checked_at is null or last_balance_checked_at <= p_observed_at);
  if p_detect and prev.balance is not null then
    v_jump := round(p_balance - prev.balance, 2);
    if v_jump >= 1 then
      -- Merge into an open candidate from the last hour rather than fragmenting one top-up
      -- that arrived between several readings.
      select id into v_cand from phase1.supplier_topup_candidates where supplier_id=s.id and status='pending' and detected_at > p_observed_at - interval '1 hour' order by detected_at desc limit 1;
      if v_cand is not null then
        update phase1.supplier_topup_candidates set amount=amount+v_jump, balance_after=p_balance, detected_at=p_observed_at where id=v_cand;
      else
        insert into phase1.supplier_topup_candidates (supplier_id, amount, balance_before, balance_after, detected_at) values (s.id, v_jump, prev.balance, p_balance, p_observed_at) returning id into v_cand;
      end if;
      return jsonb_build_object('supplier', p_supplier_code, 'balance', p_balance, 'topup_detected', v_jump, 'candidate', v_cand);
    end if;
  end if;
  return jsonb_build_object('supplier', p_supplier_code, 'balance', p_balance);
end $$;

-- Confirm a detected top-up (amount may be corrected) → books the ledger entry.
create or replace function phase1.finance_confirm_topup(p_actor uuid, p_candidate uuid, p_amount numeric default null, p_paid_from text default 'outside_funding', p_note text default null)
returns uuid language plpgsql security definer set search_path = phase1, public as $$
declare c record; s record; v_entry uuid;
begin
  perform phase1.finance_assert_admin(p_actor);
  select * into c from phase1.supplier_topup_candidates where id=p_candidate and status='pending';
  if not found then raise exception 'candidate_not_pending'; end if;
  select * into s from phase1.suppliers where id=c.supplier_id;
  v_entry := phase1.finance_record_topup(p_actor, s.code, coalesce(p_amount, c.amount), c.detected_at, p_paid_from, null, coalesce(p_note, 'Detected from balance change'), 'topup:'||s.code||':candidate:'||c.id);
  update phase1.supplier_topup_candidates set status='confirmed', entry_id=v_entry, resolved_by=p_actor, resolved_at=now(), note=p_note where id=c.id;
  return v_entry;
end $$;

create or replace function phase1.finance_dismiss_topup(p_actor uuid, p_candidate uuid, p_note text default null) returns void
language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.finance_assert_admin(p_actor);
  update phase1.supplier_topup_candidates set status='dismissed', resolved_by=p_actor, resolved_at=now(), note=p_note where id=p_candidate and status='pending';
end $$;
grant execute on function phase1.finance_confirm_topup(uuid,uuid,numeric,text,text), phase1.finance_dismiss_topup(uuid,uuid,text) to authenticated;

-- DBH reports remainingBalance on every purchase receipt: turn each into a reading.
create or replace function phase1.supplier_api_logs_balance_trigger() returns trigger language plpgsql security definer set search_path = phase1, public as $$
declare v_code text; v_bal numeric;
begin
  if new.action='purchase' and new.call_status='success' then
    select code into v_code from phase1.suppliers where id=new.supplier_id;
    v_bal := (new.response_payload->'data'->>'remainingBalance')::numeric;
    if v_code is not null and v_bal is not null then
      perform phase1.finance_note_supplier_balance(v_code, v_bal, new.created_at, 'purchase', null, true);
    end if;
  end if;
  return new;
exception when others then return new;  -- never let bookkeeping break a purchase log
end $$;
drop trigger if exists supplier_api_logs_balance_trg on phase1.supplier_api_logs;
create trigger supplier_api_logs_balance_trg after insert on phase1.supplier_api_logs for each row execute function phase1.supplier_api_logs_balance_trigger();

-- Baseline: replay historical DBH receipts as readings without raising candidates
-- (past top-ups are already in the ledger as the reported opening figures).
do $$ declare r record; begin
  for r in select s.code, (l.response_payload->'data'->>'remainingBalance')::numeric as bal, l.created_at
           from phase1.supplier_api_logs l join phase1.suppliers s on s.id=l.supplier_id
           where l.action='purchase' and l.call_status='success' and (l.response_payload->'data'->>'remainingBalance') is not null
           order by l.created_at
  loop perform phase1.finance_note_supplier_balance(r.code, r.bal, r.created_at, 'purchase', null, false); end loop;
end $$;

select cron.schedule('sync-supplier-balances', '*/10 * * * *',
  $$SELECT net.http_post('https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/sync-supplier-balances','{}'::jsonb,'{}'::jsonb,'{"Content-Type": "application/json"}'::jsonb, 30000)$$)
where not exists (select 1 from cron.job where jobname='sync-supplier-balances');
