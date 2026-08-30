import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

  @Get(':vendorId')
  async getVendorStorefront(@Param('vendorId') vendorId: string) {
    return this.vendorsService.getVendorStorefront(vendorId);
  }
}