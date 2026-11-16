-- Store customers never get our mail (owner, 16 Nov 2026). Applied live 16 Nov 2026.
-- People who signed up in an agent's store (profiles.home_store_id set; this includes sub-agents, whose home store is
-- their parent) were getting our follow-up reminders ("Your DataYego account is set up…") and our announcement
-- emails. Both now leave them out. (The "Welcome to DataYego" email is stopped in send-welcome-email.)
do $$
declare d text;
begin
  d := pg_get_functiondef('phase1.follow_up_due'::regproc);
  if position('p.home_store_id is null' in d) = 0 then
    d := replace(d, 'and phase1.admin_role(u.id) is null', 'and phase1.admin_role(u.id) is null and p.home_store_id is null');
    execute d;
  end if;
  d := pg_get_functiondef('phase1.announcement_email_queue'::regproc);
  if position('p.home_store_id is null' in d) = 0 then
    d := replace(d, 'and not exists (select 1 from phase1.agents a where a.user_id = p.id and a.parent_agent_id is not null)',
                    'and not exists (select 1 from phase1.agents a where a.user_id = p.id and a.parent_agent_id is not null) and p.home_store_id is null');
    execute d;
  end if;
end $$;
