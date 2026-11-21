-- Agents change the MoMo number their earnings are paid to (owner, 21 Nov 2026: Roxy's Data Store changed her SIM,
-- tried to change it, and only her WhatsApp number changed; "make it possible for agents to be able to change their
-- payment number").
--   agent_set_payout_number(number, name)  the signed-in agent (main or sub) sets a new number and name. The number must
--     be a real Ghana mobile number (233… and 9 digits are accepted); 5 changes a day at most. A withdrawal still waiting
--     moves to the new number, every change is kept in agent_payout_number_changes, and the agent's phones get a
--     notice (so a stranger who got into the account can't move the money quietly).
--   agent_update_store keeps working for older copies of the site, but a payout number it changes goes through the same
--   checks and history.

create table if not exists phase1.agent_payout_number_changes (
  id bigserial primary key,
  agent_id uuid not null references phase1.agents(id) on delete cascade,
  old_number text, new_number text not null,
  old_name text, new_name text,
  source text not null,
  changed_by uuid,
  moved_payouts int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists agent_payout_number_changes_agent_idx on phase1.agent_payout_number_changes (agent_id, created_at desc);
alter table phase1.agent_payout_number_changes enable row level security;

-- Ghana mobile number in 0XXXXXXXXX form on a known network, or null.
create or replace function phase1.payout_number_normal(p text)
returns text language plpgsql stable set search_path = phase1, public as $$
declare v text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if v ~ '^233[0-9]{9}$' then v := '0' || substr(v, 4); elsif v ~ '^[0-9]{9}$' then v := '0' || v; end if;
  if v !~ '^0[0-9]{9}$' or phase1.network_for_prefix(v) is null then return null; end if;
  return v;
end $$;

-- The one place a payout number changes (agent page, older store settings, or the admin by SQL with p_source 'admin').
create or replace function phase1.agent_payout_number_apply(p_agent uuid, p_number text, p_name text, p_source text, p_by uuid default null)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare a phase1.agents; v_num text; v_name text; v_moved int := 0;
begin
  select * into a from phase1.agents where id = p_agent for update;
  if a.id is null then raise exception 'not_an_agent'; end if;
  v_num := phase1.payout_number_normal(p_number);
  if v_num is null then raise exception 'bad_momo_number'; end if;
  v_name := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  if v_name is null or length(v_name) < 3 or length(v_name) > 80 then raise exception 'bad_momo_name'; end if;
  if v_num = coalesce(a.momo_number, '') and v_name = coalesce(a.momo_name, '') then
    return jsonb_build_object('number', v_num, 'name', v_name, 'network', phase1.network_for_prefix(v_num), 'changed', false, 'moved', 0);
  end if;
  update phase1.agents set momo_number = v_num, momo_name = v_name, updated_at = now() where id = a.id;
  update phase1.agent_payouts set momo_number = v_num, momo_name = v_name,
    note = btrim(coalesce(note, '') || ' Payout number changed by the agent to ' || v_num || ' before it was paid.')
  where agent_id = a.id and status in ('requested', 'approved');
  get diagnostics v_moved = row_count;
  insert into phase1.agent_payout_number_changes (agent_id, old_number, new_number, old_name, new_name, source, changed_by, moved_payouts)
  values (a.id, a.momo_number, v_num, a.momo_name, v_name, p_source, coalesce(p_by, auth.uid()), v_moved);
  -- Tell the agent's phones, so a change they didn't make doesn't go unnoticed.
  if a.momo_number is not null and a.momo_number <> v_num then
    begin
      perform phase1.push_enqueue('alert', 'payout_number:' || a.id || ':' || extract(epoch from now())::bigint, 'Payout number changed',
        'Your earnings will now be paid to ' || left(v_num, 3) || '****' || right(v_num, 3) || '. If you didn''t do this, contact support now.',
        '/agent/earnings', null, null, a.user_id);
    exception when others then null;
    end;
  end if;
  return jsonb_build_object('number', v_num, 'name', v_name, 'network', phase1.network_for_prefix(v_num), 'changed', true, 'moved', v_moved);
end $$;

create or replace function phase1.agent_set_payout_number(p_number text, p_name text)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare a phase1.agents;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into a from phase1.agents where user_id = auth.uid() order by created_at limit 1;
  if a.id is null then raise exception 'not_an_agent'; end if;
  if (select count(*) from phase1.agent_payout_number_changes where agent_id = a.id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_changes';
  end if;
  return phase1.agent_payout_number_apply(a.id, p_number, p_name, 'agent');
end $$;

-- Older copies of the store settings page still send the payout number with the store details.
create or replace function phase1.agent_update_store(p_store_name text, p_tagline text, p_momo_number text, p_momo_name text, p_whatsapp text default null)
returns void language plpgsql security definer set search_path = phase1, public as $$
declare a phase1.agents; v_num text; v_name text;
begin
  select * into a from phase1.agents where user_id = auth.uid() order by created_at limit 1;
  if a.id is null then raise exception 'not_an_agent'; end if;
  update phase1.agents set store_name = coalesce(nullif(trim(p_store_name), ''), store_name), tagline = nullif(trim(p_tagline), ''),
    whatsapp = coalesce(nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), ''), whatsapp), updated_at = now()
  where user_id = auth.uid();
  v_num := coalesce(nullif(regexp_replace(coalesce(p_momo_number, ''), '\D', '', 'g'), ''), a.momo_number);
  v_name := coalesce(nullif(trim(coalesce(p_momo_name, '')), ''), a.momo_name);
  if v_num is distinct from a.momo_number or v_name is distinct from a.momo_name then
    perform phase1.agent_payout_number_apply(a.id, v_num, v_name, 'agent');
  end if;
end $$;

create or replace function phase1.agent_update_store(p_store_name text, p_tagline text, p_momo_number text, p_momo_name text)
returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.agent_update_store(p_store_name, p_tagline, p_momo_number, p_momo_name, null::text);
end $$;

revoke execute on function phase1.agent_payout_number_apply(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function phase1.agent_set_payout_number(text, text) from public, anon;
grant execute on function phase1.agent_set_payout_number(text, text) to authenticated;
grant execute on function phase1.payout_number_normal(text) to authenticated;

-- Roxy's Data Store's change today (done by hand at 17:12 Lagos on the owner's word), kept in the history.
insert into phase1.agent_payout_number_changes (agent_id, old_number, new_number, old_name, new_name, source, moved_payouts, created_at)
select 'e02feced-67c4-488b-bc81-4e84e7fa1ff9', '0534961986', '0204033601', 'Joana Maame Esi Amissah Aggrey', 'Joana Maame Esi Amissah Aggrey', 'admin', 1, '2026-11-21 16:12:00+00'
where exists (select 1 from phase1.agents where id = 'e02feced-67c4-488b-bc81-4e84e7fa1ff9')
  and not exists (select 1 from phase1.agent_payout_number_changes where agent_id = 'e02feced-67c4-488b-bc81-4e84e7fa1ff9');
