
-- 1. Add phone_e164 column to profiles (canonical E.164 format)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_e164 text;

-- 2. Create phone normalization function
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  cleaned text;
BEGIN
  IF raw_phone IS NULL OR trim(raw_phone) = '' THEN
    RETURN NULL;
  END IF;
  -- Remove all non-digit chars
  cleaned := regexp_replace(trim(raw_phone), '[^0-9]', '', 'g');
  -- Handle Ghana formats
  IF cleaned ~ '^233[235][0-9]{8}$' THEN
    RETURN '+' || cleaned;
  ELSIF cleaned ~ '^0[235][0-9]{8}$' THEN
    RETURN '+233' || substring(cleaned from 2);
  ELSE
    RETURN NULL; -- not a valid Ghana number
  END IF;
END;
$$;

-- 3. Backfill phone_e164 from existing phone data
UPDATE public.profiles
SET phone_e164 = normalize_phone_e164(phone)
WHERE phone IS NOT NULL AND phone != '' AND phone_e164 IS NULL;

-- 4. Create trigger to auto-populate phone_e164 on insert/update
CREATE OR REPLACE FUNCTION public.auto_normalize_phone_e164()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone OR NEW.phone_e164 IS NULL THEN
    NEW.phone_e164 := normalize_phone_e164(NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_phone_e164 ON public.profiles;
CREATE TRIGGER trg_normalize_phone_e164
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_normalize_phone_e164();

-- 5. Create a UNIQUE index on phone_e164, but only where not null
-- This allows multiple NULL values (users without phones) but prevents duplicates
-- NOTE: We do NOT enable this yet — admin must resolve duplicates first
-- CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_unique ON public.profiles (phone_e164) WHERE phone_e164 IS NOT NULL;

-- 6. Add admin_notes column to referral review support  
-- (for per-referrer admin notes in referral review)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_notes text;
