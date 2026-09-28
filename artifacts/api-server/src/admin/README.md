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
