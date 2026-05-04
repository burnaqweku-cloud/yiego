-- Add legal agreement acceptance fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepted_terms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS accepted_terms_version text,
  ADD COLUMN IF NOT EXISTS accepted_privacy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_privacy_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS accepted_privacy_version text,
  ADD COLUMN IF NOT EXISTS accepted_disclaimer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_disclaimer_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS accepted_disclaimer_version text;
