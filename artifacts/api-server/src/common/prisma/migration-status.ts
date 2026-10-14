import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

// <api-server>/prisma/migrations, from both src/common/prisma and dist/common/prisma.
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../prisma/migrations');

export interface MigrationStatus {
  total: number;
  applied: number;
  latest: string | null;
  pending: string[];
  failed: string[];
}

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export function listMigrationFolders(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// Compares the migrations shipped with this build to `_prisma_migrations`.
// Pending = in the repo but not applied; failed = started but never finished
// (Prisma Migrate refuses to deploy until these are resolved).
export async function getMigrationStatus(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  dir = MIGRATIONS_DIR,
): Promise<MigrationStatus> {
  const expected = listMigrationFolders(dir);

  const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "exists"`;
  const rows = exists
    ? await prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`
    : [];

  const applied = new Set(
    rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name),
  );
  const failed = rows
    .filter((row) => !row.finished_at && !row.rolled_back_at)
    .map((row) => row.migration_name)
    .sort();
  const pending = expected.filter((name) => !applied.has(name));
  const appliedExpected = expected.filter((name) => applied.has(name));

  return {
    total: expected.length,
    applied: appliedExpected.length,
    latest: appliedExpected.at(-1) ?? null,
    pending,
    failed,
  };
}
