import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getMigrationStatus } from '../common/prisma/migration-status';
import { PrismaService } from '../common/prisma/prisma.service';
import { resolveAppEnv } from '../config/runtime.config';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Liveness: cheap, no external calls. Used as Render's healthCheckPath so a
  // slow/cold database does not cause Render to restart a healthy process.
  status() {
    return {
      status: 'ok',
      service: 'queueless-api',
      realtime: { namespace: '/realtime', path: '/socket.io' },
      environment: resolveAppEnv(),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  // Readiness: the database is reachable and every migration in this build
  // has been applied (no pending or failed migrations).
  async readiness() {
    const target = this.prisma.describeTarget();
    let latencyMs: number;
    let migrations: Awaited<ReturnType<typeof getMigrationStatus>>;
    try {
      const started = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      latencyMs = Date.now() - started;
      migrations = await getMigrationStatus(this.prisma);
    } catch (error) {
      this.logger.error(`Readiness check failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        status: 'error',
        database: { status: 'unreachable', ...target },
      });
    }

    const database = { status: 'ok', ...target, latencyMs, migrations };
    if (migrations.pending.length || migrations.failed.length) {
      throw new ServiceUnavailableException({
        ...this.status(),
        status: 'error',
        database: { ...database, status: 'migrations-out-of-date' },
      });
    }
    return { ...this.status(), database };
  }
}
