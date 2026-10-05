# Vendor featured listing cancellation

POST /api/v1/featured-listings/:id/cancel

Requires a VENDOR_OWNER bearer token and a UUID listing ID. No request body.
Only the owning vendor can cancel. A foreign or missing listing returns 404.
PENDING and ACTIVE listings become CANCELLED. Repeating cancellation returns
idempotentReplay: true without another audit. EXPIRED listings return 409.
A checkout marked CREATING returns 409 until its uncertain creation is reconciled.
Suspended vendors may stop their own promotion.

Response: { listingId, status: "CANCELLED", idempotentReplay, automaticRefund: false }

Paid promotion cancellation stops display; it does not automatically refund or
credit the vendor wallet. Purchase/payment records and original dates are retained.
Pending payments are preserved so a late verified payment on a cancelled listing
can use the existing automatic refund workflow. Provider checkout expiration is
attempted after local cancellation commits. Provider failures do not undo local
cancellation. Refund completion still depends on provider support/reconciliation.
Unconsumed introductory claims are released only if no other pending/active
marketplace-home listing remains; consumed introductory eligibility is retained.
Cancellation uses the same pricing lock as purchases and payment activation,
and its audit is committed atomically with the state change.

Apply this incremental patch after issue136-admin-featured-list.patch and the
original QA136 backend changes. No migration or Prisma generation required.

Validation: build compilation, typecheck, targeted ESLint and 83 regression tests
passed locally. Database locking and actual PayMongo cancellation/refund delivery
were not exercised against live services.
