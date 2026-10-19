-- Active external database only; no existing orders receive purchase backfill.
BEGIN;
CREATE TABLE phase1.order_sms_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz, test_passed_at timestamptz
);
GRANT ALL ON phase1.order_sms_control TO service_role;
REVOKE ALL ON phase1.order_sms_control FROM anon,authenticated;
ALTER TABLE phase1.order_sms_control ENABLE ROW LEVEL SECURITY;
INSERT INTO phase1.order_sms_control(id) VALUES(true);
CREATE TABLE phase1.order_sms_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES phase1.orders(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('purchase','delivered','verified')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','skipped','uncertain','failed')),
 claim_token uuid,claimed_at timestamptz,sent_at timestamptz,attempts integer NOT NULL DEFAULT 0,
 provider_job_id text,reason text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(order_id,kind)
);
GRANT ALL ON phase1.order_sms_outbox TO service_role;
REVOKE ALL ON phase1.order_sms_outbox FROM anon,authenticated;
ALTER TABLE phase1.order_sms_outbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX order_sms_pending_idx ON phase1.order_sms_outbox(created_at) WHERE status='pending';
CREATE FUNCTION phase1.enqueue_order_sms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM phase1.order_sms_control WHERE enabled) THEN RETURN NEW; END IF;
 IF NEW.payment_status::text='succeeded' THEN
  IF TG_OP='INSERT' THEN
   INSERT INTO phase1.order_sms_outbox(order_id,kind) VALUES(NEW.id,'purchase') ON CONFLICT DO NOTHING;
  ELSIF OLD.payment_status::text IS DISTINCT FROM 'succeeded' THEN
   INSERT INTO phase1.order_sms_outbox(order_id,kind) VALUES(NEW.id,'purchase') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.status::text='delivered' THEN
   IF TG_OP='INSERT' THEN
    INSERT INTO phase1.order_sms_outbox(order_id,kind) VALUES(NEW.id,'delivered') ON CONFLICT DO NOTHING;
   ELSIF OLD.status::text IS DISTINCT FROM 'delivered' THEN
    INSERT INTO phase1.order_sms_outbox(order_id,kind) VALUES(NEW.id,'delivered') ON CONFLICT DO NOTHING;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION phase1.enqueue_order_sms() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER order_sms_outbox_trg AFTER INSERT OR UPDATE OF status,payment_status ON phase1.orders FOR EACH ROW EXECUTE FUNCTION phase1.enqueue_order_sms();
CREATE FUNCTION phase1.seed_verified_order_sms() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM phase1.order_sms_control WHERE enabled) THEN RETURN 0; END IF;
 INSERT INTO phase1.order_sms_outbox(order_id,kind)
 SELECT DISTINCT o.id,'verified' FROM phase1.orders o JOIN phase1.networks n ON n.id=o.network_id
 WHERE lower(n.code)='mtn' AND o.payment_status::text='succeeded'
 AND (o.status::text='delivered' OR (o.status::text='processing' AND o.admin_resolution_status IS DISTINCT FROM 'awaiting_verification' AND (o.supplier_order_reference IS NOT NULL OR o.supplier_purchase_id IS NOT NULL)))
 AND EXISTS(SELECT 1 FROM phase1.order_events e WHERE e.order_id=o.id AND e.event_type IN ('notification.verified_email_sent','supplier.number_approved','supplier.verification_cleared'))
 AND NOT EXISTS(SELECT 1 FROM phase1.order_events e WHERE e.order_id=o.id AND e.event_type='notification.verified_sms_sent')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT; RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION phase1.seed_verified_order_sms() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION phase1.seed_verified_order_sms() TO service_role;
CREATE FUNCTION phase1.claim_order_sms(batch_size integer DEFAULT 20) RETURNS SETOF phase1.order_sms_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM phase1.order_sms_control WHERE enabled) THEN RETURN; END IF;
 UPDATE phase1.order_sms_outbox SET status='uncertain',reason='worker_interrupted' WHERE status='sending' AND claimed_at<now()-interval '5 minutes';
 RETURN QUERY WITH picked AS (
  SELECT q.id FROM phase1.order_sms_outbox q WHERE q.status='pending'
  ORDER BY CASE q.kind WHEN 'verified' THEN 0 WHEN 'purchase' THEN 1 ELSE 2 END,q.created_at
  FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(batch_size,20))
 ) UPDATE phase1.order_sms_outbox q SET status='sending',claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1 FROM picked p WHERE q.id=p.id RETURNING q.*;
END $$;
REVOKE ALL ON FUNCTION phase1.claim_order_sms(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION phase1.claim_order_sms(integer) TO service_role;
CREATE FUNCTION phase1.activate_order_sms() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE phase1.order_sms_control SET enabled=true,activated_at=coalesce(activated_at,now()) WHERE id=true AND test_passed_at IS NOT NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION phase1.activate_order_sms() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION phase1.activate_order_sms() TO service_role;
COMMIT;
