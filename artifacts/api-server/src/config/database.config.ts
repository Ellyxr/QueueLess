// Validates the Prisma connection strings before anything connects, so a
// misconfigured staging/production deploy fails at boot with a clear message
// instead of hanging on `prisma migrate deploy` or at the first query.
//
// Neon layout:
//   DATABASE_URL -> pooled endpoint (host contains "-pooler"), used by the app
//   DIRECT_URL   -> direct endpoint, used only by Prisma Migrate
// Both must point at the same Neon endpoint and database, otherwise
// migrations run against one database while the app reads another.

export interface DatabaseTarget {
  host: string;
  endpoint: string;
  database: string;
  pooled: boolean;
}

export interface DatabaseConfig {
  url: string;
  target: DatabaseTarget;
  direct: DatabaseTarget | null;
  warnings: string[];
}

// Neon suspends idle compute; waking it can take a few seconds, which is
// longer than the driver's default connect timeout.
export const DEFAULT_CONNECT_TIMEOUT_SECONDS = '15';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);
const SECURE_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);

function parsePostgresUrl(name: string, raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${name} must be a postgresql:// connection string`);
  }
  if (!url.hostname) throw new Error(`${name} is missing a host`);
  if (url.pathname.length <= 1) throw new Error(`${name} is missing a database name`);
  return url;
}

export function describeDatabaseUrl(url: URL): DatabaseTarget {
  const host = url.hostname;
  const pooled = host.includes('-pooler.');
  return {
    host,
    // ep-xxx-pooler.region.aws.neon.tech and ep-xxx.region.aws.neon.tech are
    // the same Neon endpoint.
    endpoint: host.replace('-pooler.', '.'),
    database: decodeURIComponent(url.pathname.slice(1)),
    pooled,
  };
}

function isLocal(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}

export function withConnectTimeout(raw: string): string {
  const url = new URL(raw);
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', DEFAULT_CONNECT_TIMEOUT_SECONDS);
  }
  return url.toString();
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig | null {
  const isProduction = env.NODE_ENV === 'production';
  const rawUrl = env.DATABASE_URL?.trim();
  const rawDirect = env.DIRECT_URL?.trim();

  if (!rawUrl) {
    if (isProduction) throw new Error('DATABASE_URL is required in production');
    return null;
  }

  const url = parsePostgresUrl('DATABASE_URL', rawUrl);
  const target = describeDatabaseUrl(url);
  const warnings: string[] = [];

  if (isProduction && !rawDirect) {
    throw new Error('DIRECT_URL is required in production (Prisma Migrate uses it)');
  }

  let direct: DatabaseTarget | null = null;
  if (rawDirect) {
    const directUrl = parsePostgresUrl('DIRECT_URL', rawDirect);
    direct = describeDatabaseUrl(directUrl);

    if (direct.pooled) {
      throw new Error(
        'DIRECT_URL must use the direct (non-pooled) Neon host; the pooled ' +
          'connection can hold migration advisory locks and hang `prisma migrate deploy`',
      );
    }
    if (direct.endpoint !== target.endpoint || direct.database !== target.database) {
      throw new Error(
        `DATABASE_URL (${target.endpoint}/${target.database}) and DIRECT_URL ` +
          `(${direct.endpoint}/${direct.database}) point at different databases`,
      );
    }
    if (isProduction && !isLocal(direct.host) &&
        !SECURE_SSL_MODES.has(directUrl.searchParams.get('sslmode') ?? '')) {
      throw new Error('DIRECT_URL must set sslmode=require in production');
    }
  }

  if (isProduction && !isLocal(target.host)) {
    if (!SECURE_SSL_MODES.has(url.searchParams.get('sslmode') ?? '')) {
      throw new Error('DATABASE_URL must set sslmode=require in production');
    }
    if (!target.pooled && target.host.endsWith('.neon.tech')) {
      warnings.push(
        'DATABASE_URL uses the direct Neon host; use the pooled ("-pooler") host for the app',
      );
    }
  }

  return { url: withConnectTimeout(rawUrl), target, direct, warnings };
}
