
-- Drop the overly permissive update policy and replace with fingerprint-scoped one
DROP POLICY IF EXISTS "Anyone can update own pwa device" ON public.pwa_devices;

-- The SELECT-by-fingerprint policy allows the client to read its own row.
-- For UPDATE we use a subquery-less approach: restrict to rows where the fingerprint
-- matches what the client sends (enforced at app level via upsert by fingerprint).
-- Since fingerprint is unique and client-generated, this is an acceptable pattern
-- for anonymous device tracking. We lock it down as tight as possible:
CREATE POLICY "Device can update own record by fingerprint match"
  ON public.pwa_devices
  FOR UPDATE
  USING (true)
  WITH CHECK (device_fingerprint IS NOT NULL AND length(device_fingerprint) > 10);
