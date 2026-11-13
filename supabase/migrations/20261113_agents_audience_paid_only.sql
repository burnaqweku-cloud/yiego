-- Announcements for "agents" reach paid agents only.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- The owner's rule: an agent is someone who has paid for a plan. People who applied, were approved and never paid are
-- not agents, and sub-agents only know their parent's store. The email (agent-announce-email) already worked that way;
-- the in-app bell showed agents announcements to every approved applicant, and the phone notification could reach
-- an active sub-agent. Both now follow the same rule.
do $$
declare d text; a text; b text;
begin
  -- In-app: a main agent who has paid for a plan (active or run out). Unpaid applicants now count as customers.
  d := pg_get_functiondef('phase1.my_announcements()'::regprocedure);
  a := $a$exists (select 1 from phase1.agents where user_id=auth.uid() and parent_agent_id is null) as is_agent$a$;
  b := $a$exists (select 1 from phase1.agents where user_id=auth.uid() and parent_agent_id is null and paid_until is not null) as is_agent$a$;
  if position(b in d) = 0 then
    if position(a in d) = 0 then raise exception 'my_announcements is not as expected'; end if;
    execute replace(d, a, b);
  end if;

  -- Phone notification: active main agents, never sub-agents.
  d := pg_get_functiondef('phase1.push_recipients(bigint)'::regprocedure);
  a := $a$(j.audience = 'agents' and d.user_id in (select a.user_id from phase1.agents a where a.status = 'active'))$a$;
  b := $a$(j.audience = 'agents' and d.user_id in (select a.user_id from phase1.agents a where a.status = 'active' and a.parent_agent_id is null))$a$;
  if position(b in d) = 0 then
    if position(a in d) = 0 then raise exception 'push_recipients is not as expected'; end if;
    execute replace(d, a, b);
  end if;
end $$;
