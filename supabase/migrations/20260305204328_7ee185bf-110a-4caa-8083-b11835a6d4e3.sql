
-- Add verification_status and customer_email to admin_support_tickets
ALTER TABLE public.admin_support_tickets
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS customer_email text;

-- Add check constraint for verification_status
ALTER TABLE public.admin_support_tickets
  ADD CONSTRAINT admin_support_tickets_verification_status_check
  CHECK (verification_status = ANY (ARRAY['unverified'::text, 'confirmed'::text, 'not_found'::text]));

-- Allow admins to insert wallet_transactions for any user (needed for ticket wallet credit)
CREATE POLICY "Admins can insert wallet transactions"
  ON public.wallet_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());
