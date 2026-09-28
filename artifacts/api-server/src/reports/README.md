# Report creation (US-039)

Authenticated users can `POST /api/v1/reports` with `targetType`, `targetId`,
`category`, and `description`. Targets are `VENDOR`, `USER`, `ORDER`,
`TRANSACTION` (a `Payment.id`), `PRODUCT`, or `PASABUY`. The server stores the
report with `OPEN` status and the authenticated reporter's user ID.

Orders are accessible to their buyer, vendor owner, or group participant;
payments to their payer or associated vendor owner; and Pasabuy requests to
their requester or assigned fulfiller. Other targets must exist. Target IDs
that do not exist or are private to another user return 404.

`POST /api/v1/pasabuy/requests/:id/report` remains the Pasabuy dispute workflow:
it creates a report and also changes the Pasabuy request to `DISPUTED`. The
generic reports endpoint records an issue for review without changing the
target's lifecycle.

## Admin review (US-040)

Only users with the `ADMIN` role may access `GET /api/v1/reports` and
`GET /api/v1/reports/:id`. The list accepts optional `status` (`OPEN`,
`IN_REVIEW`, `RESOLVED`, `DISMISSED`), exact `category`, and `targetType`
(`VENDOR`, `USER`, `ORDER`, `TRANSACTION`, `PRODUCT`, `PASABUY`). `page` defaults
to 1 and `limit` to 20, with a maximum of 100. It returns `{ items, page,
limit, total, totalPages }`, sorted newest first (ID breaks timestamp ties).
The detail route returns reporter and target summaries and status history.

## Admin resolution (US-041)

Administrators can `PATCH /api/v1/reports/:id/status` with `status` set to
`IN_REVIEW`, `RESOLVED`, or `DISMISSED`, and an optional `note`. Resolving or
dismissing requires a nonblank note explaining the outcome. Reports may move
from `OPEN` to any of these states, or from `IN_REVIEW` to `RESOLVED` or
`DISMISSED`. Resolved and dismissed reports are final. A successful update
atomically records the administrator, status, note, and timestamp in
`ReportStatusHistory` and writes an `AuditRecord`. Conflicting transitions
return 409; missing reports return 404. The response includes the updated
report and its full status history.
