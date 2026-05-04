
-- Replace overly permissive page_views INSERT policy
DROP POLICY IF EXISTS "Anyone can insert page views" ON public.page_views;

CREATE POLICY "Anyone can insert page views"
ON public.page_views
AS PERMISSIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (session_id IS NOT NULL AND page_path IS NOT NULL);
