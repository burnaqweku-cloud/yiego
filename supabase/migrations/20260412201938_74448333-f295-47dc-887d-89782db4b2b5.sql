
-- Create storage bucket for support evidence
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-evidence', 'support-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to support evidence
CREATE POLICY "Support evidence is publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'support-evidence');

-- Allow service role inserts (edge functions use service role)
CREATE POLICY "Service role can upload support evidence"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'support-evidence');
