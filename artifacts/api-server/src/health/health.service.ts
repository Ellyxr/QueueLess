import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness: cheap, no external calls. Used as Render's healthCheckPath so a
  // slow/cold database does not cause Render to restart a healthy process.
  status() {
    return {
      status: 'ok',
      service: 'queueless-api',
      realtime: { namespace: '/realtime', path: '/socket.io' },
      environment: process.env.NODE_ENV ?? 'development',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  // Readiness: confirms the database is reachable.
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
    return { ...this.status(), database: 'ok' };
  }
}
