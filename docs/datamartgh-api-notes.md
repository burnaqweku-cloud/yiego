# DataMartGH API Notes

These notes are based on the DataMartGH API documentation captured on July 31, 2026.

Phase 1 should treat DataMartGH as the first real data supplier. The frontend must never call DataMartGH directly. All requests must go through YieGo backend/Supabase functions so API keys stay private and we can log, retry, refund, and support customers properly.

## Base URL

```text
https://api.datamartgh.shop/api/developer
```

## Authentication

All API requests require:

```text
X-API-Key: <DATAMARTGH_API_KEY>
Content-Type: application/json
```

Some DataMartGH accounts may also configure extra API rules:

- Reference rule: orders must include a `ref` with a required prefix.
- Second secret: requests must include `X-API-Secret`.
- Limits: maximum GB per order and maximum daily spend.

If a configured rule is broken, DataMartGH can return `403 API_RULE_VIOLATION`.

## Important Integration Rules

- Store `DATAMARTGH_API_KEY` only in backend environment variables.
- Use `X-Idempotency-Key` for every purchase and bulk purchase request.
- Never retry a timed-out purchase with a new idempotency key. Retry with the same key.
- Store every supplier request and response in `supplier_api_logs`.
- Store DataMartGH `orderReference` on the YieGo order.
- Use DataMartGH status/webhooks to update YieGo order status.
- Do not use the API simulator with a real key unless intentionally testing, because the docs say it makes real charged requests.

## Network Codes

DataMartGH uses these network identifiers:

- `YELLO`
- `TELECEL`
- `AT_PREMIUM`

The app should map these to customer-friendly labels such as MTN, Telecel, and AirtelTigo.

## Data Packages

```text
GET /data-packages?network=YELLO
```

The `network` query is optional and can be one of:

- `YELLO`
- `TELECEL`
- `AT_PREMIUM`

Example response shape:

```json
{
  "status": "success",
  "pricingTier": "reseller",
  "data": {
    "YELLO": [
      { "capacity": 1, "mb": 1024, "network": "YELLO", "price": 4.0 },
      { "capacity": 2, "mb": 2048, "network": "YELLO", "price": 9.0 },
      { "capacity": 5, "mb": 5120, "network": "YELLO", "price": 23.0 }
    ]
  }
}
```

Phase 1 use:

- Pull supplier package/cost data into admin/product management.
- Store customer selling prices separately in YieGo.
- Do not let customer UI depend directly on DataMartGH availability in real time.

## Verify Number

```text
POST /verify-number
```

Request:

```json
{
  "phoneNumber": "0551234567"
}
```

This does not place an order and does not send data. It checks whether a number can currently be served.

Possible successful response:

```json
{
  "status": "success",
  "data": {
    "phoneNumber": "0551234567",
    "network": "MTN",
    "servable": true,
    "recommendation": "sell_any",
    "message": "This number can be served — you may sell any bundle size.",
    "cached": false
  }
}
```

Possible “activate first” response:

```json
{
  "status": "success",
  "data": {
    "phoneNumber": "0559876543",
    "network": "MTN",
    "servable": false,
    "recommendation": "activate_first",
    "message": "This number is new to the network. Sell a 1GB bundle first, then allow up to 72 hours for activation.",
    "cached": false
  }
}
```

Recommendation values:

- `sell_any`
- `activate_first`

Rate/timing notes:

- Single verify is capped at about 2 checks per minute per API key.
- Exceeding the limit can return `429 RATE_LIMIT_EXCEEDED`.
- Temporary supplier unavailability can return `503 VERIFY_UNAVAILABLE`.

Phase 1 use:

- Optional pre-check before purchase, especially for MTN/YELLO.
- If the supplier says `activate_first`, the UI/admin should clearly show the warning instead of blindly selling a larger bundle.

## Bulk Verify Number

```text
POST /verify-number/bulk
```

Request:

```json
{
  "numbers": [
    "0551234567",
    "233244100459",
    { "number": "244100459" },
    { "beneficiary_number": "0559233850" }
  ]
}
```

Notes:

- Up to 100 numbers per request.
- About 10 requests per minute per API key.
- Results include accepted/rejected items and normalized local-format numbers.

This is not required for the first guest checkout, but it is useful later for admin/bulk flows.

## Purchase Data

```text
POST /purchase
```

Headers:

```text
X-API-Key: <DATAMARTGH_API_KEY>
X-Idempotency-Key: <unique-per-order-key>
Content-Type: application/json
```

Request:

```json
{
  "phoneNumber": "0551234567",
  "network": "YELLO",
  "capacity": "5",
  "gateway": "wallet"
}
```

Response shape:

```json
{
  "status": "success",
  "message": "Data bundle purchased successfully",
  "data": {
    "purchaseId": "60f1e5b3e6b39812345678",
    "orderReference": "GN-AB12CD34",
    "transactionReference": "TRX-a1b2c3d4-...",
    "network": "YELLO",
    "capacity": 5,
    "price": 23.0,
    "balanceBefore": 100.0,
    "balanceAfter": 77.0,
    "orderStatus": "completed",
    "processingMethod": "geonettech_api"
  },
  "rateLimit": {
    "limit": 150,
    "remaining": 147,
    "resetInSeconds": 45
  }
}
```

Insufficient supplier wallet example:

```json
{
  "status": "error",
  "message": "Insufficient wallet balance",
  "currentBalance": 10.0,
  "requiredAmount": 23.0
}
```

Phase 1 use:

