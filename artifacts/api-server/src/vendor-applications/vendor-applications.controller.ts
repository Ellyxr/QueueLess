import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListVendorApplicationsDto, RejectContractDto, ReviewApplicationDto, SubmitContractDto, SubmitVendorApplicationDto, UploadApplicationDocumentDto } from './vendor-application.dto';
import { VendorApplicationsService } from './vendor-applications.service';
import type { ApplicationUpload } from './vendor-application.policy';
import { VENDOR_TERMS_VERSION } from './vendor-application.policy';

@ApiTags('vendor-applications') @ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) @Roles('BUYER')
@Controller('vendors/applications')
export class VendorApplicationsController {
  constructor(private readonly applications: VendorApplicationsService) {}
  @Get('plans') plans() { return this.applications.plans(); }
  @Get('terms') terms() { return { version: VENDOR_TERMS_VERSION,
    acceptanceRequired: true, billing: 'Checkout only after administrator approval and contract verification; activation only after verified payment.' }; }
  @Get('mine') @Header('Cache-Control', 'no-store')
  mine(@CurrentUser() user: { sub: string }) { return this.applications.mine(user.sub); }
  @Post() @Header('Cache-Control', 'no-store')
  submit(@CurrentUser() user: { sub: string }, @Body() dto: SubmitVendorApplicationDto) {
    return this.applications.submit(user.sub, dto);
  }
  @Post('documents') @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 } }))
  upload(@CurrentUser() user: { sub: string }, @Body() dto: UploadApplicationDocumentDto, @UploadedFile() file?: ApplicationUpload) {
    return this.applications.upload(user.sub, dto.kind, file);
  }
  @Get('documents/:id') @Header('Cache-Control', 'no-store')
  document(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.documentUrl(id, user.sub, false);
  }
  @Post(':id/contract') @Header('Cache-Control', 'no-store')
  contract(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitContractDto) {
    return this.applications.contract(id, user.sub, dto.documentId);
  }
  @Post(':id/retry-payment') @Header('Cache-Control', 'no-store')
  retry(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.retry(id, user.sub);
  }
}

@ApiTags('admin-vendor-applications') @ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
@Controller('admin/vendor-applications')
export class AdminVendorApplicationsController {
  constructor(private readonly applications: VendorApplicationsService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@Query() dto: ListVendorApplicationsDto) { return this.applications.list(dto); }
  @Get('documents/:id') @Header('Cache-Control', 'no-store')
  document(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.documentUrl(id, user.sub, true);
  }
  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.applications.detail(id); }
  @Get(':id/bank-details') @Header('Cache-Control', 'no-store')
  bank(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.bankDetails(id, user.sub);
  }
  @Patch(':id') @Header('Cache-Control', 'no-store')
  review(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewApplicationDto) {
    return this.applications.review(id, user.sub, dto);
  }
  @Patch(':id/reject-contract') @Header('Cache-Control', 'no-store')
  reject(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectContractDto) {
    return this.applications.rejectContract(id, user.sub, dto.reason);
  }
  @Patch(':id/verify-contract') @Header('Cache-Control', 'no-store')
  verify(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.verify(id, user.sub);
  }
}
