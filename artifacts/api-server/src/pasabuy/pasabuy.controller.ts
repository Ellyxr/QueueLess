import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpsertPasabuyProfileDto } from './dto/upsert-pasabuy-profile.dto';
import { PasabuyService } from './pasabuy.service';
import { PasabuyCreationService } from './pasabuy-creation.service';
import { PasabuyPaymentsService } from './pasabuy-payments.service';
import { CreatePasabuyRequestDto } from './dto/create-pasabuy-request.dto';
import { PasabuyWorkflowsService } from './pasabuy-workflows.service';
import { CancelPasabuyDto, ReportPasabuyDto, VerifyPasabuyPickupDto } from './dto/pasabuy-workflow.dto';
import { PasabuyIdentityService } from './pasabuy-identity.service';

@ApiTags('Pasabuy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('BUYER')
@Controller('pasabuy')
export class PasabuyController {
  constructor(
    private readonly pasabuyService: PasabuyService,
    private readonly creation: PasabuyCreationService,
    private readonly payments: PasabuyPaymentsService,
    private readonly workflows: PasabuyWorkflowsService,
    private readonly identity: PasabuyIdentityService,
  ) {}

  @Post('requests')
  @ApiOperation({ summary: 'Create a Pasabuy request for an eligible paid order' })
  createRequest(@CurrentUser() user: JwtPayload, @Body() dto: CreatePasabuyRequestDto) {
    return this.creation.create(user.sub, dto);
  }

  @Post('requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel before pickup as the requester or assigned deliverer' })
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string,
    @Body() dto: CancelPasabuyDto) {
    return this.workflows.cancel(user.sub, id, dto.reason);
  }

  @Post('requests/:id/report')
  @ApiOperation({ summary: 'Report a problem with a paid Pasabuy request' })
  report(@CurrentUser() user: JwtPayload, @Param('id') id: string,
    @Body() dto: ReportPasabuyDto) {
    return this.workflows.report(user.sub, id, dto.description);
  }

  @Get('vendor/orders/:orderId')
  @Roles('VENDOR_OWNER')
  @ApiOperation({ summary: 'View assigned deliverer and pickup details for your order' })
  vendorOrder(@CurrentUser() user: JwtPayload, @Param('orderId') orderId: string) {
    return this.workflows.vendorOrder(user.sub, orderId);
  }

  @Post('vendor/orders/:orderId/verify-pickup')
  @Roles('VENDOR_OWNER')
  @ApiOperation({ summary: 'Verify the deliverer pickup code for your order' })
  verifyPickup(@CurrentUser() user: JwtPayload, @Param('orderId') orderId: string,
    @Body() dto: VerifyPasabuyPickupDto) {
    return this.workflows.verifyPickup(user.sub, orderId, dto.code);
  }

  @Get('profile')
  @ApiOperation({
    summary: 'Get the authenticated student Pasabuy profile',
  })
  @ApiResponse({
    status: 200,
    description: 'Pasabuy profile status returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user is not eligible for buyer features',
  })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.pasabuyService.getProfile(user.sub);
  }

  @Put('profile')
  @ApiOperation({
    summary: 'Create or update the authenticated student Pasabuy profile',
  })
  @ApiResponse({
    status: 200,
    description: 'Pasabuy profile saved successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Student ID is already associated with another account',
  })
  async upsertProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertPasabuyProfileDto,
  ) {
    return this.pasabuyService.upsertProfile(user.sub, dto);
  }

  @Get('requests')
  @ApiOperation({
    summary: 'Browse available Pasabuy requests',
    description:
      'Returns unclaimed Pasabuy requests created by other students.',
  })
  @ApiResponse({
    status: 200,
    description: 'Available Pasabuy requests returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user is not eligible for buyer features',
  })
  async getAvailableRequests(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pasabuyService.getAvailableRequests(user.sub);
  }

  @Post('profile/student-id-photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a private student ID photo for admin review' })
  uploadStudentIdPhoto(@CurrentUser() user: JwtPayload,
    @UploadedFile() photo?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.identity.uploadPhoto(user.sub, photo);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get authoritative Pasabuy status, fee, payment and history for a participant' })
  getRequest(@CurrentUser() user: JwtPayload, @Param('id') requestId: string) {
    return this.pasabuyService.getRequest(user.sub, requestId);
  }

  @Post('requests/:id/checkout')
  @ApiOperation({ summary: 'Create or reuse a fee-only PayMongo checkout after acceptance' })
  createFeeCheckout(@CurrentUser() user: JwtPayload, @Param('id') requestId: string) {
    return this.payments.createCheckout(user.sub, requestId);
  }

  @Post('requests/:id/complete')
  @ApiOperation({ summary: 'Confirm receipt as requester after delivery' })
  confirmReceipt(@CurrentUser() user: JwtPayload, @Param('id') requestId: string) {
    return this.pasabuyService.confirmReceipt(user.sub, requestId);
  }

  @Post('requests/:id/accept')
  @ApiOperation({
    summary: 'Accept an available Pasabuy request',
    description:
      'Claims an available Pasabuy request for the authenticated student. A completed Pasabuy profile is required.',
  })
  @ApiParam({
    name: 'id',
    description: 'Pasabuy request UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description: 'Pasabuy request accepted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'The requester attempted to accept their own request',
  })
  @ApiResponse({
    status: 403,
    description:
      'The student is not eligible or has not completed their Pasabuy profile',
  })
  @ApiResponse({
    status: 404,
    description: 'Pasabuy request not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Pasabuy request has already been claimed',
  })
  async acceptRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id') requestId: string,
  ) {
    return this.pasabuyService.acceptRequest(
      user.sub,
      requestId,
    );
  }

    @Post('requests/:id/pickup')
  @ApiOperation({
    summary: 'Mark an accepted Pasabuy request as picked up',
    description:
      'Allows the assigned fulfiller to mark an accepted Pasabuy request as picked up and in progress.',
  })
  @ApiParam({
    name: 'id',
    description: 'Pasabuy request UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description: 'Pasabuy request marked as picked up successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Only the assigned fulfiller can mark the request as picked up',
  })
  @ApiResponse({
    status: 404,
    description: 'Pasabuy request not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Pasabuy request is not in the required status',
  })
  async markPickedUp(
    @CurrentUser() user: JwtPayload,
    @Param('id') requestId: string,
  ) {
    return this.pasabuyService.markPickedUp(
      user.sub,
      requestId,
    );
  }
  @Post('requests/:id/deliver')
  @ApiOperation({
    summary: 'Mark an in-progress Pasabuy request as delivered',
    description:
      'Allows the assigned fulfiller to mark an in-progress Pasabuy request as delivered.',
  })
  @ApiParam({
    name: 'id',
    description: 'Pasabuy request UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description: 'Pasabuy request marked as delivered successfully',
  })
  @ApiResponse({
    status: 403,
    description:
      'Only the assigned fulfiller can mark the request as delivered',
  })
  @ApiResponse({
    status: 404,
    description: 'Pasabuy request not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Pasabuy request is not in the required status',
  })
  async markDelivered(
    @CurrentUser() user: JwtPayload,
    @Param('id') requestId: string,
  ) {
    return this.pasabuyService.markDelivered(
      user.sub,
      requestId,
    );
  }
}
