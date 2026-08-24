import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('refunds')
export class RefundsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
