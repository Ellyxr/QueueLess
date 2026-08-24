# QueueLess

Foundation scaffold for a campus marketplace and delivery coordination platform.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the NestJS API server
- `pnpm --filter @workspace/frontend run dev` — run the Vite frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/api-server run prisma:validate` — validate the supplied Prisma schema
- Required backend env names: see `artifacts/api-server/.env.example`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: NestJS 11
- DB: PostgreSQL + Prisma 6
- Frontend: Vite + React + TypeScript + Tailwind + shadcn/ui

## Where things live

- `artifacts/frontend/` contains the default frontend route and shadcn/ui foundation.
- `artifacts/api-server/` contains the NestJS module scaffold and `prisma/schema.prisma`.
- `lib/` contains the existing shared workspace libraries.
- `.github/workflows/ci.yml` contains the pull-request foundation checks.

## Architecture decisions

- Feature workflows are intentionally deferred; current domain controllers are structural `501` placeholders.
- The supplied Prisma schema is copied verbatim and validated with Prisma 6 tooling.

## Product

Product capabilities will be added in later story-specific work.

## User preferences

Foundation-only scope: do not add feature UI or controller logic until the next story.

## Gotchas

- Run frontend/backend checks through their workspace package filters.
- Use the managed artifact workflows for preview startup.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
