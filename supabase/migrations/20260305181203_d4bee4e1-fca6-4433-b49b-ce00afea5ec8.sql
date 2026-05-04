
-- Step 1: Add column as nullable integer (no serial yet)
ALTER TABLE public.admin_support_tickets 
ADD COLUMN ticket_number integer;

-- Step 2: Create a sequence
CREATE SEQUENCE public.admin_support_tickets_ticket_number_seq;

-- Step 3: Backfill existing rows
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.admin_support_tickets
)
UPDATE public.admin_support_tickets t
SET ticket_number = n.rn::integer
FROM numbered n
WHERE t.id = n.id;

-- Step 4: Set sequence to max
SELECT setval('public.admin_support_tickets_ticket_number_seq', 
  GREATEST(COALESCE((SELECT MAX(ticket_number) FROM public.admin_support_tickets), 0), 1));

-- Step 5: Set default and NOT NULL
ALTER TABLE public.admin_support_tickets 
ALTER COLUMN ticket_number SET DEFAULT nextval('public.admin_support_tickets_ticket_number_seq'),
ALTER COLUMN ticket_number SET NOT NULL;

-- Step 6: Link sequence to column
ALTER SEQUENCE public.admin_support_tickets_ticket_number_seq 
OWNED BY public.admin_support_tickets.ticket_number;

-- Step 7: Unique constraint
ALTER TABLE public.admin_support_tickets 
ADD CONSTRAINT admin_support_tickets_ticket_number_unique UNIQUE (ticket_number);
