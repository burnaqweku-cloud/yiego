// Deployed 2026-09-11. Automatic refund for supplier out-of-stock failures.
// Nudged by the orders_auto_refund_out_of_stock trigger; self-validating
// (every condition re-checked from the database). Wallet-paid orders are
// credited back instantly via phase1.refund_order_to_wallet; Paystack-paid
// orders get a refund created on the original transaction. See the deployed
// function for the authoritative source.
