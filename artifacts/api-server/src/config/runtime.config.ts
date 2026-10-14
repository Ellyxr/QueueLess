// Runtime settings shared by the HTTP server and the Socket.IO server so both
// run in one process (one Render Web Service) with the same port and CORS rules.

export interface RuntimeConfig {
  isProduction: boolean;
  // Deployment label (staging, production, development), separate from NODE_ENV.
  appEnv: string;
  port: number;
  host: string;
  corsOrigins: string[];
}

const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';
const DEFAULT_PORT = 5000;

export function parseCorsOrigins(raw: string | undefined): string[] {
  const origins = (raw || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`CORS_ORIGIN contains an invalid URL: ${value}`);
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' ||
          url.search || url.hash || url.username || url.password || value.includes('*')) {
        throw new Error(`CORS_ORIGIN must contain HTTP(S) origins only: ${value}`);
      }
      return url.origin;
    });
  if (!origins.length) throw new Error('CORS_ORIGIN must include at least one origin');
  return [...new Set(origins)];
}

export function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535: ${raw}`);
  }
  return port;
}

export function resolveAppEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_ENV?.trim() || env.NODE_ENV || 'development';
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction) {
    // Fail fast instead of booting with the development JWT fallback secret
    // or without a database.
    const missing = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'CORS_ORIGIN'].filter(
      (key) => !env[key]?.trim(),
    );
    if (missing.length) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
  }

  return {
    isProduction,
    appEnv: resolveAppEnv(env),
    // Render injects PORT (default 10000) and routes traffic to it.
    port: parsePort(env.PORT),
    // Bind to all interfaces so Render's proxy can reach the process.
    host: '0.0.0.0',
    corsOrigins: parseCorsOrigins(env.CORS_ORIGIN),
  };
}
