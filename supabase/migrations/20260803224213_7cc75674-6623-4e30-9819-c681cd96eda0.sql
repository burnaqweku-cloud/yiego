-- Remove public exposure of support evidence
DROP POLICY IF EXISTS "Support evidence is publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload support evidence" ON storage.objects;

CREATE POLICY "Service role can read support evidence"
ON storage.objects FOR SELECT TO service_role
USING (bucket_id = 'support-evidence');

CREATE POLICY "Service role can upload support evidence"
ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'support-evidence');

-- Remove blanket public read on app-downloads
DROP POLICY IF EXISTS "Public can download app files" ON storage.objects;

CREATE POLICY "Public can download published releases"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'app-downloads' AND (storage.foldername(name))[1] = 'releases');
