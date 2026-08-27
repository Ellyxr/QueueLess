# QueueLess backend

NestJS foundation for the QueueLess API. Domain modules are scaffolded with placeholder routes only; feature behavior is intentionally deferred.

## Commands

- `pnpm --filter @workspace/api-server run dev`
- `pnpm --filter @workspace/api-server run build`
- `pnpm --filter @workspace/api-server run prisma:validate`

## Prerequisites

* Node.js
* pnpm
* Git
* Access to the QueueLess PostgreSQL database

## Installation

From the QueueLess repository root:

```bash
pnpm install
```

## Environment Configuration

Create:

```text
artifacts/api-server/.env
```

Use `artifacts/api-server/.env.example` as the template.

The backend environment variables are:

```env
NODE_ENV=
PORT=
DATABASE_URL=
CORS_ORIGIN=
JWT_SECRET=
JWT_EXPIRES_IN=15m
PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=
```

Never commit `.env` or real secrets to Git.

The `.env.example` file should contain variable names and safe placeholder values only.

## Prisma

Generate the Prisma client:

```bash
pnpm --filter @workspace/api-server run prisma:generate
```

Validate the Prisma schema:

```bash
pnpm --filter @workspace/api-server run prisma:validate
```

Run database migrations when required by the repository:

```bash
pnpm --filter @workspace/api-server exec prisma migrate deploy
```

Seed the database when seed data is required:

```bash
pnpm --filter @workspace/api-server run prisma:seed
```

## Development

Start the backend:

```bash
pnpm --filter @workspace/api-server run dev
```

The API runs on:

```text
http://localhost:5000
```

The API base path is:

```text
http://localhost:5000/api/v1
```

## Health Check

With the backend running, open:

```text
http://localhost:5000/api/v1/health
```

Expected response:

```text
ok
```

## Swagger

Swagger API documentation:

```text
http://localhost:5000/api/v1/docs
```

## Validation and Build

TypeScript type checking:

```bash
pnpm --filter @workspace/api-server run typecheck
```

Lint:

```bash
pnpm --filter @workspace/api-server run lint
```

Build:

```bash
pnpm --filter @workspace/api-server run build
```

Prisma validation:

```bash
pnpm --filter @workspace/api-server run prisma:validate
```

## Backend Structure

```text
artifacts/api-server/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── admin/
│   ├── auth/
│   ├── carts/
│   ├── common/
│   ├── config/
│   ├── health/
│   ├── orders/
│   ├── payments/
│   ├── products/
│   ├── users/
│   ├── vendors/
│   └── ...
├── .env.example
├── package.json
├── nest-cli.json
├── tsconfig.json
└── README.md
```

## Git Branch Workflow

Backend work should be developed on a dedicated User Story branch.

Create a branch from the latest `main`:

```bash
git checkout main
git pull origin main
git checkout -b <user-story-branch>
```

Check your changes:

```bash
git status
```

Stage and commit:

```bash
git add .
git commit -m "feat: complete US-# work"
```

Push the branch:

```bash
git push -u origin <user-story-branch>
```

Create a Pull Request targeting `main`.

Changes should be reviewed and required checks should pass before merging into `main`.

## US-001 Backend Setup Verification

The backend setup for US-001 was verified with:

* Prisma schema validation
* TypeScript type checking
* NestJS build
* Backend development server startup
* Health endpoint

Verification result:

```text
GET /api/v1/health -> ok
```

Current branch for this work:

```text
US-001-Backend-Setup
```
