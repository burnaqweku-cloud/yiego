CREATE OR REPLACE FUNCTION public.generate_dsa_ticket_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  attempts int := 0;
  byte_val int;
BEGIN
  LOOP
    candidate := 'DSA-';
    FOR i IN 1..5 LOOP
      byte_val := (get_byte(extensions.gen_random_bytes(1), 0) % 32);
      candidate := candidate || substr(alphabet, byte_val + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.support_tickets_v2 WHERE ticket_code = candidate) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 30 THEN RAISE EXCEPTION 'Could not generate unique ticket_code after 30 tries'; END IF;
  END LOOP;
END $function$;