import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateFeaturedListingDto, CreateFeaturedPlanDto, ListFeaturedDto, UpdateFeaturedSettingsDto, UpdateFeaturedPlanDto } from './dto/featured-listing.dto';
import { FeaturedListingsService } from './featured-listings.service';

@ApiTags('featured-listings')
@Controller('featured-listings')
export class FeaturedListingsController {
  constructor(private readonly featured: FeaturedListingsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List active featured listing plans and their authoritative price' })
  plans() { return this.featured.plans(); }

  @Get('plans/all')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN') @ApiBearerAuth()
  allPlans() { return this.featured.allPlans(); }

  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN') @ApiBearerAuth()
  settings() { return this.featured.settings(); }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN') @ApiBearerAuth()
  updateSettings(@CurrentUser() user: { sub: string }, @Body() dto: UpdateFeaturedSettingsDto) {
    return this.featured.updateSettings(dto, user.sub);
  }

  @Post('quote')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  quote(@CurrentUser() user: { sub: string }, @Body() dto: CreateFeaturedListingDto) {
    return this.featured.quote(user.sub, dto);
  }

  @Post('plans')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN') @ApiBearerAuth()
  @ApiOperation({ summary: 'Configure a featured listing plan' })
  createPlan(@CurrentUser() user: { sub: string }, @Body() dto: CreateFeaturedPlanDto) {
    return this.featured.createPlan(dto, user.sub);
  }

  @Patch('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN') @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a custom plan or enable/disable a monthly plan' })
  updatePlan(@CurrentUser() user: { sub: string },
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeaturedPlanDto) {
    return this.featured.updatePlan(id, dto, user.sub);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  @ApiOperation({ summary: 'Get your featured listings and payment status' })
  mine(@CurrentUser() user: { sub: string }) { return this.featured.mine(user.sub); }

  @Get()
  @ApiOperation({ summary: 'List currently paid and visible featured placements' })
  list(@Query() query: ListFeaturedDto) { return this.featured.list(query.placement); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a pending featured listing and PayMongo checkout' })
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateFeaturedListingDto,
    @Headers('idempotency-key') key?: string) {
    return this.featured.create(user.sub, dto, key);
  }

  @Post(':id/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  @ApiOperation({ summary: 'Resume a pending featured listing checkout' })
  checkout(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.featured.checkout(user.sub, id);
  }
}
