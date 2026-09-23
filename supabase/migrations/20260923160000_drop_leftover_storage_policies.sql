-- Leftover rules from the pre-reset app. The agent-logos and user-avatars
-- buckets no longer exist and the current app stores no files.
drop policy if exists "Anyone can view agent logos" on storage.objects;
drop policy if exists "User avatars are publicly accessible" on storage.objects;
drop policy if exists "Users can delete own avatar" on storage.objects;
drop policy if exists "Users can update own avatar" on storage.objects;
drop policy if exists "Users can upload own avatar" on storage.objects;
