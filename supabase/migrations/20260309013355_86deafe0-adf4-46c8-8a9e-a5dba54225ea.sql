
-- Fix 1: Drop and recreate the agents UPDATE policy with proper WITH CHECK clause
-- The existing policy is missing WITH CHECK which causes the RLS violation on update

DROP POLICY IF EXISTS "Agents can update own store" ON public.agents;

CREATE POLICY "Agents can update own store"
  ON public.agents
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Fix 2: Drop and recreate the storage UPDATE policy for agent-logos
-- The existing policy compares auth.uid() to the folder name (agent.id, not user_id)
-- Must look up the agent record to verify ownership

DROP POLICY IF EXISTS "Users can update own agent logos" ON storage.objects;

CREATE POLICY "Agents can update own logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'agent-logos'
    AND auth.uid() IN (
      SELECT agents.user_id FROM public.agents
      WHERE agents.id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'agent-logos'
    AND auth.uid() IN (
      SELECT agents.user_id FROM public.agents
      WHERE agents.id::text = (storage.foldername(name))[1]
    )
  );

-- Fix 3: Tighten the agents SELECT policy to authenticated role only (was public/anon)
DROP POLICY IF EXISTS "Agents can view own record" ON public.agents;

CREATE POLICY "Agents can view own record"
  ON public.agents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
