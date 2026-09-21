AvrilMatanguihan, Mashoge

## Pasabuy Feature (US-053) — Backend Prerequisites

The Pasabuy UI is being built frontend-only against existing endpoints, with mock/local state standing in for anything the backend doesn't support yet (see `Pasabuy Feature Implementation Prompt.md`). Below is what's needed from the backend to replace those mocks with real calls.

### Already available — reuse, don't duplicate

- `GET /pasabuy/profile`, `PUT /pasabuy/profile`
- `GET /pasabuy/requests` (browse open requests)
- `POST /pasabuy/requests/:id/accept`
- `POST /pasabuy/requests/:id/pickup`
- `POST /pasabuy/requests/:id/deliver`
- `PasabuyRequest`, `PasabuyStatusHistory`, `PasabuyProfile` models
- `Payment.purpose = PASABUY`, `Report` → `ReportTargetPasabuy` relation

### Missing endpoints

1. **Create request** — `POST /pasabuy/requests`. There is no creation route yet; the requester-side form has nothing to submit to.
2. **Complete / confirm receipt** — nothing moves a request past `DELIVERED` today. The requester needs a way to confirm receipt and close out the request.
3. **Cancellation** — no cancel-by-requester or cancel-by-deliverer route.
4. **Dispute / report a problem** — `Report` already has a `ReportTargetPasabuy` relation, but no controller route creates one against a Pasabuy request.
5. **Vendor view** — vendors currently have no way to see the assigned deliverer or pickup code for an order tied to a Pasabuy request.

### Schema gaps (`prisma/schema.prisma`)

- `PasabuyStatus` (`PENDING, ACCEPTED, PAID, IN_PROGRESS, DELIVERED, CANCELLED`) doesn't cover the intended flow: `OPEN → ACCEPTED → AWAITING_PAYMENT → PAID → PICKUP_READY → PICKED_UP → DELIVERED → COMPLETED`, plus `CANCELLED / EXPIRED / PAYMENT_EXPIRED / DISPUTED`. Needs `AWAITING_PAYMENT`, `PICKUP_READY`, `PICKED_UP`, `COMPLETED`, `EXPIRED`, `PAYMENT_EXPIRED`, `DISPUTED` (see the payment-flow section below for why `AWAITING_PAYMENT`/`PAID` must be distinct from `ACCEPTED`).
- No pickup code on `PasabuyRequest` — the deliverer view needs to display one and the vendor needs to verify it.
- No `expiresAt` on `PasabuyRequest` — needed for the "waiting for deliverer" countdown and auto-expiry.
- No fee-tier fields — `convenienceFee` is a free-form `Decimal`; nothing encodes in-campus (₱30) vs. outside-campus (₱50), or captures/validates the 270m delivery-distance rule.
- No terms-acceptance timestamp — needs a field (on `PasabuyRequest` or `PasabuyProfile`) to record that the requester accepted the Pasabuy terms.
- No preorder marker on `Order` — `OrderType` is only `INDIVIDUAL` / `GROUP`; preorder currently exists only as a vendor availability window (`VendorPreorderAvailability`), so the backend can't tell the frontend "this order is a preorder" to disqualify it from Pasabuy.
- `Order.isPasabuyRequest` is a plain boolean with no DB-level constraint preventing more than one active `PasabuyRequest` per order — worth a unique/partial index if "one active request per order" is a hard rule.
- `PasabuyProfile` only stores `studentId` (a string) — no photo field and no verification flag. The frontend now has a "Student ID" section on the profile page that collects both a number and a photo (kept client-side only, in `localStorage`, resized before saving) and auto-marks itself verified, since there's no admin review queue to call. That's a placeholder for whatever real upload/verification flow the backend ends up wanting — see `pasabuy-eligibility.ts` and `pasabuy-student-id-card.tsx`.

### Revised payment flow — the fee is charged after acceptance, not at request creation

The Pasabuy fee is no longer charged when the request is created. It's only charged after a deliverer accepts, so an unaccepted request never needs a refund. This changes what the backend needs to support, on top of everything above:

1. **A Pasabuy-fee-only payment.** `createPaymentCheckout(paymentShareId)` (`artifacts/frontend/src/features/auth/api.ts`) only charges an existing order `PaymentShare` — there's no way to start a PayMongo checkout for just the ₱30/₱50 Pasabuy fee, decoupled from the food order's `PaymentShare`. The frontend currently simulates this entirely in `pasabuy-payment-dialog.tsx` (a fake "Pay ₱30" button with a 700ms delay and a manual success/failure toggle) — it has nothing real to call.
2. **A payment status separate from delivery status.** The UI now tracks two fields per request: `status` (the delivery lifecycle) and `paymentStatus` (`NOT_CHARGED / AWAITING_PAYMENT / PAID / PAYMENT_FAILED / PAYMENT_EXPIRED / REFUNDED`). `PasabuyRequest.status` alone can't carry both — accepting a request must NOT imply the fee was paid.
3. **A payment deadline.** Once a deliverer accepts, the requester gets a window (frontend mock: 5 minutes) to pay before the assignment is released. Needs a `paymentDeadline` timestamp and a sweep/cron equivalent to expire it (frontend mocks this by checking the deadline on every read).
4. **Webhook-driven state transitions.** `PAID` must only be set once PayMongo confirms the Pasabuy-fee payment succeeded (not on checkout creation) — mirroring however the existing order-payment webhook already updates `PaymentShare.status`.
5. **No new refund logic needed for the common cases** (rule 4/7 in the payment doc: nobody accepts, or accepts but never pays → ₱0 charged, nothing to refund). A refund is only relevant if a Pasabuy fee was actually paid and then cancelled/disputed — that should reuse whatever refund policy already exists for paid orders, not a new one.

### Found while wiring the UI (`artifacts/frontend/src/features/pasabuy`)

The full UI is now built — every screen in the prompt doc, entry points on the order tracking widget and order history, a marketplace banner, and a deliverer/vendor view — all running on the mock store in `pasabuy-mock-store.ts`, since none of the gaps above exist yet. Two more real-data gaps turned up while wiring the entry points into existing screens:

- `CustomerOrder` (`GET /orders` mine, used on the profile order-history list) and `OrderStatusResponse` (`GET /orders/:id/status`, used by the order tracking widget) both lack `isPasabuyRequest` and any short order reference — the UI currently fakes a reference by truncating the order UUID. `OrderStatusResponse` already has `isPasabuyRequest`; `CustomerOrder` doesn't.
- Neither response exposes a vendor pickup address distinct from the vendor's name/`campusLocation` — fine as a stand-in, but worth a real `pickupLocation` field if one doesn't already exist elsewhere.

A single component, `pasabuy-dev-controls.tsx`, lets one logged-in tester step a request through every status (it calls a `devAdvance()` helper in the mock store that bypasses the "must be the assigned deliverer/requester" checks). That's the one place faking the missing multi-actor/backend flow — everything else only calls the mock store's normal, role-checked functions, so replacing `pasabuy-mock-store.ts` and `pasabuy-eligibility.ts` with real API calls once the endpoints above exist should not require touching any component.

### For whoever picks this up

Frontend work is intentionally isolated (mock service / local state) so swapping in the real endpoints above should be a small, contained diff once they exist. Student ID images must stay admin-only — deliverer/requester views should only ever see the verified boolean already returned by `GET /pasabuy/profile`.
