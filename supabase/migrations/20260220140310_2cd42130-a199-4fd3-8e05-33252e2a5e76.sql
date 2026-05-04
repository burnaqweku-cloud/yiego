-- Add reward_activated flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS reward_activated boolean NOT NULL DEFAULT false;

-- Backfill: mark activated for users who already have completed orders
UPDATE public.profiles p
SET reward_activated = true
WHERE EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.user_id = p.id
    AND o.payment_status IN ('paid', 'success', 'completed')
    AND o.status NOT IN ('Failed', 'Cancelled', 'cancelled', 'failed')
  LIMIT 1
);