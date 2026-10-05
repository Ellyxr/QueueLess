# QA #136: admin featured listing purchases

This follow-up adds the missing read-only administrator purchase list. Apply it after the original QA #136 backend patch, including the advisory-lock `::text` correction. No database migration is required.

## Route

`GET /api/v1/featured-listings/all`

Requires a valid JWT and the ADMIN role. Unauthenticated requests return 401; buyers and vendor owners return 403. This endpoint lists purchases from all vendors, including inactive/suspended vendors and pending, active, expired or cancelled listings. It does not expire listings, reserve promotion slots, create payments or debit wallets.

Query parameters:

| Parameter | Default | Validation |
| --- | --- | --- |
| page | 1 | Positive integer; excessively large offsets rejected |
| limit | 20 | Integer from 1 to 100 |
| status | All | FeaturedListingStatus enum |
| placement | All | FeaturedListingPlacement enum |
| vendorId | All | Vendor UUID |
| planId | All | Plan UUID |

Example: `/api/v1/featured-listings/all?page=1&limit=20&status=PENDING&placement=MARKETPLACE_HOME`.

Response: `{ items, total, page, limit }`. Items include listing ID/status/placement/dates, vendor ID/name/status/type, optional product, optional current plan, reserved duration snapshots, settings version, pricePaid, discountPercent, imageUrl and payment ID/provider/status/amount/currency/createdAt. Sorting is createdAt descending, then ID descending. Count and rows use the same filters in one repeatable-read transaction.

The response excludes provider payloads, checkout URLs, provider session/payment identifiers, idempotency keys, fingerprints, bank details and vendor-owner contact information. The current plan's price can change; use the listing's pricePaid/payment amount and duration snapshot when displaying purchased terms. Legacy listings may have null snapshot fields.

## Existing endpoints retained

- `GET /featured-listings/plans`: public active plans.
- `GET /featured-listings/plans/all`: admin all plans, not purchases.
- `GET /featured-listings/settings`: admin pricing/discount configuration.
- `PATCH /featured-listings/settings`: admin monthly pricing and introductory discount edits, with version checks and auditing.
- `PATCH /featured-listings/plans/:id`: admin custom plan name/price/duration/active edits. Managed monthly plans permit name/active edits; prices come from central settings and months remain the fixed 1–12 catalogue.
- `GET /featured-listings/mine`: vendor's own listings.
- `GET /featured-listings`: public currently visible placements.

## Verification

Typecheck, build compilation and lint of changed TypeScript files passed. All 76 tests across the five backend regression suites passed (72 existing plus 4 admin-list tests). New coverage includes filters/pagination, matching counts, safe field selection, empty results, invalid parameters and real Nest HTTP requests using signed test JWTs with mocked user/database lookups. PostgreSQL-backed HTTP verification remains to be run on the developer's local server.

Run after building:

```powershell
node --test artifacts/api-server/test/featured-admin-list-regression.cjs
if ($LASTEXITCODE -ne 0) { throw "Admin listing regression failed." }
```

No frontend changes are included. The admin UI should distinguish all plans from all purchases and pass query parameters to this route.
