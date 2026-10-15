# End-to-end smoke test (US-053)

Run this before every demo or submission. It drives the core demo path through
the real API, the real PayMongo sandbox checkout and the real Socket.IO server,
and exits non-zero on the first broken step.

| # | Step | What is verified |
| - | ---- | ---------------- |
| 1 | Health | API up, database reachable, all migrations applied |
| 2 | Auth + realtime | buyer, other student and vendor log in; their sockets get `realtime.ready`; an invalid token is rejected |
| 3 | Order | cart → order (`PENDING`); retry with the same Idempotency-Key returns the same order; vendor gets `order.created`; other student gets 404 |
| 4 | Payment | PayMongo checkout session created (and replayed idempotently); unsigned and tampered webhooks rejected (401); signed webhook marks the order `PAID`; duplicate delivery is idempotent; buyer gets `order.status.updated PAID` |
| 5 | Vendor + buzzer | buyer cannot change status (403); vendor `COOKING` → `READY_FOR_PICKUP`; buyer gets `order.ready` exactly once; other student and vendor get nothing |
| 6 | Recovery | `/orders/ready-for-pickup` and `/orders/mine` return the same `eventId` as the socket event |
| 7 | Pickup | buyer confirms pickup → `COMPLETED`; order leaves the ready list |

It creates **one real order** for the accounts you pass in. Use test accounts.

## Accounts

Three accounts are needed: a student (buyer), a **different** student (to prove
events are not leaked), and a vendor owner whose store is `ACTIVE` and has at
least one available product.

```powershell
$env:SMOKE_BUYER_EMAIL    = "<buyer student email>"
$env:SMOKE_OUTSIDER_EMAIL = "<another student email>"
$env:SMOKE_VENDOR_EMAIL   = "<vendor owner email>"
$env:SMOKE_PASSWORD       = "<shared test password>"   # or SMOKE_BUYER_PASSWORD etc.
# optional: $env:SMOKE_PRODUCT_ID = "<product uuid>"
```

The buyer's existing cart for that vendor is checked out together with the
smoke item; the script prints a note when that happens.

## Run locally

```powershell
cd artifacts/api-server
pnpm build
node dist/main.js          # terminal 1
pnpm smoke                 # terminal 2
```

Payment uses `--payment simulate` by default: the script creates a real
PayMongo sandbox checkout, then sends a `checkout_session.payment.paid` webhook
signed with `PAYMONGO_WEBHOOK_SECRET` from `artifacts/api-server/.env`. The real
signature check and payment code run; only the card entry is skipped, so it
works on localhost where PayMongo cannot reach the webhook.

## Run against staging

```powershell
cd artifacts/api-server
pnpm smoke -- --base-url https://queueless-bg1x.onrender.com --payment real
```

`--payment real` prints the checkout URL. Open it, pay with a PayMongo test
method, and the script waits (up to 10 minutes) for PayMongo's real webhook to
reach Render. This verifies the deployed webhook configuration end to end.

To simulate on staging instead, the local `.env` must hold the **staging**
`PAYMONGO_WEBHOOK_SECRET` (or pass `--env-file .env.staging`).

## Output

```
QueueLess smoke test -> http://localhost:5000 (payment: simulate)

1. Health
  PASS  GET /health is ok
  ...
7. Pickup
  PASS  final status COMPLETED, readyEventId kept

SMOKE TEST PASSED: 39 passed, 0 failed in <n>s
```

On failure the step, HTTP status and response body are printed, e.g.
`FAIL  vendor: COOKING -> READY_FOR_PICKUP  (HTTP 409: {...})`.

## Not covered (check by hand in the browser)

The script covers backend, payment and realtime. Before the demo also check in
the frontend: login screens, menu and cart UI, the PayMongo redirect back to
`/payment/success`, the buzzer sound/alert, and the vendor queue screen.