- For guest orders, only call `/purchase` after Paystack payment is verified.
- For logged-in wallet orders, debit YieGo wallet first in a safe transaction, then place supplier order.
- If supplier placement fails after customer payment/wallet debit, mark the YieGo order as failed or needs review and expose it in admin.
- Use `orderReference` for support and status checks.

## Bulk Purchase

```text
POST /bulk-purchase
```

Request:

```json
{
  "orders": [
    { "phoneNumber": "0551234567", "network": "YELLO", "capacity": "5", "ref": "MY-001" },
    { "phoneNumber": "0201234567", "network": "TELECEL", "capacity": "10", "ref": "MY-002" },
    { "phoneNumber": "0271234567", "network": "AT_PREMIUM", "capacity": "2" }
  ]
}
```

Notes:

- Maximum 50 orders per request.
- DataMartGH validates all orders and checks total supplier wallet balance upfront.
- Use one idempotency key for the whole batch.
- Webhooks fire per order.

Bulk purchase is not required for the first simple customer checkout, but the schema should not block it later.

## Order Status

```text
GET /order-status/:reference
```

Response data includes:

- `orderId`
- `reference`
- `phoneNumber`
- `network`
- `capacity`
- `price`
- `orderStatus`
- `processingMethod`
- `createdAt`
- `updatedAt`

Supplier status values shown in docs:

- `pending`
- `waiting`
- `processing`
- `completed`
- `failed`
- `refunded`

Phase 1 status mapping:

- `pending`, `waiting`, `processing` → YieGo `processing` or `pending_supplier`
- `completed` → YieGo `delivered`
- `failed` → YieGo `failed`
- `refunded` → YieGo `refunded`

## Balance

```text
GET /balance
```

Response includes:

- Supplier wallet balance
- Currency, normally `GHS`
- DataMartGH user info
- Timestamp

Phase 1 use:

- Admin supplier health card.
- Low supplier-balance warning.
- Do not show this as a customer wallet balance.

## Transactions

```text
GET /transactions?page=1&limit=20
```

Response includes supplier transaction history and pagination.

Related endpoints shown:

```text
GET /purchase-history/:userId?page=1&limit=20
POST /claim-referral-bonus
```

Phase 1 use:

- Optional admin reconciliation.
- Not required for the first customer checkout.

## Delivery Tracker

```text
GET /delivery-tracker
```

The docs also provide an embeddable widget:

```html
<script
  src="https://api.datamartgh.shop/widgets/delivery-tracker.js"
  data-api-key="YOUR_API_KEY"
  data-theme="dark">
</script>
```

Phase 1 decision:

- Do not embed this widget on the public YieGo customer site because it exposes the API key.
- Use the backend endpoint/status/webhooks instead.
- An admin-only supplier health view can use backend-fetched tracker data.

## Webhooks

DataMartGH supports webhook configuration from their dashboard/API docs UI.

Events shown:

- `order.created`
- `order.processing`
- `order.completed`
- `order.failed`
- `order.refunded`

Payload shape:

```json
{
  "event": "order.completed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "orderId": "60f1e5b3e6b39812345678",
    "orderReference": "GN-AB12CD34",
    "transactionId": "TRX-a1b2c3d4-...",
    "phone": "0551234567",
    "network": "YELLO",
    "capacity": 5,
    "price": 20.5,
    "status": "completed",
    "createdAt": "2024-01-15T10:28:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

Webhook headers:

```text
X-DataMart-Signature: <HMAC-SHA256 signature>
X-DataMart-Event: order.completed
Content-Type: application/json
```

Phase 1 use:

- Create a backend webhook endpoint.
- Verify the HMAC signature using the webhook secret.
- Store every webhook event.
- Update YieGo order status idempotently.
- If an order fails/refunds, create the correct wallet refund or admin review task depending on payment type.

Important implementation note:

- HMAC verification should use the raw request body if the backend platform supports it. Avoid relying on a re-stringified JSON body for final production verification.

## Usage Statistics

```text
GET /usage/stats
GET /usage/history?page=1&limit=20
```

Phase 1 use:

- Optional admin monitoring.

## Withdrawal API

The documentation also includes a withdrawal API for Mobile Money payouts from the DataMartGH wallet.

This should not be part of the first customer data-purchase flow.

If used later, it requires stronger controls:

- Separate withdrawal permission.
- HMAC request signing.
- `X-Idempotency-Key`
- `X-Signature` / `X-DM-Signature`
- `X-Timestamp`
- Admin audit logs.
- Limits and approval workflow.

## Current Supplier Risk Notes

- The docs banner says new MTN orders were temporarily paused while pending deliveries were being cleared. This means supplier availability can change and must be visible in admin.
- Supplier wallet balance can block fulfillment even when YieGo customer payment succeeds.
- Idempotency is critical to avoid duplicate charges.
- Webhooks and status checks are both needed because delivery may not be immediate.

## Phase 1 Minimum Integration Checklist

- [ ] Add backend-only env vars for DataMartGH API key and optional API secret.
- [ ] Create DataMartGH adapter with `getPackages`, `verifyNumber`, `purchase`, `checkOrderStatus`, `getBalance`.
- [ ] Generate and store one idempotency key per YieGo order.
- [ ] Log every DataMartGH request/response.
- [ ] Store supplier order reference on YieGo orders.
- [ ] Add DataMartGH webhook endpoint and signature verification.
- [ ] Add admin supplier logs and supplier health view.
- [ ] Add admin order retry/recheck actions.
- [ ] Add clear failure/refund handling for customer support.
