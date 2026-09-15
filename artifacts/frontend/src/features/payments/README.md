Payments feature module.

- `payment.tsx` — `PaymentStep` component: PayMongo Sandbox-style payment
  initiation UI + processing/success/failed status display, used inside the
  checkout flow (`Order Now → Payment → Continue browsing`) in
  `../cart/cart.tsx`. Currently simulated client-side because the backend has
  no payment endpoints yet — see `BACKEND_GAPS.md` for details.
