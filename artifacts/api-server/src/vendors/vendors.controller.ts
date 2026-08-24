import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('vendors')
export class VendorsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
