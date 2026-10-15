import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DatabaseConfig, loadDatabaseConfig } from '../../config/database.config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly database: DatabaseConfig | null;

  constructor() {
    // Validates DATABASE_URL/DIRECT_URL and adds a connect timeout that
    // tolerates Neon waking a suspended compute.
    const database = loadDatabaseConfig();
    super(database ? { datasourceUrl: database.url } : undefined);
    this.database = database;
  }

  async onModuleInit() {
    if (!this.database) return;
    for (const warning of this.database.warnings) this.logger.warn(warning);

    const { host, database, pooled } = this.database.target;
    const started = Date.now();
    await this.$connect();
    this.logger.log(
      `Connected to PostgreSQL "${database}" on ${host} ` +
        `(${pooled ? 'pooled' : 'direct'}) in ${Date.now() - started}ms`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Public (health endpoint): Neon endpoint id and database name only, never
  // the full host or credentials. Enough to tell which Neon branch is in use.
  describeTarget() {
    if (!this.database) return null;
    const { endpoint, database, pooled } = this.database.target;
    return { endpoint: endpoint.split('.')[0], database, pooled };
  }
}
