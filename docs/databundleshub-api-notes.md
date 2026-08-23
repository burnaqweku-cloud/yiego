# DataBundlesHub API — capture notes

Captured 2026-08-17 from the agent dashboard's API Documentation page
(`https://www.databundleshub.com` → Documentation). The docs sit behind the
agent login, so this file is the reference for implementation work; re-check it
against the live dashboard before relying on a detail.

Candidate **second supplier**. See `docs/datamartgh-api-notes.md` for the
incumbent.

## Identity and auth

- Base URL: `https://www.databundleshub.com`
- Auth (recommended): `Authorization: Bearer <api_key>`
- Auth (legacy, still accepted): `X-API-Key: <api_key>`
- The API is for **agent accounts only**; purchases debit a prepaid wallet.
- Rate limits: **100 requests/minute** and **1000 requests/hour** per key.
  Rate-limit headers are returned on responses.

## Endpoints

### Purchase — `POST /api/developer/purchase`

Aliases that hit the same handler: `/api/create_order`,
`/api/developer/v1/orders_order`. **`/api/purchase` is NOT registered (404).**

```json
{ "phoneNumber": "0551234567", "capacity": "10" }
```

- Field aliases accepted: `beneficiary_number` / `phone` for the number;
  `data_gb` / `package_size` / `gb` for the size.
- **Not accepted:** `network`, `user_id`, `type`, client reference. The account
  comes from the API key and the server generates `transactionReference`.
- Optional idempotency: `Idempotency-Key` header, or `idempotency_key` in the
  body, to retry safely without duplicating a purchase.

Success returns `data.purchaseId` (integer), `transactionReference`, `network`,
`capacity`, `price`, `remainingBalance`, `orderStatus` (`pending` initially).

> **`purchaseId` is the order id.** Store it — it is the `order_id` required by
> the status endpoint. It is an integer, unlike DataMartGH's string reference.

### Check order status — `GET /api/developer/purchase-status`

Query params `order_id` (the `purchaseId`) and `api_key`, both required.
Returns `status`, `status_description`, `is_completed`, `package_size`,
`amount`, `network`, `phone_number`, timestamps.

| status | is_completed |
| --- | --- |
| `pending` | false |
| `verified` | false |
| `delivered` | **true** |
| `completed` | **true** |
| `failed` | false |

Error codes: `MISSING_PARAMETERS` (400), `INVALID_API_KEY` (401),
`ORDER_NOT_FOUND` (404).

### Transaction history — `GET /api/developer/transactions?page=&limit=`

Paginated purchase history.

**No balance endpoint is documented**, and **no webhooks exist** — delivery
confirmation must be polled. Both are gaps against DataMartGH.

## Networks — inferred from the phone prefix

We cannot send a network. It is derived from the number, which makes **ported
numbers a real failure mode**: an 024 number now on Telecel would be sent to
MTN. DataMartGH takes an explicit network, so it does not have this problem.

| Network | Code | Prefixes | GB range | Upstream |
| --- | --- | --- | --- | --- |
| MTN | `YELLO` | 024, 025, 053, 054, 055, 059 | 1–200 | **VendorGH** (plain-text batch) |
| Telecel | `TELECEL` | 020, 050 | **10**–200 | **AgentsHub** queue API |
| AirtelTigo | `AIRTELTIGO` | 026, 027, 056, 057 | 1–200 | **AgentsHub** queue API |

Telecel has a **10 GB minimum**.

The named upstreams matter: DataMartGH reports `processingMethod:
"geonettech_api"`, so the two suppliers run on **different** providers and a
second supplier does buy genuine redundancy. (An earlier guess that both used
Geonettech — inferred from the shared `YELLO` code — was wrong; `YELLO` is the
common MTN code across this market.)

Both upstream models are asynchronous — a batch for MTN, a queue for the other
two — which is consistent with the `pending → verified → delivered` status
progression and means delivery is not instant.

## Pricing

