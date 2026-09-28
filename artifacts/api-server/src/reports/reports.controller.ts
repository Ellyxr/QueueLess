import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List and filter reports for administrator review' })
  @ApiResponse({ status: 200, description: 'Paginated reports' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  list(@Query() query: ListReportsDto) {
    return this.reports.list(query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get report details for administrator review' })
  @ApiResponse({ status: 200, description: 'Report details' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.detail(id);
  }

  @Post()
  @ApiOperation({ summary: 'Report a vendor, user, order, transaction, product, or Pasabuy request' })
  @ApiResponse({ status: 201, description: 'Report opened for review' })
  @ApiResponse({ status: 400, description: 'Invalid category, description, or target' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 404, description: 'Target not found or not accessible to the reporter' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateReportDto) {
    return this.reports.create(user.sub, dto);
  }
}
