# YieGo Phase 1 Plan

## Phase 1 Goal

Phase 1 turns YieGo from a polished prototype into a real customer-facing data-selling platform.

The target outcome is simple:

A customer can sign up, log in, fund their wallet, buy Ghana mobile data, receive the data through a supplier API, and track the order status. Admins can monitor, support, retry, refund, and manage the operation professionally.

Agents are not part of Phase 1. The agent system depends on the same product, wallet, pricing, order, payment, and fulfillment engine that Phase 1 will build.

## Core Product Scope

### 1. Authentication

Users need real accounts.

Phase 1 should support:

- Sign up
- Login
- Logout
- User profile creation
- Phone number stored on profile
- Email stored on profile
- Session persistence
- Protected customer routes
- Protected admin routes

Phone number is important because the product sells data to Ghana numbers. Email can still be used for login and receipts.

### 2. Wallet System

Wallet is part of Phase 1.

Logged-in users should be able to:

- See real wallet balance
- Deposit money into wallet
- Buy data using wallet balance
- Receive refunds into wallet
- View wallet transaction history
- View receipts

Wallet balance must be ledger-based. The app should not casually update a balance number without recording why money moved.

Every wallet movement should create a ledger entry:

- Deposit credit
- Data purchase debit
- Refund credit
- Manual admin adjustment
- Future agent commission or settlement

### 3. Payments / Wallet Deposits

Users should be able to fund their wallet using real payment rails.

Likely payment methods:

- Mobile Money
- Card
- Paystack or another chosen payment provider

Deposit flow:

1. User enters deposit amount.
2. Backend creates payment intent/session.
3. User completes payment.
4. Payment provider sends confirmation.
5. Backend verifies confirmation.
6. Wallet is credited once.
7. Ledger entry is created.
8. User sees successful wallet top-up.

The backend must protect against duplicate payment webhooks crediting the wallet twice.

### 4. Data Products / Bundles

Hardcoded bundles should move into the database.

Admin should manage:

- Network: MTN, Telecel, AirtelTigo
- Bundle size
- Validity
- Cost price
- Customer selling price
- Supplier/provider
- Active/inactive status
- Availability

The customer frontend should load products from the backend instead of `src/data/bundles.ts` as the final source of truth.

### 5. Customer Data Purchase Flow

Customer flow:

1. Customer logs in.
2. Customer opens Buy Data.
3. Customer selects network.
4. Customer selects bundle.
5. Customer enters recipient phone number.
6. Customer reviews order.
7. Customer pays from wallet.
8. Backend creates an order.
9. Backend debits wallet through the ledger.
10. Backend sends the order to the supplier API.
11. Order becomes pending, delivered, failed, or refunded.
12. Customer sees receipt and order status.

Important behavior:

- If wallet balance is too low, customer should be guided to deposit.
- If supplier delivery fails, order should be marked failed and eligible for retry/refund.
- If supplier status is pending, customer should see pending instead of fake success.

### 6. Supplier API Integration

Supplier API integration is a top priority.

Phase 1 should integrate the first supplier fully before adding the second.

Backend responsibilities:

- Store supplier credentials securely
- Fetch or store available bundles
- Submit data orders
- Receive supplier webhooks if supported
- Poll/check order status if supported
- Log every supplier request and response
- Retry pending/failed calls where safe
- Surface supplier errors to admin

Supplier secrets must never be exposed in frontend code.

### 7. Order History / Receipts

Users should see:

- Data purchases
- Wallet deposits
- Refunds
- Recipient phone number
- Network and bundle
- Amount paid
- Order status
- Payment reference
- Supplier/order reference where available
- Date/time

Receipts should be readable by customers and useful for support.

## Admin Panel Scope

Admin is a core Phase 1 module, not an afterthought.

For this business, admin is where trust is protected. Customers will complain about failed delivery, delayed delivery, wrong number, payment issues, and refunds. The admin panel must feel competent and operationally serious.

### 1. Admin Operations Dashboard

Dashboard should show:

- Orders today
- Successful orders
- Pending orders
- Failed orders
- Revenue today
- Wallet deposits today
- Refunds today
- Supplier health/status
- Orders needing attention
- Recent failed deliveries

### 2. Orders Management

