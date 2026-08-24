import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('pasabuy')
export class PasabuyController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
