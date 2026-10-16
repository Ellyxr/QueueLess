// BUG-004 / TC-014: proves the migrations build the database from nothing.
//   1. the target database is clean (no tables, types or migration history)
//   2. the initial migration applies on its own and creates every table and
//      enum it declares
//   3. every later migration applies on top, none is pending or failed
//   4. the result matches schema.prisma (no drift)
//
// Usage (from artifacts/api-server):
//   pnpm db:verify:clean -- --url <url of an EMPTY database>
//   pnpm db:verify:clean -- --temp-db   creates a throwaway database on the
//       DIRECT_URL server (.env or shell), verifies it, then drops it
// It refuses to touch a database that already has tables or types.
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { withConnectTimeout } from '../src/config/database.config';

const PRISMA_DIR = __dirname;
const MIGRATIONS_DIR = path.join(PRISMA_DIR, 'migrations');
const PRISMA_CLI = require.resolve('prisma/build/index.js');

export function migrationNames(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort();
}

// Tables and enums the initial migration creates, read from its SQL.
export function declaredObjects(sql: string): { tables: string[]; enums: string[] } {
  const names = (pattern: RegExp) => [...sql.matchAll(pattern)].map((match) => match[1]).sort();
  return {
    tables: names(/^CREATE TABLE "([^"]+)"/gm),
    enums: names(/^CREATE TYPE "([^"]+)" AS ENUM/gm),
  };
}

export function tempDatabaseUrl(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

let failed = false;
const pass = (message: string) => console.log(`  PASS  ${message}`);
const fail = (message: string) => {
  failed = true;
  console.log(`  FAIL  ${message}`);
};
const lastLine = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean).at(-1) ?? '';

function prisma(args: string[], url: string) {
  return spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: path.resolve(PRISMA_DIR, '..'),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: 'utf8',
  });
}

async function userObjects(db: PrismaClient) {
  const [row] = await db.$queryRaw<{ tables: number; types: number }[]>`
    SELECT
      (SELECT count(*)::int FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')) AS tables,
      (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e') AS types`;
  return row;
}

async function verify(url: string) {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const before = await userObjects(db);
    if (before.tables || before.types) {
      fail(`database is not clean (${before.tables} tables, ${before.types} enums); refusing to migrate it`);
      return;
    }
    pass('database is clean (no tables, enums or migration history)');

    // Step 1: only the initial migration, staged next to a copy of the schema.
    const [initial, ...rest] = migrationNames();
    const stage = mkdtempSync(path.join(tmpdir(), 'queueless-init-'));
    try {
      cpSync(path.join(PRISMA_DIR, 'schema.prisma'), path.join(stage, 'schema.prisma'));
      cpSync(path.join(MIGRATIONS_DIR, 'migration_lock.toml'), path.join(stage, 'migrations', 'migration_lock.toml'));
      cpSync(path.join(MIGRATIONS_DIR, initial), path.join(stage, 'migrations', initial), { recursive: true });
      const deploy = prisma(['migrate', 'deploy', '--schema', path.join(stage, 'schema.prisma')], url);
      if (deploy.status !== 0) {
        fail(`initial migration ${initial}: ${lastLine(deploy.stderr || deploy.stdout)}`);
        return;
      }
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }

    const [record] = await db.$queryRaw<{ finished: boolean; rolled_back: boolean }[]>`
      SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
      FROM _prisma_migrations WHERE migration_name = ${initial}`;
    if (!record?.finished || record.rolled_back) {
      fail(`initial migration ${initial} is not recorded as finished`);
      return;
    }
    const declared = declaredObjects(readFileSync(path.join(MIGRATIONS_DIR, initial, 'migration.sql'), 'utf8'));
    const tables = new Set(
      (await db.$queryRaw<{ name: string }[]>`
        SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'`).map((r) => r.name),
    );
    const enums = new Set(
      (await db.$queryRaw<{ name: string }[]>`
        SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'`).map((r) => r.name),
    );
    const missing = [
      ...declared.tables.filter((name) => !tables.has(name)),
      ...declared.enums.filter((name) => !enums.has(name)),
    ];
    if (missing.length) {
      fail(`initial migration ${initial}: missing ${missing.join(', ')}`);
      return;
    }
    pass(`initial migration ${initial} applied: ${declared.tables.length} tables, ${declared.enums.length} enums`);

    // Step 2: the rest of the history on top, then status and drift.
    const deployAll = prisma(['migrate', 'deploy'], url);
    if (deployAll.status !== 0) {
      fail(`later migrations: ${lastLine(deployAll.stderr || deployAll.stdout)}`);
      return;
    }
    pass(`later migrations applied: ${rest.length} on top of ${initial}`);

    const status = prisma(['migrate', 'status'], url);
    if (status.status === 0) pass(`migration status: all ${rest.length + 1} applied, none pending or failed`);
    else fail(`migration status: ${lastLine(status.stdout || status.stderr)}`);

    const diff = prisma(
      ['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'],
      url,
    );
    if (diff.status === 0) pass('schema drift: none (migrated database matches schema.prisma)');
    else fail(`schema drift: migrated database differs from schema.prisma\n${diff.stdout}${diff.stderr}`);
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf('--url');
  dotenv.config({ path: path.resolve(PRISMA_DIR, '..', '.env'), quiet: true });

  if (urlIndex >= 0) {
    console.log('Verifying migrations on a clean database (TC-014)');
    await verify(withConnectTimeout(args[urlIndex + 1]));
    return;
  }
  if (!args.includes('--temp-db')) {
    throw new Error('pass --url <empty database url> or --temp-db');
  }

  const server = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!server) throw new Error('--temp-db needs DIRECT_URL (or DATABASE_URL) to reach the server');
  const name = `queueless_clean_check_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: withConnectTimeout(server) });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    console.log(`Verifying migrations on a clean database (TC-014), temporary database "${name}"`);
    try {
      await verify(withConnectTimeout(tempDatabaseUrl(server, name)));
    } finally {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      console.log(`  INFO  dropped temporary database "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }
}

if (require.main === module) {
  main()
    .catch((error) => fail((error as Error).message.split('\n').filter(Boolean).at(-1) ?? String(error)))
    .finally(() => {
      console.log(failed ? '\nClean migration verification FAILED' : '\nClean migration verification passed');
      process.exit(failed ? 1 : 0);
    });
}
