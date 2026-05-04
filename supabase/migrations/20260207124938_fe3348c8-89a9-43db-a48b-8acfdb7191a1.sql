-- Drop the old BEFORE INSERT trigger that causes the FK violation
DROP TRIGGER IF EXISTS on_agent_application_insert ON public.agent_applications;
