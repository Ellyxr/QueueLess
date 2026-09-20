Payments feature module.

- `payment-method.ts` / `payment-method-form.tsx` — a buyer's saved payment
  method preference, set up on the profile page (`../profile/profile.tsx`).
  Stored client-side (localStorage) since there's no backend PaymentMethod
  model; ordering is gated on having one configured. This does not carry
  actual card/GCash credentials to the real payment — PayMongo Checkout
  collects those itself, see below.
- `payment-success.tsx` / `payment-cancel.tsx` — pages the buyer lands on
  after PayMongo's hosted checkout redirects back
  (`PAYMONGO_SUCCESS_URL` / `PAYMONGO_CANCEL_URL`, routed at
  `/payment/success` and `/payment/cancel`). Success polls
  `GET /payments/orders/:orderId/status` until the webhook has marked the
  payment `SUCCEEDED`; cancel offers a retry that creates a new checkout
  session for the same order.

As of the real PayMongo Sandbox integration, checkout no longer happens
in-app: `../cart/cart.tsx` creates the order, then calls
`POST /payments/checkout` and does a full-page redirect
(`window.location.href`) to the PayMongo-hosted checkout URL. The backend
verifies PayMongo's webhook signature and flips the order to `PAID` itself
(`src/payments` in api-server) — the vendor's queue reflects this
automatically, and vendors can no longer mark an order "Paid" manually.
