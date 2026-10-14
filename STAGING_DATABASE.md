# Staging database: Neon PostgreSQL (US-052)

The staging API (`https://queueless-bg1x.onrender.com`, Render service
`queueless-api`, `APP_ENV=staging`) uses a managed, persistent Neon PostgreSQL
database through Prisma.

| Variable       | Neon connection                         | Used by                       |
| -------------- | --------------------------------------- | ----------------------------- |
| `DATABASE_URL` | **Pooled** (host contains `-pooler`)    | The running API (Prisma Client) |
| `DIRECT_URL`   | **Direct** (Connection pooling off)     | `prisma migrate deploy` only  |

Both must point at the **same Neon branch and database** and include
`?sslmode=require`. The API checks this at startup and refuses to boot if:

- either URL is missing (production/staging),
- `DIRECT_URL` uses the pooler (migrations can hang on advisory locks),
- the two URLs point at different Neon endpoints or databases,
- `sslmode=require` is missing for a remote host.

A `connect_timeout=15` is added to `DATABASE_URL` when it is not set, so the
first request after Neon suspends the compute does not time out.

## 1. Create the staging branch in Neon (recommended)

Keep staging data separate from local development data:

1. Neon Console → your project → **Branches** → **Create branch**.
2. Name `staging`, parent `main` (or the branch your `.env` uses), include data
   or start from schema only.
3. Select the `staging` branch → **Connect**:
   - Connection pooling **on** → copy as `DATABASE_URL`.
   - Connection pooling **off** → copy as `DIRECT_URL`.

## 2. Configure Render

Render → `queueless-api` → **Environment**:

```
NODE_ENV=production
APP_ENV=staging
DATABASE_URL=postgresql://...@ep-xxxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://...@ep-xxxx.<region>.aws.neon.tech/neondb?sslmode=require
```

Save → **Manual Deploy → Deploy latest commit**.

On every start, `start:render` runs `prisma migrate deploy` (over `DIRECT_URL`)
before the API starts, so new migrations in `prisma/migrations` are applied to
staging automatically. If a migration fails, the service does not start and the
previous deploy keeps serving.

## 3. Verify staging

**Readiness endpoint** (database reachable and all migrations applied):

```powershell
curl.exe https://queueless-bg1x.onrender.com/api/v1/health/ready
```

Expected (HTTP 200):

```json
{
  "status": "ok",
  "environment": "staging",
  "database": {
    "status": "ok",
    "endpoint": "ep-xxxx",
    "database": "neondb",
    "pooled": true,
    "migrations": { "total": 50, "applied": 50, "pending": [], "failed": [] }
  }
}
```

It returns **503** with `"status": "migrations-out-of-date"` if any migration is
pending or failed, and `"unreachable"` if the database cannot be reached.

**From your machine** (read-only, changes nothing). Put the staging URLs in
`artifacts/api-server/.env.staging` (gitignored), then:

```powershell
cd artifacts/api-server
pnpm db:verify -- --env-file .env.staging --strict
```

```
  PASS  config: app -> ep-xxxx-pooler... (pooled), database "neondb"
  PASS  config: migrations -> ep-xxxx... (direct)
  PASS  app (DATABASE_URL) connection: "neondb" (PostgreSQL 18.x) in 900ms
  PASS  migrations (DIRECT_URL) connection: "neondb" (PostgreSQL 18.x) in 1000ms
  PASS  migrations: 50/50 applied, latest 20261006100000_qa136_backend
```

**Persistence check:** create a record in the deployed app (e.g. register a
user), redeploy or restart the Render service, and confirm the record is still
there.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `prisma migrate deploy` hangs | `DIRECT_URL` is the pooled host. Use the direct host. |
| `P1001: Can't reach database server` | Neon compute is waking up or the URL is wrong; retry, check the branch is not deleted. |
| `P3009: migrate found failed migrations` | Fix the cause, then `npx prisma migrate resolve --rolled-back <name>` (or `--applied`) against `DIRECT_URL`, and redeploy. |
| `/health/ready` shows pending migrations | The service started without running migrations; check the Start Command is `pnpm --dir artifacts/api-server start:render`. |
| Startup error "point at different databases" | `DATABASE_URL` and `DIRECT_URL` were copied from different branches. |
