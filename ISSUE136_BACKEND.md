# QA #136 backend implementation

Built against the supplied `issue136-source.zip`. This patch contains only backend code, one additive migration, tests and this handoff. Existing issue #131, buyer cash-in, refund, vendor storefront ownership and order-report backend behavior are retained.

## Apply and validate

Do not discard any existing work. Save `issue136-backend.patch` in the repository root. In PowerShell, run each command and stop at the first failure:

```powershell
git apply --ignore-space-change --check .\issue136-backend.patch
if ($LASTEXITCODE -ne 0) { throw "Patch does not match; stop here." }
git apply --ignore-space-change .\issue136-backend.patch
if ($LASTEXITCODE -ne 0) { throw "Patch failed." }
pnpm --dir artifacts/api-server exec prisma validate
if ($LASTEXITCODE -ne 0) { throw "Schema validation failed." }
```

Then generate the client, apply the migration to the intended test database and check migration status:

```powershell
pnpm --dir artifacts/api-server prisma:generate
if ($LASTEXITCODE -ne 0) { throw "Generation failed." }
pnpm --dir artifacts/api-server exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "Migration failed." }
pnpm --dir artifacts/api-server exec prisma migrate status
if ($LASTEXITCODE -ne 0) { throw "Migration status failed." }
```

Restart Nest after generation/migration. Build, typecheck and lint:

```powershell
pnpm --dir artifacts/api-server build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }
pnpm --dir artifacts/api-server typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }
pnpm --dir artifacts/api-server lint
if ($LASTEXITCODE -ne 0) { throw "Lint failed." }
```

Run all regression files from the repo root:

```powershell
node --test artifacts/api-server/test/qa136-backend-regression.cjs artifacts/api-server/test/vendor-applications-regression.cjs artifacts/api-server/test/wallet-regression.cjs artifacts/api-server/test/refund-retry-regression.cjs
if ($LASTEXITCODE -ne 0) { throw "Regression tests failed." }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "Diff check failed." }
```

No new environment secret is needed. Existing database, PayMongo and `PASABUY_CAMPUS_BOUNDS` settings remain required. Migration: `20261006100000_qa136_backend`.

## Featured listings: API contract for frontend

All paths below are relative to `/api/v1`.

| Method and path | Permission | Purpose |
|---|---|---|
| GET `/featured-listings/plans` | Public | Active plans; new monthly plans have `managedMonthly: true` and `durationMonths: 1..12` |
| GET `/featured-listings/plans/all` | ADMIN | Include disabled plans for administration |
| GET `/featured-listings/settings` | ADMIN | Current configuration and version |
| PATCH `/featured-listings/settings` | ADMIN | Update authoritative monthly fee, introductory discounts and renewal policy |
| POST/PATCH `/featured-listings/plans[/:id]` | ADMIN | Create/edit custom plans; monthly plan names/availability can be edited |
| POST `/featured-listings/quote` | VENDOR_OWNER | Current price, eligibility and actual vendor ledger balance; creates no reservation |
| POST `/featured-listings` | VENDOR_OWNER | Reserve frozen price/duration and pay with wallet or obtain PayMongo checkout |
| POST `/featured-listings/:id/checkout` | VENDOR_OWNER | Resume the same pending checkout |

Initial monthly price: PHP 100. Initial rank discounts: 30%, 20%, 10%, preserving existing defaults. Admin can change these; percentages range from 0 to 99. Zero disables a rank's discount without resetting claimed ranks. Twelve persisted monthly plans are seeded. Other existing placements/custom day-based plans remain supported.

Settings PATCH is a full configuration with optimistic version checking. Read settings first, then send:

```json
{
  "monthlyPrice": 100,
  "firstVendorDiscount": 30,
  "secondVendorDiscount": 20,
  "thirdVendorDiscount": 10,
  "discountOnRenewals": true,
  "version": 1
}
```

Every change is audited, atomically with updated monthly plan base prices. A stale `version` returns 409. Monthly plan prices/durations cannot be individually overridden through the custom-plan editor; use settings for their fee. Custom plan PATCH permits `name`, `price`, `durationDays`, `isActive`.

**Renewals are an explicit policy choice, not a confirmed first-purchase-only requirement.** `discountOnRenewals` initially defaults to true to avoid adding that restriction. Admin can choose false for first-purchase-only pricing before launch. Editing settings changes future purchases; it does not reset the first three vendor identities or alter a reserved checkout.