This is the most important admin screen.

Admin should be able to:

- View all orders
- Filter by status
- Search by phone number, order ID, customer, network, and supplier reference
- Open order detail
- See payment status
- See wallet debit status
- See supplier request/response
- Recheck status
- Retry delivery
- Refund to wallet
- Mark resolved
- Add internal notes

### 3. Customer Support View

Admin should be able to:

- Search customer by phone/email
- View customer profile
- View wallet balance
- View deposit history
- View order history
- View failed and pending orders
- Retry/refund where permitted
- Add support notes

### 4. Wallet & Payments Admin

Admin needs visibility into money movement:

- Deposits
- Failed deposits
- Successful wallet credits
- Refunds
- Manual adjustments
- Ledger history per user
- Payment provider reference
- Duplicate webhook checks

Manual wallet adjustments must require a reason and must be logged.

### 5. Product & Pricing Management

Admin should manage:

- Networks
- Data bundles
- Selling prices
- Cost prices
- Active/inactive products
- Supplier assignment
- Availability
- Profit margin

This pricing foundation will later support pro agents and basic agents.

### 6. Supplier/API Monitoring

Admin should see:

- Supplier status
- Supplier balance if available
- API request logs
- API response logs
- Failed supplier calls
- Pending orders by supplier
- Retry/recheck actions
- Webhook events

### 7. DataMartGH-Specific Launch Controls

After reviewing the DataMartGH API documentation, Phase 1 should include these supplier-driven controls from the beginning.

Number verification before checkout:

- Use DataMartGH `POST /verify-number` where useful, especially for MTN/YELLO.
- Show a clear warning when DataMartGH recommends `activate_first`.
- Store the verification response on the order for support visibility.

Supplier health and balance:

- Show DataMartGH supplier wallet balance in admin.
- Warn admin when supplier balance is low.
- Let admin pause sales per network if the supplier pauses or delays a network.
- Track recent supplier errors and last successful supplier request.

Duplicate protection:

- Store one YieGo order reference.
- Store one Paystack reference when payment is used.
- Store one DataMartGH idempotency key per supplier order.
- Prevent duplicate wallet credits, duplicate supplier orders, and duplicate refunds.

DataMartGH webhooks:

- Add a backend webhook endpoint.
- Verify `X-DataMart-Signature`.
- Store every webhook event.
- Update order status safely from webhook events.
- Add the webhook events to the order timeline.

Public order tracking:

- Guest customers need a simple tracking page because they may buy without logging in.
- Tracking should support YieGo order reference and safe phone/reference matching.
- Customers should see simple status, not raw supplier logs.

Product import:

- Fetch DataMartGH packages through backend/admin tooling.
- Store supplier cost separately from customer selling price.
- Admin decides which bundles are active and visible.

### 8. Admin Roles & Permissions

Phase 1 should design for roles even if only one owner uses it initially.

Suggested roles:

- Owner: full control
- Admin: operations and support
- Support staff: customer/order support with limited money actions
- Finance: wallet, deposits, refunds, and adjustments
- Technical/admin developer: supplier logs and integration health

### 9. Audit Logs

Every sensitive admin action should be recorded:

- Actor
- Action
- Target user/order/payment
- Before value
- After value
- Timestamp
- Reason/note

Audit logs are non-negotiable for a wallet/data platform.

## Phase 1 Success Definition

Phase 1 is complete when:

- A customer can sign up and log in.
- A customer can fund their wallet.
- A customer can buy data from wallet balance.
- The backend creates and tracks real orders.
- At least one supplier API is fully integrated.
- Failed/pending delivery can be handled by admin.
- Admin can manage orders, users, wallet movements, products, and supplier logs.
- Build and core smoke tests pass.

## Recommended Phase 1 Boundary

Include:

- Customer auth
- Wallet
- Deposits
- Data products
- Data purchase
- Supplier API integration
- Order status
- Receipts
- Serious admin operations panel

Do not include yet:

- Pro-agent storefronts
- Basic-agent hierarchy
- Agent subscription billing
- Agent custom pricing
- Agent commissions
- Crypto, gift cards, bulk SMS, education vouchers, and other non-data products
- Public developer API

Those should come after the direct customer data engine is stable.
