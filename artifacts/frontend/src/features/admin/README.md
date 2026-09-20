Admin panel — accessible at `/admin`, `/admin/refunds`, `/admin/users` for the `admin` role
(guarded by `useRequireAuth(['admin'])` in `admin-shell.tsx`, same as `admin@queueless.com` /
`Password123!` seeded in `artifacts/api-server/prisma/seed.ts`).

- `admin-shell.tsx` — shared tab navigation (Dashboard / Refunds / Users).
- `admin-dashboard.tsx` — platform metrics + recent activity feed.
- `admin-refunds.tsx` — list of refund requests with approve/deny/mark-processed actions.
- `admin-users.tsx` — user list with role assignment, activate/deactivate, archive/unarchive,
  and a gated "manage email & password" dialog (locked unless the user has granted access).
- `admin-data.ts` — placeholder data + types for all of the above.

None of this is wired to a real backend yet — the api-server admin/refunds/user-management
endpoints are all unimplemented stubs. Every action on these pages only mutates local React
state. See `artifacts/api-server/AddressMe.md` for the backend work this needs.