The first three distinct marketplace-home vendors receive persistent rank claims. Pending checkout reservations occupy slots, preventing competing purchases from taking the same rank. Successful claims remain after expiry/refund. Confirmed cancellation of an unpaid checkout releases its unconsumed claim. Migration backfills earlier paid vendors first, then open legacy discounted reservations into remaining slots. Existing legacy discounted prices are grandfathered, including duplicate tiers previously allowed by the old code; they are not repriced.

Quote and create body:

```json
{
  "planId": "UUID returned by the plans endpoint",
  "productId": "optional owned available product UUID",
  "paymentMethod": "WALLET",
  "expectedAmount": "70.00"
}
```

Omit `expectedAmount` when requesting a quote. Include the quote's amount when creating a purchase to reject a changed price with 409. No client-supplied fee, balance or discount is trusted. Quotes are previews, not reservations; another vendor may take the introductory slot before confirmation.

Creation requires `Idempotency-Key` (max 255 characters). Reuse it when retrying the same purchase, including after an uncertain HTTP result. Reusing it for a different plan/product/image/payment method returns 409. Persist that key until the result is known. A new key is a new purchase attempt.

Quote returns `baseAmount`, `discountAmount`, `discountPercent`, `discountEligible`, `introductoryRank`, `amount`, `currency`, `walletBalance`, `canPayWithWallet`, `settingsVersion`, duration and renewal policy. Wallet payment returns the resulting `walletBalance`. PayMongo checkout responses also include current `walletBalance`. Both use **VendorLedgerEntry**, matching the vendor ledger endpoint/dashboard; this is separate from the buyer's sandbox wallet.

Frontend must fetch a new quote on opening/changing the payment modal and refresh vendor ledger/dashboard after payment/payout. Use the response values instead of local hardcoded pricing or stale component balance. Show all active managed monthly plans for marketplace home; other placements use their own plans. Browser wallet fields alone cannot enforce balance safety.

Purchases and payouts lock the same vendor row. Pricing allocation/settings/webhook activation/cancellation share a PostgreSQL transaction advisory lock. Price, discount and duration are frozen at creation. Monthly expiry uses calendar months with month-end clamping; legacy plans retain day-based durations. PayMongo activates only after existing provider verification succeeds. Provider calls occur outside the database transaction.

An uncertain checkout creation retains `CREATING` instead of permitting a second provider session. Such reservations require operator reconciliation by payment reference; they are not automatically expired or blindly retried. No automatic reconciliation endpoint is added here.

## Pasabuy: API contract for frontend

`POST /pasabuy/requests/preview` (BUYER) accepts `orderId`, `dropoffLatitude`, `dropoffLongitude`, optional `dropoffLocation`. Numeric coordinate strings are normalized; empty/nonfinite/out-of-range coordinates are rejected. Human-readable labels are accepted alongside coordinates. Coordinates remain required for distance/fee calculation; this does not add a geocoding service.

Preview verifies order ownership and eligibility and returns normalized coordinates/location, `distanceMeters`, `recommendedRadiusMeters: 270`, `withinRecommendedRadius`, `requiresConfirmation`, `warning`, `inCampus`, `convenienceFee`, `feeTier`, `currency`. Missing labels become a displayable `latitude, longitude` string. Preview does not create a request or charge money.

At 270 metres the location remains inside. Beyond 270 metres the backend provides a caution rather than an unconditional rejection. Create through `POST /pasabuy/requests` with the same fields plus `termsAccepted: true`. For an outside location, explicitly include `outsideRadiusConfirmed: true`; otherwise HTTP 400 returns `code: OUTSIDE_RECOMMENDED_RADIUS` and assessment `details`. The server recalculates from coordinates when creating and audits the confirmation. Existing campus fee rules are preserved.

Frontend must populate its location input with preview/location data, show a live preview when coordinates change, and replace its former hardcoded beyond-270 rejection with the confirmation UI. A coordinate change requires a new preview/confirmation. This patch does not edit the location input or browser geolocation UI. Pasabuy legal text remains deferred per the issue.

## Group member management

