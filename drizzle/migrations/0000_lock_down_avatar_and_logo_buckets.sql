-- user-avatars: remove anonymous public read, allow signed-in users only
DROP POLICY IF EXISTS "User avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Signed-in users can view avatars" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'user-avatars');

-- agent-logos: remove anonymous public read, allow signed-in users only
DROP POLICY IF EXISTS "Anyone can view agent logos" ON storage.objects;
CREATE POLICY "Signed-in users can view agent logos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'agent-logos');