Flat **price per GB by account role and GB band**, not per product, and
explicitly independent of which upstream fulfils the order. Tiers shown:
Agents, Super Agents, Dealers, each banded 1–9 GB / 10–19 GB / 20+ GB, with the
rate falling as the tier and the band rise. Read from the dashboard at roughly
GHS 4.20–4.50/GB on the **Agent** tier — **confirm exact figures in the
dashboard before pricing anything**.

For comparison, DataMartGH's wholesale works out around GHS 3.80–4.10/GB and
improves on larger bundles, where this flat rate does not. On the Agent tier
DataBundlesHub is therefore **more expensive than the incumbent**, so the case
for adding them is redundancy and coverage rather than cost.

## Error codes

`UNAUTHORIZED`, `INVALID_PHONE`, `INVALID_NETWORK`, `INVALID_CAPACITY`,
`INSUFFICIENT_BALANCE`, `TRANSACTION_FAILED`, `INTERNAL_ERROR`,
`METHOD_NOT_ALLOWED`. Errors follow
`{ "success": false, "error": "...", "code": "..." }`; `INSUFFICIENT_BALANCE`
also returns `required` and `available`.

Because no balance endpoint is documented, `INSUFFICIENT_BALANCE` is the signal
to alert on for a low float.

## Due diligence (unchanged by the docs)

Domain ownership is privacy-shielded, there is no company registration, address
or legal pages, payment historically went to a personal Mobile Money number,
and an identical deployment runs at `e-cubetechsolutions.com`. The API itself is
competent; the corporate footprint is thin. Fund it with an amount that could be
written off.

---

## Verified against the live API — 2026-08-23

Everything below was confirmed by real calls, not read from their documentation.
Where the two disagree, the documentation is wrong.

### Status is polled on a different route than documented
`/api/developer/check_order_status?order_id=…` answers **"route could not be
found"**. The purchase reply returns its own `requestId` plus a `statusUrl`, and
that route answers:

    GET /api/developer/purchase-status?request_id={requestId}

So keep the `requestId`, not just the `purchaseId`.

### The purchase reply carries two states
`processingStatus` is their own queue ("completed" as soon as they accept it);
`orderStatus` is delivery to the customer, and moves `pending` → `processing` →
`delivered`. Only `orderStatus` may be shown to a customer.

### Idempotency genuinely works
Replaying a purchase with the same `Idempotency-Key` returned `duplicate: true`
with the original `purchaseId` and an unchanged balance. A retry cannot double
charge.

### Cost prices, read from the API
A purchase that exceeds the wallet balance is refused but still returns the
price, so the whole list can be read without buying anything.

| Size | Cost | Per GB |
| --- | --- | --- |
| 1GB | 4.00 | 4.00 |
| 8GB | 32.00 | 4.00 |
| 10GB | 40.00 | 4.00 |
| 15GB | 60.00 | 4.00 |
| 20GB | 78.00 | 3.90 |
| 25GB | 97.50 | 3.90 |
| 30GB | 117.00 | 3.90 |
| 40GB | 156.00 | 3.90 |
| 50GB | 195.00 | 3.90 |

Two bands: **GHS 4.00 per GB up to 15GB, GHS 3.90 from 20GB.** Dearer than
DataMartGH (~3.80–4.10) on most sizes, so this is a backup route, not a cheaper
one.

### They do not sell every size
`12`, `35`, `45` and `100` GB answer `INVALID_CAPACITY`, so the "1–200GB" range
in their documentation is not a continuous range. Confirmed sellable: 1, 8, 10,
15, 20, 25, 30, 40, 50. Sizes 2–6GB are unverified — each costs less than the
float, so probing them would place a real order.

### Base URL
`https://databundleshub.com/api/developer` works without the `www.` prefix.

### What still has no answer
- No webhook: delivery is confirmed only by polling.
- No balance endpoint: an empty float appears only as `INSUFFICIENT_BALANCE` on
  a live order.
- The network cannot be overridden; it is read from the phone prefix, so a
  ported number is delivered to the wrong network unless we refuse it first.
