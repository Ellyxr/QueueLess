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
