import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VENDOR_OWNER')
export class VendorsController {
  @Get()
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return {
      statusCode: HttpStatus.NOT_IMPLEMENTED,
      message: 'Not implemented',
    };
  }
}