- BUYER `POST /group-orders/:groupOrderId/leave`: leave own membership.
- BUYER `DELETE /group-orders/:groupOrderId/members/:userId`: initiator removes a member.
- Only OPEN groups permit removal/leave. Locked/finalized groups retain their payment participants.
- Owner cannot leave/remove themselves; use the existing group cancellation endpoint.
- Target participant becomes LEFT; only their unfinalized active group cart/items are deleted. Owner/other carts remain. Changes are audited and rolled back if audit persistence fails.
- Join, item edits, locking, cancellation, finalization and member removal lock the same parent group row. LEFT members may rejoin an OPEN group under existing join behavior; removal is not a permanent ban.
- Individual cart creation excludes group carts, and individual order creation cannot bypass group finalization using a group cart.

Frontend should refresh group/cart state after leave or removal. No new notification event is introduced.

## Vendor-related report response and appeal flow

1. Existing report creation and admin review resolve authoritative target relationships. Reports may relate to a vendor directly or through an owner, product, order, payment/subscription/featured listing or Pasabuy order.
2. ADMIN publishes a sanitized complaint/decision notice: `PATCH /reports/:id/vendor-notice`, body `{ "notice": "Vendor-facing explanation" }`. Admin must exclude buyer personal data/private evidence from that notice and review notes.
3. VENDOR_OWNER reads only their related published notices through `GET /reports/vendor/mine?page=1&limit=20` and `GET /reports/vendor/:id`.
4. Vendor sends `POST /reports/vendor/:id/responses`, body `{ "kind": "RESPONSE", "body": "Explanation/remedy" }` while OPEN/IN_REVIEW. One response per vendor/report.
5. For a RESOLVED report the related vendor can send one `kind: APPEAL` through the same endpoint. Dismissed reports cannot be appealed.
6. Admin detail `GET /reports/:id` includes vendor responses. ADMIN reviews a response: `PATCH /reports/:id/vendor-responses/:responseId`, body `{ "decision": "ACCEPTED", "note": "Reason" }` or REJECTED.
7. Accepting an appeal reopens the resolved report to IN_REVIEW with history/audit. Accepting a normal response does not close a report; the existing admin status endpoint controls its disposition. Vendor cannot resolve/dismiss their own case.

Unrelated vendors get 404. Vendor views never include reporter identity, the original description, private attachments, transaction secrets or another vendor's responses. Unpublished complaints remain admin-only. Notice/response/review changes are audited atomically; response text is not copied into generic audit records. Report status/review operations share the report row lock.

## Verification and remaining live checks

Prisma schema validation/generation, TypeScript compilation/typecheck, ESLint and the supplied regression suites were run against this patch. Regression harnesses use in-memory transaction mocks; HTTP permission tests run real Nest routes and JWT signature/role guards with signed test tokens and mocked user lookup. They do not prove live PostgreSQL lock behavior, the real login/user database, provider checkout delivery or frontend rendering.

Before merging, use an isolated test database and fixtures for:

- Apply migration; GET plans confirms exactly one active managed plan for each 1..12 month duration with expected base price; admin settings edit changes future quotes and creates an audit. Vendor/buyer edits must return 403.
- Race four funded distinct vendors buying marketplace home; check unique ranks 1/2/3 and regular fourth pricing. Race same-key submissions; check one payment/debit. Race two placements and payout against one balance; no negative vendor balance.
- Reserve PayMongo checkout, edit fee/discount/custom duration, then complete verified payment; original amount and duration remain. Retry webhook/payment; no repeated debit/claim.
- Preview and create owned Pasabuy at inside/boundary/outside points, requiring outside confirmation. Unowned order/invalid coordinates must fail. Check actual campus fee tiers.
- Race member removal with locking/item addition; inspect remaining cart and participants. After lock, leave/kick must fail without altering shares/orders.
- Create related/unrelated vendor report fixtures; verify private fields stay hidden, response/appeal permissions and admin reopen history/audit.

Coordinate preview and ranking tests can be run without payment-provider delivery. Shared teammates' database/PayMongo webhook work should be coordinated; do not disable their endpoints or replay other users' events for this test.

Frontend-only modal responsiveness/account routing/location-input rendering are outside this patch. Buyer cash-in and order-ID reports were already present. GitHub issue priority workflow is assigned to Ellyxr and `.github` was not included in the supplied source archive; it is not modified or claimed complete here.
