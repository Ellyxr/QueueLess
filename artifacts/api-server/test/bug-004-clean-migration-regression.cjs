// BUG-004 / TC-014: the clean-database migration check (prisma/verify-clean-migration.ts).
// The end-to-end run needs PostgreSQL and happens in CI (migrations job); these
// cover the parts that decide what is checked: node --test test/bug-004-clean-migration-regression.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
require('tsx/cjs/api').register();
const { migrationNames, declaredObjects, tempDatabaseUrl } = require('../prisma/verify-clean-migration.ts');

const MIGRATIONS = path.resolve(__dirname, '../prisma/migrations');
const TSX_CLI = require.resolve('tsx/cli');

test('the initial migration is the first in the history and every migration has SQL', () => {
  const names = migrationNames();
  assert.equal(names[0], '20260824083804_init');
  assert.ok(names.length > 1);
  assert.deepEqual(names, [...names].sort());
  for (const name of names) assert.ok(existsSync(path.join(MIGRATIONS, name, 'migration.sql')), name);
});

test('the initial migration declares the foundation tables and enums', () => {
  const { tables, enums } = declaredObjects(readFileSync(path.join(MIGRATIONS, '20260824083804_init', 'migration.sql'), 'utf8'));
  assert.equal(tables.length, 28);
  assert.equal(enums.length, 20);
  for (const table of ['users', 'vendors', 'products', 'orders', 'order_items', 'payments']) {
    assert.ok(tables.includes(table), table);
  }
  assert.ok(enums.includes('UserRole'));
  assert.ok(enums.includes('OrderStatus'));
});

test('declaredObjects reads only CREATE TABLE and CREATE TYPE ... AS ENUM', () => {
  const sql = [
    'CREATE TYPE "Mood" AS ENUM (\'HAPPY\');',
    'CREATE TABLE "a" ("id" TEXT);',
    'CREATE INDEX "a_idx" ON "a"("id");',
    '-- CREATE TABLE "commented"',
    'ALTER TABLE "a" ADD CONSTRAINT "x" FOREIGN KEY ("id") REFERENCES "b"("id");',
    'CREATE TABLE "b" ("id" TEXT);',
  ].join('\n');
  assert.deepEqual(declaredObjects(sql), { tables: ['a', 'b'], enums: ['Mood'] });
});

test('the temporary database URL keeps the server, credentials and options', () => {
  const url = new URL(tempDatabaseUrl('postgresql://u:p@host.example:5432/neondb?sslmode=require', 'queueless_clean_check_1'));
  assert.equal(url.host, 'host.example:5432');
  assert.equal(url.username, 'u');
  assert.equal(url.password, 'p');
  assert.equal(url.pathname, '/queueless_clean_check_1');
  assert.equal(url.searchParams.get('sslmode'), 'require');
});

test('without --url or --temp-db it refuses to run', () => {
  const run = spawnSync(process.execPath, [TSX_CLI, 'prisma/verify-clean-migration.ts'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /pass --url <empty database url> or --temp-db/);
  assert.match(run.stdout, /FAILED/);
});
