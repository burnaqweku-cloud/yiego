-- Trusted Edge Functions need explicit write privileges in the custom schema.
grant select, insert, update on phase1.orders to service_role;
grant select, insert, update on phase1.wallets to service_role;
grant select, insert on phase1.wallet_ledger_entries to service_role;
grant select, insert, update on phase1.payment_intents to service_role;
grant select, insert, update on phase1.payment_events to service_role;
grant select, insert on phase1.order_events to service_role;
grant select, insert on phase1.supplier_api_logs to service_role;
grant select, insert, update on phase1.webhook_events to service_role;
grant select, insert, update on phase1.number_verifications to service_role;
grant select, insert, update on phase1.supplier_health_checks to service_role;
grant select, update on phase1.networks to service_role;
grant select, update on phase1.data_products to service_role;
grant select, insert on phase1.audit_logs to service_role;
