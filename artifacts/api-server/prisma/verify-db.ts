// Verifies a database environment end to end without changing it:
//   1. DATABASE_URL / DIRECT_URL are valid and point at the same Neon database
//   2. the pooled (app) connection works
//   3. the direct (migration) connection works
//   4. every migration in prisma/migrations is applied and none failed
//
// Usage (from artifacts/api-server):
//   pnpm db:verify                          uses .env
//   pnpm db:verify -- --env-file .env.staging --strict
// --strict applies the production rules (sslmode, DIRECT_URL required).
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getMigrationStatus } from '../src/common/prisma/migration-status';
import { loadDatabaseConfig, withConnectTimeout } from '../src/config/database.config';

const args = process.argv.slice(2);
const envFileIndex = args.indexOf('--env-file');
const envFile = envFileIndex >= 0 ? args[envFileIndex + 1] : '.env';
const strict = args.includes('--strict');

// Variables already set in the shell (e.g. on Render) win over the file.
dotenv.config({ path: path.resolve(__dirname, '..', envFile), quiet: true });

let failed = false;
const pass = (message: string) => console.log(`  PASS  ${message}`);
const fail = (message: string) => {
  failed = true;
  console.log(`  FAIL  ${message}`);
};

async function check(label: string, url: string) {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const started = Date.now();
    const [row] = await prisma.$queryRaw<{ database: string; version: string }[]>`
      SELECT current_database() AS database, current_setting('server_version') AS version`;
    pass(`${label} connection: "${row.database}" (PostgreSQL ${row.version}) in ${Date.now() - started}ms`);
    return prisma;
  } catch (error) {
    fail(`${label} connection: ${(error as Error).message.split('\n').filter(Boolean).at(-1)}`);
    await prisma.$disconnect();
    return null;
  }
}

async function main() {
  console.log(`Verifying database (${strict ? 'strict/production rules' : 'development rules'})`);

  const env = strict ? { ...process.env, NODE_ENV: 'production' } : process.env;
  const config = loadDatabaseConfig(env);
  if (!config) throw new Error('DATABASE_URL is not set');
  const { target, direct } = config;
  pass(`config: app -> ${target.host} (${target.pooled ? 'pooled' : 'direct'}), database "${target.database}"`);
  if (direct) pass(`config: migrations -> ${direct.host} (direct)`);
  else console.log('  WARN  DIRECT_URL is not set; Prisma Migrate will fail for this schema');
  for (const warning of config.warnings) console.log(`  WARN  ${warning}`);

  const app = await check('app (DATABASE_URL)', config.url);
  if (process.env.DIRECT_URL) {
    const migrator = await check('migrations (DIRECT_URL)', withConnectTimeout(process.env.DIRECT_URL));
    await migrator?.$disconnect();
  }

  if (app) {
    const status = await getMigrationStatus(app);
    if (status.failed.length) fail(`migrations: failed/unfinished: ${status.failed.join(', ')}`);
    if (status.pending.length) {
      fail(`migrations: ${status.pending.length} pending (run prisma migrate deploy): ${status.pending.join(', ')}`);
    }
    if (!status.failed.length && !status.pending.length) {
      pass(`migrations: ${status.applied}/${status.total} applied, latest ${status.latest}`);
    }
    await app.$disconnect();
  }
}

main()
  .catch((error) => fail((error as Error).message))
  .finally(() => {
    console.log(failed ? '\nDatabase verification FAILED' : '\nDatabase verification passed');
    process.exit(failed ? 1 : 0);
  });
