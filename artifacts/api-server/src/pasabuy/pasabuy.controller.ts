import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
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

@ApiTags('Pasabuy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('BUYER')
@Controller('pasabuy')
export class PasabuyController {
  constructor(private readonly pasabuyService: PasabuyService) {}

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
