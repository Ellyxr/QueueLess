import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';
import { DealsService } from './deals.service';
import { CreateDealDto, ListActiveDealsDto, UpdateDealDto } from './dto/deal.dto';

@ApiTags('deals')
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get('active')
  @ApiOperation({ summary: 'List active deals for the marketplace deals banner, most eye-catching first' })
  active(@Query() query: ListActiveDealsDto) {
    return this.deals.active(query.vendorType);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  @ApiOperation({ summary: 'List your own deals' })
  mine(@CurrentUser() user: JwtPayload) { return this.deals.mine(user.sub); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a deal for one of your products' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDealDto) {
    return this.deals.create(user.sub, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  @ApiOperation({ summary: 'Update or toggle a deal' })
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(user.sub, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('VENDOR_OWNER') @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a deal' })
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.deals.remove(user.sub, id);
  }
}
