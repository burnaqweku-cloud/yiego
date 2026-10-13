-- 2026-10-12 — Flutterwave as a second payment gateway beside Paystack (Paystack stays default).
-- Applied via execute_sql:
alter type phase1.payment_provider add value if not exists 'flutterwave';
alter table phase1.orders add column if not exists payment_provider text;   -- 'paystack' | 'flutterwave', set when a checkout starts / settles
insert into phase1.site_settings(key, value) values ('payment_gateway', '{"provider":"paystack"}') on conflict (key) do nothing;
-- phase1.master_set_payment_gateway(p_provider text): master only; writes site_settings 'payment_gateway'.
--
-- Edge functions: new flutterwave-webhook, payment-gateway (admin status); changed create-guest-data-payment,
-- create-wallet-deposit, agent-subscribe, order-payment-action (pay_paystack), reconcile-guest-order,
-- verify-wallet-deposit. paystack-webhook deliberately untouched.
-- Shared: _shared/flutterwave.ts, _shared/gateway.ts (the switch + guards), _shared/paymentSettlement.ts.
-- Secrets: FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_PUBLIC_KEY, FLUTTERWAVE_WEBHOOK_HASH.
-- Guards: TEST key (FLWSECK_TEST…) => Flutterwave only for admin accounts, and test payments settle nothing.
-- Follow-ups before relying on Flutterwave live: refund-order (deployed only, not in repo) is Paystack-only;
-- sync-paystack-settlements / Finance are Paystack-only; the 4% checkout fee is still the Paystack rate.

-- 2026-10-13 — Kora (Korapay) as a third gateway, same guards. Applied via execute_sql:
alter type phase1.payment_provider add value if not exists 'kora';
-- master_set_payment_gateway now accepts 'kora'. New edge function kora-webhook; _shared/kora.ts; gateway.ts
-- generalised (gatewayConfigured / gatewayIsTestKey / verifyWithGateway). Secret: KORA_SECRET_KEY (sk_test_… / sk_live_…).
-- Kora signs webhooks with the secret key (x-korapay-signature = HMAC-SHA256 of the data object), so no hash secret.
-- The webhook URL is passed per charge as notification_url, so no dashboard setup is required.
