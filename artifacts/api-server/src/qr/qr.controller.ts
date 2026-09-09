import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { QrService } from './qr.service';

@ApiTags('QR')
@ApiBearerAuth()
@Controller('qr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get(':token')
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Validate a vendor QR code and resolve ordering context',
  })
  @ApiResponse({
    status: 200,
    description: 'QR code validated and vendor context resolved',
  })
  @ApiResponse({
    status: 400,
    description: 'QR code is inactive or vendor is unavailable',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'QR code is invalid',
  })
  @ApiResponse({
    status: 410,
    description: 'QR code has expired',
  })
  async resolveVendorContext(@Param('token') token: string) {
    return this.qrService.resolveVendorContext(token);
  }
}

