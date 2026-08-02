# YieGo Phase 1 Implementation Plan

## Confirmed Decisions

These decisions are now part of the Phase 1 direction.

- Phase 1 will use a new clean schema instead of relying on the existing historical Supabase migrations.
- Authentication will use Supabase Auth.
- Logged-in users will have profiles and wallet accounts.
- Guest users must also be able to buy data without signing up or logging in.
- Wallet is part of Phase 1 for logged-in users.
- Payments will use Paystack Ghana.
- The first supplier/provider to integrate is DataMartGH (`datamartgh.shop`).
- InstaData is planned as a second supplier, but it will come after account/API access is available.
- Supplier API docs and credentials must be reviewed before integration logic is written.
- Supplier API keys and payment secrets must stay backend-only.

## Phase 1 Product Outcome

By the end of Phase 1, YieGo should support two customer purchase paths.

### Guest Purchase

Guest customers can:

- Visit the site.
- Select network and data bundle.
- Enter recipient phone number.
- Pay directly with Paystack Ghana.
- Receive data through the supplier API.
- See a receipt/order status page.

Guest users do not need to create an account before buying.

### Logged-In User Purchase

Logged-in customers can:

- Sign up.
- Log in.
- View their profile.
- Fund their wallet through Paystack Ghana.
- Buy data using wallet balance.
- View order history.
- View wallet ledger history.
- Receive wallet refunds if an order fails.

## Recommended Build Order

### 1. Clean Phase 1 Database Schema

Create a new Phase 1 schema that covers only the real first launch scope.

Do not depend on the existing historical migration set as the main source of truth.

Core tables:

- `profiles`
- `admin_users`
- `admin_roles`
- `wallets`
- `wallet_ledger_entries`
- `networks`
- `data_products`
- `suppliers`
- `supplier_product_mappings`
- `orders`
- `order_events`
- `payment_intents`
- `payment_events`
- `supplier_api_logs`
- `admin_notes`
- `audit_logs`

Design rules:

- Wallet balances must be ledger-based.
- Sensitive admin actions must be audited.
- Orders must support both guest and logged-in customers.
- Products must be database-managed, not hardcoded.
- Supplier credentials must not be stored in frontend code.

### 2. Authentication

Use Supabase Auth for real accounts.

Build:

- Signup
- Login
- Logout
- Session persistence
- Auth provider in React
- Protected customer pages
- Protected admin pages
- Profile creation after signup

Customer profile should include:

- User ID
- Full name
- Email
- Phone number
- Created date
- Status

### 3. Guest Checkout Foundation

Guest checkout must work without account creation.

Guest order should collect:

- Recipient phone number
- Optional customer email or contact phone for receipt/support
- Network
- Bundle
- Payment reference
- Order status

Guest customers should receive a receipt/order reference they can use for support.

Important:

- Guest checkout should not create a wallet.
- Guest checkout should pay directly through Paystack.
- If delivery fails after payment, admin must be able to retry or refund manually/through payment rules.

### 4. Wallet System For Logged-In Users

Logged-in users get wallet accounts.

Build:

- Wallet balance
- Deposit history
- Purchase debits
- Refund credits
- Manual admin adjustments
- Wallet ledger view

Wallet ledger entry fields:

- User ID
- Wallet ID
- Amount
- Direction: credit or debit
- Type: deposit, purchase, refund, adjustment
- Balance before
- Balance after
- Related order/payment
- Status
- Reference
- Created at

The app must never update wallet balance without creating a ledger entry.

### 5. Paystack Ghana Integration

Use Paystack Ghana for:

- Guest direct payment
- Logged-in wallet deposit

Backend functions:

- `create_guest_data_payment`
- `create_wallet_deposit`
- `paystack_webhook`
- `verify_paystack_payment`

Payment safety:

- Verify every payment server-side.
- Store every webhook event.
- Prevent duplicate wallet credits.
- Prevent duplicate order fulfillment.
- Link Paystack reference to order or wallet deposit.

### 6. Data Product Management

Move data bundles into the database.

Admin should manage:

- Network
- Bundle size
- Validity
- Customer selling price
- Cost price
- Supplier
- Supplier product code
- Active/inactive state
- Display order

Customer UI should load real active products from the backend.

### 7. DataMartGH Supplier Integration

DataMartGH is the first supplier to integrate.

Backend functions:

- `datamartgh_get_packages`
- `datamartgh_verify_number`
- `datamartgh_place_order`
- `datamartgh_check_order_status`
- `datamartgh_get_balance`
- `datamartgh_webhook`

Supplier details are documented in `docs/datamartgh-api-notes.md`.

Important DataMartGH rules:

