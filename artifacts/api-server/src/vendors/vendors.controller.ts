import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorsService } from './vendors.service';

@ApiBearerAuth()
@Controller('vendors')
@UseGuards(JwtAuthGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  async listVendors() {
    return this.vendorsService.listActiveVendors();
  }

  @Get('mine')
  async getMyVendor(@Req() request: { user: JwtPayload }) {
    return this.vendorsService.getVendorForOwner(request.user.sub);
  }

  @Get(':vendorId')
  async getVendorStorefront(@Param('vendorId') vendorId: string) {
    return this.vendorsService.getVendorStorefront(vendorId);
  }

  @Patch(':vendorId')
  @UseGuards(RolesGuard)
  @Roles('VENDOR_OWNER', 'ADMIN')
  async updateVendorStorefront(
    @Param('vendorId') vendorId: string,
    @Body() dto: UpdateVendorDto,
    @Req() request: { user: JwtPayload },
  ) {
    return this.vendorsService.updateVendorStorefront(
      request.user.sub,
      vendorId,
      dto,
      request.user.roles,
    );
  }
}