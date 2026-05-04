
-- Create storage bucket for app downloads
INSERT INTO storage.buckets (id, name, public) VALUES ('app-downloads', 'app-downloads', true);

-- Allow public read access
CREATE POLICY "Public can download app files"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-downloads');

-- Only admins can upload
CREATE POLICY "Admins can upload app files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'app-downloads' AND public.is_admin());

CREATE POLICY "Admins can update app files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'app-downloads' AND public.is_admin());

CREATE POLICY "Admins can delete app files"
ON storage.objects FOR DELETE
USING (bucket_id = 'app-downloads' AND public.is_admin());
