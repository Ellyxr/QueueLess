// US-052: staging/production database configuration rules. Runs against the
// compiled config (pnpm build first): node --test test/database-config-regression.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { loadDatabaseConfig } = require('../dist/config/database.config');
const { getMigrationStatus } = require('../dist/common/prisma/migration-status');

const POOLED = 'postgresql://u:p@ep-cool-name-123-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const DIRECT = 'postgresql://u:p@ep-cool-name-123.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const prod = (extra) => ({ NODE_ENV: 'production', DATABASE_URL: POOLED, DIRECT_URL: DIRECT, ...extra });

test('valid Neon staging config: pooled app URL, direct migration URL, same database', () => {
  const config = loadDatabaseConfig(prod());
  assert.equal(config.target.pooled, true);
  assert.equal(config.direct.pooled, false);
  assert.equal(config.target.database, 'neondb');
  assert.deepEqual(config.warnings, []);
  assert.equal(new URL(config.url).searchParams.get('connect_timeout'), '15');
});

test('an explicit connect_timeout is kept', () => {
  const config = loadDatabaseConfig(prod({ DATABASE_URL: `${POOLED}&connect_timeout=30` }));
  assert.equal(new URL(config.url).searchParams.get('connect_timeout'), '30');
});

test('production requires DATABASE_URL and DIRECT_URL', () => {
  assert.throws(() => loadDatabaseConfig({ NODE_ENV: 'production' }), /DATABASE_URL is required/);
  assert.throws(() => loadDatabaseConfig(prod({ DIRECT_URL: '' })), /DIRECT_URL is required/);
});

test('DIRECT_URL on the pooler is rejected (migrate deploy can hang)', () => {
  assert.throws(() => loadDatabaseConfig(prod({ DIRECT_URL: POOLED })), /non-pooled/);
});

test('DATABASE_URL and DIRECT_URL on different Neon branches/databases are rejected', () => {
  const otherBranch = DIRECT.replace('ep-cool-name-123', 'ep-other-branch-456');
  assert.throws(() => loadDatabaseConfig(prod({ DIRECT_URL: otherBranch })), /different databases/);
  const otherDb = DIRECT.replace('/neondb?', '/staging?');
  assert.throws(() => loadDatabaseConfig(prod({ DIRECT_URL: otherDb })), /different databases/);
});

test('production requires TLS for remote hosts', () => {
  const insecure = POOLED.replace('?sslmode=require', '');
  assert.throws(() => loadDatabaseConfig(prod({ DATABASE_URL: insecure })), /sslmode=require/);
});

test('direct Neon host for the app is allowed but warned about', () => {
  const config = loadDatabaseConfig(prod({ DATABASE_URL: DIRECT }));
  assert.match(config.warnings[0], /pooled/);
});

test('development and CI (local Postgres, no TLS) are accepted; no DATABASE_URL is allowed', () => {
  const ci = 'postgresql://postgres:postgres@localhost:5432/ci';
  assert.ok(loadDatabaseConfig({ DATABASE_URL: ci, DIRECT_URL: ci }));
  assert.equal(loadDatabaseConfig({}), null);
});

test('malformed URLs are rejected without echoing credentials', () => {
  assert.throws(() => loadDatabaseConfig({ DATABASE_URL: 'mysql://u:secret@h/db' }), (error) => {
    assert.match(error.message, /postgresql:\/\//);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  assert.throws(() => loadDatabaseConfig({ DATABASE_URL: 'postgresql://u:p@host' }), /database name/);
});

test('migration status reports pending, failed and applied migrations', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'migrations-'));
  for (const name of ['001_init', '002_add', '003_new']) mkdirSync(path.join(dir, name));
  const now = new Date();
  const rows = [
    { migration_name: '001_init', finished_at: now, rolled_back_at: null },
    { migration_name: '002_add', finished_at: null, rolled_back_at: null },
  ];
  let call = 0;
  const prisma = { $queryRaw: async () => (call++ === 0 ? [{ exists: true }] : rows) };
  const status = await getMigrationStatus(prisma, dir);
  assert.deepEqual(status, {
    total: 3, applied: 1, latest: '001_init', pending: ['002_add', '003_new'], failed: ['002_add'],
  });
});

test('migration status on an empty database lists everything as pending', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'migrations-'));
  mkdirSync(path.join(dir, '001_init'));
  const prisma = { $queryRaw: async () => [{ exists: false }] };
  const status = await getMigrationStatus(prisma, dir);
  assert.deepEqual(status.pending, ['001_init']);
  assert.equal(status.latest, null);
});
