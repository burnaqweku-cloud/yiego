-- Add username column to profiles table
ALTER TABLE public.profiles ADD COLUMN username text;

-- Add unique constraint
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);

-- Add check constraint for format (min 3 chars, only letters/numbers/underscore)
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format 
  CHECK (username ~ '^[a-zA-Z0-9_]{3,}$');

-- Create index for fast lookups
CREATE INDEX idx_profiles_username ON public.profiles (username);

-- Create a function to check username availability (accessible without auth)
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE username = p_username
  );
$$;
