-- Auto-flag existing phone_e164 duplicates in security_events
INSERT INTO public.security_events (event_type, user_id, meta)
SELECT
  'duplicate_phone_detected',
  p.id,
  jsonb_build_object(
    'phone_e164', p.phone_e164,
    'duplicate_count', dups.cnt,
    'auto_flagged', true
  )
FROM public.profiles p
JOIN (
  SELECT phone_e164, count(*) as cnt
  FROM public.profiles
  WHERE phone_e164 IS NOT NULL
  GROUP BY phone_e164
  HAVING count(*) > 1
) dups ON dups.phone_e164 = p.phone_e164;

-- Add a comment for future: unique index should be added after admin resolves duplicates
COMMENT ON COLUMN public.profiles.phone_e164 IS 'Normalized E.164 Ghana phone. Unique index pending duplicate cleanup via Admin > Phone Cleanup.';