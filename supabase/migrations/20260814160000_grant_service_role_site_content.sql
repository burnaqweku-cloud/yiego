-- public_contact_settings and legal_documents were created out-of-band through
-- the Supabase dashboard, so service_role never received table privileges on
-- them. The admin Contact and Legal editors run as service_role inside the
-- admin-site-content-action edge function, so every save failed with
-- "permission denied for table ..." (Postgres 42501) — surfaced in the UI only
-- as the generic "Edge Function returned a non-2xx status code".
--
-- RLS is bypassed by service_role, but table-level GRANTs are not, so these are
-- required for the writes those editors perform.
grant select, insert, update on phase1.public_contact_settings to service_role;
grant select, insert, update on phase1.legal_documents to service_role;
notify pgrst, 'reload schema';
