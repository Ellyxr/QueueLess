import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePlanDto, SubscribeDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List available vendor subscription plans' })
  plans() { return this.subscriptions.plans(); }

  @Post('plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configure a vendor subscription plan' })
  createPlan(@CurrentUser() user: { sub: string }, @Body() dto: CreatePlanDto) {
    return this.subscriptions.createPlan(dto, user.sub);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get your vendor subscription and payment status' })
  mine(@CurrentUser() user: { sub: string }) { return this.subscriptions.mine(user.sub); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe to a plan and create a PayMongo Sandbox checkout' })
  subscribe(@CurrentUser() user: { sub: string }, @Body() dto: SubscribeDto) {
    return this.subscriptions.subscribe(user.sub, dto.planId);
  }

  @Post(':id/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resume a pending subscription checkout' })
  checkout(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.checkout(user.sub, id);
  }
}
