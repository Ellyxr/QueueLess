import { VendorReportsService } from './vendor-reports.service';
import { ReviewVendorResponseDto, VendorReportNoticeDto, VendorReportResponseDto } from './dto/vendor-report.dto';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly vendorReports: VendorReportsService) {}

  @Get('vendor/mine')
  @UseGuards(RolesGuard) @Roles('VENDOR_OWNER')
  vendorMine(@CurrentUser() user: JwtPayload, @Query() query: ListReportsDto) {
    return this.vendorReports.mine(user.sub, query.page ?? 1, query.limit ?? 20);
  }

  @Get('vendor/:id')
  @UseGuards(RolesGuard) @Roles('VENDOR_OWNER')
  vendorDetail(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.vendorReports.detail(user.sub, id);
  }

  @Post('vendor/:id/responses')
  @UseGuards(RolesGuard) @Roles('VENDOR_OWNER')
  vendorRespond(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorReportResponseDto) {
    return this.vendorReports.respond(user.sub, id, dto);
  }

  @Patch(':id/vendor-notice')
  @UseGuards(RolesGuard) @Roles('ADMIN')
  publishVendorNotice(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorReportNoticeDto) {
    return this.vendorReports.publishNotice(user.sub, id, dto.notice);
  }

  @Patch(':id/vendor-responses/:responseId')
  @UseGuards(RolesGuard) @Roles('ADMIN')
  reviewVendorResponse(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string,
    @Param('responseId', ParseUUIDPipe) responseId: string, @Body() dto: ReviewVendorResponseDto) {
    return this.vendorReports.review(user.sub, id, responseId, dto);
  }

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

  @Get(':id/attachment')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get a short-lived private URL for a report attachment' })
  @ApiResponse({ status: 200, description: 'Attachment URL valid for 5 minutes' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  @ApiResponse({ status: 404, description: 'Report or attachment not found' })
  attachment(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.attachment(id);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Review, resolve, or dismiss a report' })
  @ApiResponse({ status: 200, description: 'Updated report with status history' })
  @ApiResponse({ status: 400, description: 'Invalid status or missing outcome note' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiResponse({ status: 409, description: 'Invalid or concurrent status transition' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateReportStatusDto,
  ) {
    return this.reports.updateStatus(id, user.sub, dto);
  }

  @Post()
  @UseInterceptors(FileInterceptor('attachment', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['targetType', 'category', 'description'], properties: {
    targetType: { type: 'string', enum: ['VENDOR', 'USER', 'ORDER', 'TRANSACTION', 'PRODUCT', 'PASABUY'] },
    targetId: { type: 'string', format: 'uuid', description: 'Optional only for TRANSACTION with an attachment' },
    category: { type: 'string' }, description: { type: 'string' },
    attachment: { type: 'string', format: 'binary', description: 'Optional JPEG, PNG, or PDF up to 5 MB' },
  } } })
  @ApiOperation({ summary: 'Report a vendor, user, order, transaction, product, or Pasabuy request' })
  @ApiResponse({ status: 201, description: 'Report opened for review' })
  @ApiResponse({ status: 400, description: 'Invalid category, description, or target' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 404, description: 'Target not found or not accessible to the reporter' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateReportDto,
    @UploadedFile() attachment?: { buffer: Buffer; mimetype: string; size: number; originalname: string }) {
    return this.reports.create(user.sub, dto, attachment);
  }
}
