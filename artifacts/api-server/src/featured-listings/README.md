# Featured listings (US-043)

All endpoints use the global `/api/v1` prefix.

- `GET /featured-listings/plans` lists active packages (placement, PHP price, duration in days).
- `POST /featured-listings/plans` and `PATCH /featured-listings/plans/:id` let an admin configure a package or toggle its availability. Example: `{ "name": "Home for 7 days", "placement": "MARKETPLACE_HOME", "price": 50, "durationDays": 7 }`.
- `POST /featured-listings` accepts `{ "planId": "uuid" }` from an active vendor. `PRODUCT_SPOTLIGHT` additionally requires a product owned by that vendor and currently available. The vendor never supplies the price, placement, or duration. Returns a sandbox checkout for a **pending** listing and linked pending payment.
- `POST /featured-listings/:id/checkout` resumes an owner's pending checkout, returning the same PayMongo session when it exists.
- `GET /featured-listings/mine` returns only that vendor's listings, plan, and payment summaries.
- `GET /featured-listings?placement=MARKETPLACE_HOME` is public and returns only paid, currently active placements for active vendors, with available products when applicable. It does not expose a payment, buyer data, or checkout URL.

PayMongo's signed `checkout_session.payment.paid` webhook is verified against the checkout reference and provider payment amount/currency/status. Only then does the listing become `ACTIVE`, set `pricePaid`, and receive its `startDate` and `endDate`. A late paid checkout for an ineligible or cancelled placement follows the existing automatic refund path. An interval expires active placements and unused pending checkout sessions. A database index prevents a vendor from holding two pending/active listings in the same placement, and another prevents two local payments for one listing. Existing historical active listings remain visible until their existing end dates.

Three placements are available: `MARKETPLACE_HOME`, `VENDOR_DIRECTORY`, and `PRODUCT_SPOTLIGHT`. The frontend should render the returned placements in the matching surface; this backend does not change marketplace UI ranking by itself.
