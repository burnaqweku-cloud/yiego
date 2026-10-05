-- INCIDENT 5 Oct 12:49 → 6 Oct 00:15 UTC. The domain_purchase / network_fee triggers on payment_events compared
-- payment_intents.purpose to enum values that had never been added to phase1.payment_purpose, so EVERY
-- payment_events insert (Paystack webhook charge.success) failed for ~11.5 h. Orders were only confirmed when the
-- customer came back to the success/track page (reconcile-guest-order). 11 paid orders were never processed until
-- reconciled by hand on 6 Oct 00:20 (4 of them hit the DBH concurrency lock → failed_needs_review → admin Retry).
-- Fix (applied via MCP, outside a transaction as ALTER TYPE requires):
alter type phase1.payment_purpose add value if not exists 'domain_purchase';
alter type phase1.payment_purpose add value if not exists 'network_fee';
-- Lesson: any trigger on payment_events must be tested with an actual insert in a transaction before going live.
