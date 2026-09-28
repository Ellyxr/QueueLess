# Admin user management (US-045)

All `/api/v1/admin/users` routes require a current access token and an active
`ADMIN` role. The JWT strategy loads the account's current status and roles on
every request, so deactivation, archiving and role revocation take effect for
existing access tokens.

| Route | Purpose |
| --- | --- |
| `GET /admin/users?search=&role=` | List users; emails are visible only after the user grants data access. |
| `GET /admin/users/:id` | Get one user with the same consent-aware response. |
| `GET /admin/users/:id/audit?page=1&limit=20` | Get user-management audit records (limit 1–100). |
| `POST /admin/users` | Create an account and initial role. |
| `PATCH /admin/users/:id/roles` | Change active roles. |
| `PATCH /admin/users/:id/status` | Activate, deactivate, archive, or unarchive. |
| `PATCH /admin/users/:id/email` | Change email if sensitive-data consent is active. |
| `PATCH /admin/users/:id/password` | Set password if sensitive-data consent is active. |

Every effective user-management change writes a `User` audit record in the same
database transaction. Passwords and password hashes are never included in the
audit record. Email and password changes require current consent at write time.
Role and status changes protect the acting admin account and the last active
administrator; concurrent changes run in serializable transactions. Unchanged
role or status requests return the current user without another audit event.

## Vendor participation (US-046)

New vendor registrations start in `PENDING_APPROVAL`. Existing vendors retain their current status. An administrator can approve an eligible vendor by changing its status to `ACTIVE`.

All `/api/v1/admin/vendors` routes use the same current `ADMIN` role guard.
`GET /admin/vendors` retains its array response and supports optional `status`,
`vendorType`, and `search` filters. `GET /admin/vendors/:id` includes owner
eligibility and store counts without exposing owner email. The paginated
`GET /admin/vendors/:id/audit?page=1&limit=20` returns participation changes.

`PATCH /admin/vendors/:id/status` accepts `ACTIVE`, `SUSPENDED`, or
`PENDING_APPROVAL` and an optional `reason` (3–500 characters). Activating a
store requires its owner to have an active, unarchived account and a current
vendor role. A successful change and its `VENDOR_APPROVED` or
`VENDOR_STATUS_UPDATED` audit record commit together. Repeating the current
status returns 409 and does not add an audit entry. Public vendor discovery
already returns only `ACTIVE` stores.

## Transaction monitoring (US-047)

All routes require a current `ADMIN` role. `GET /admin/transactions` returns
payments in descending creation order with `page` (default 1), `limit`
(default 20, maximum 100), `total`, and `totalPages`. Filter by `status`,
`purpose`, `provider`, `payerUserId`, `vendorId`, `orderId`, `from`, and `to`.
Dates are inclusive ISO-8601 instants; a reversed range returns 400. An order
filter matches order-share payments and Pasabuy payments with a related order.
The vendor filter also covers subscription and featured-listing payments.

`GET /admin/transactions/summary` uses the same filters and groups payment
counts and amounts by purpose, status, and currency. `GET /admin/transactions/:id`
returns a single payment. Amounts are decimal strings. Both list and detail
include the payer's ID/name and selected linked order, Pasabuy, subscription,
or featured-listing data. Responses exclude payer contact information,
checkout URLs, and PayMongo resource IDs. No payment mutation is exposed.
