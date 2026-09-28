import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateFeaturedListingDto, CreateFeaturedPlanDto, ListFeaturedDto, UpdateFeaturedPlanDto } from './dto/featured-listing.dto';
import { FeaturedListingsService } from './featured-listings.service';

@ApiTags('featured-listings')
@Controller('featured-listings')
export class FeaturedListingsController {
  constructor(private readonly featured: FeaturedListingsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List active featured listing plans and their authoritative price' })
  plans() { return this.featured.plans(); }

  @Post('plans')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN') @ApiBearerAuth()
  @ApiOperation({ summary: 'Configure a featured listing plan' })
  createPlan(@Body() dto: CreateFeaturedPlanDto) { return this.featured.createPlan(dto); }

  @Patch('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN') @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable or disable a featured listing plan' })
  updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeaturedPlanDto) {
    return this.featured.updatePlan(id, dto.isActive);
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
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateFeaturedListingDto) {
    return this.featured.create(user.sub, dto);
  }

  @Post(':id/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  @ApiOperation({ summary: 'Resume a pending featured listing checkout' })
  checkout(@CurrentUser() user: { sub: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.featured.checkout(user.sub, id);
  }
}