- Base URL: `https://api.datamartgh.shop/api/developer`
- Auth header: `X-API-Key`
- Network codes: `YELLO`, `TELECEL`, `AT_PREMIUM`
- Purchase endpoint: `POST /purchase`
- Status endpoint: `GET /order-status/:reference`
- Package endpoint: `GET /data-packages`
- Balance endpoint: `GET /balance`
- Every purchase should use `X-Idempotency-Key`.
- Webhooks should be verified with `X-DataMart-Signature`.
- The delivery tracker widget must not be embedded publicly because it requires the supplier API key.

Every supplier request should log:

- Supplier
- Endpoint/action
- Request payload
- Response payload
- HTTP status
- Supplier reference
- Related order
- Error message
- Created at

Frontend must never call DataMartGH directly.

DataMartGH can return statuses such as `pending`, `waiting`, `processing`, `completed`, `failed`, and `refunded`. YieGo should map those into its own order states and keep the original supplier status for support/admin visibility.

### 8. InstaData Supplier Placeholder

InstaData is planned as a second supplier.

Do now:

- Reserve supplier structure so multiple suppliers can exist.
- Keep product mappings supplier-based.
- Do not hardcode DataMartGH assumptions into the whole system.

Do later:

- Add InstaData credentials.
- Read InstaData docs.
- Add InstaData adapter.
- Add fallback/routing logic if needed.

### 9. Real Buy Data Flow

Replace the current simulated `BuyDataFlow`.

Guest flow:

1. Select network.
2. Select bundle.
3. Enter recipient number.
4. Review order.
5. Pay with Paystack.
6. Backend verifies payment.
7. Backend places supplier order.
8. Customer sees receipt/status.

Logged-in wallet flow:

1. Select network.
2. Select bundle.
3. Enter recipient number.
4. Review order.
5. Pay from wallet.
6. Backend debits wallet safely.
7. Backend places supplier order.
8. Customer sees receipt/status.

Statuses:

- `created`
- `awaiting_payment`
- `paid`
- `processing`
- `pending_supplier`
- `delivered`
- `failed`
- `refunded`
- `cancelled`

### 10. Admin Operations Panel

Admin is a serious Phase 1 requirement.

Build an admin panel with a competent operations layout:

- Sidebar navigation
- Operations dashboard
- Orders
- Customers
- Wallet & payments
- Products & pricing
- Suppliers/API logs
- Admin users/roles
- Audit logs

Most important first screen: Orders.

Order detail should show:

- Order reference
- Customer or guest info
- Recipient phone
- Network
- Bundle
- Amount
- Payment status
- Wallet debit status, if wallet order
- Supplier status
- Supplier request/response
- Timeline
- Admin notes
- Retry/recheck/refund actions

Admin must be able to:

- Search by phone number
- Search by order reference
- Filter by status
- Recheck supplier status
- Retry failed or pending orders
- Refund where appropriate
- Mark resolved
- Add internal notes

### 11. Audit Logging

Audit logs are required from the start.

Log:

- Admin actor
- Action
- Target type
- Target ID
- Before value
- After value
- Reason/note
- Timestamp

Actions to audit:

- Refunds
- Manual wallet adjustment
- Price changes
- Product activation/deactivation
- Supplier retry
- Mark order resolved
- Role changes

### 12. QA And Launch Hardening

Before Phase 1 launch:

- Build passes.
- Lint has no critical issues.
- Basic tests exist for wallet/payment/order logic.
- Guest checkout works.
- Logged-in wallet checkout works.
- Paystack webhook duplicate handling works.
- Supplier failure does not silently lose money.
- Admin can find and resolve customer complaints.
- Mobile UI works.
- Secrets are backend-only.

## Phase 1 Build Milestones

### Milestone 1: Schema And Backend Foundation

- Create clean schema.
- Add Supabase functions/RPCs or edge functions for wallet/order primitives.
- Add RLS policies.

### Milestone 2: Auth And Customer Identity

- Add signup/login/logout.
- Replace fake profile store.
- Support guest checkout separately from authenticated users.

### Milestone 3: Products And Buy Data UI

- Move bundles to database.
- Load active products into Buy Data flow.
- Preserve current strong UI while replacing fake data source.

### Milestone 4: Paystack Payments

- Wallet deposit for logged-in users.
- Direct guest payment for guest checkout.
- Payment verification and webhook handling.

### Milestone 5: DataMartGH Fulfillment

- Place real data orders through DataMartGH.
- Track supplier references and statuses.
- Log all supplier calls.

### Milestone 6: Admin Operations Panel

- Orders dashboard.
- Order detail.
- Customer support search.
- Wallet/payment view.
- Product/pricing management.
- Supplier logs.
- Audit logs.

### Milestone 7: End-To-End QA

- Full guest purchase test.
- Full logged-in wallet purchase test.
- Failed delivery handling.
- Refund handling.
- Admin support workflow test.

## Not In Phase 1

Do not build these until the direct data-selling engine is stable:

- Pro-agent storefronts
- Basic-agent hierarchy
- Agent subscription billing
- Agent custom pricing
- Agent commission/profit dashboards
- Crypto/gift card/bulk SMS/education voucher fulfillment
- Public developer API
