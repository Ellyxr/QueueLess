import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // GET /api/v1/health — Render health check (liveness)
  @Get()
  getHealth() {
    return this.healthService.status();
  }

  // GET /api/v1/health/ready — database connectivity check
  @Get('ready')
  getReadiness() {
    return this.healthService.readiness();
  }
}
