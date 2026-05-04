
-- Trigger: when orders.status changes, sync reward_claims.status via reward_claim_id
CREATE OR REPLACE FUNCTION public.sync_reward_claim_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when status actually changed and order is linked to a reward claim
  IF NEW.reward_claim_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    -- Map order status → reward_claims status
    IF NEW.status = 'Delivered' THEN
      UPDATE public.reward_claims
      SET status = 'delivered', updated_at = now()
      WHERE id = NEW.reward_claim_id;

    ELSIF NEW.status = 'Failed' THEN
      UPDATE public.reward_claims
      SET status = 'failed', updated_at = now()
      WHERE id = NEW.reward_claim_id;

    ELSIF NEW.status = 'Cancelled' THEN
      UPDATE public.reward_claims
      SET status = 'rejected', rejection_reason = 'Order cancelled', updated_at = now()
      WHERE id = NEW.reward_claim_id;

    ELSIF NEW.status = 'Processing' THEN
      UPDATE public.reward_claims
      SET status = 'approved_processing', updated_at = now()
      WHERE id = NEW.reward_claim_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_reward_claim_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_reward_claim_status();
