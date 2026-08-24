---
name: Prisma schema tooling
description: Compatibility note for the supplied QueueLess Prisma schema and migration foundation.
---

The supplied QueueLess schema must be handled with Prisma 6 tooling while it retains its current datasource declaration.

**Why:** Prisma 7 moved datasource connection configuration out of the schema file, which conflicts with the requirement to copy this planning schema verbatim.

**How to apply:** Keep the schema unchanged unless the product explicitly approves a Prisma migration. Use Prisma 6 for validation and client generation in the foundation stage.