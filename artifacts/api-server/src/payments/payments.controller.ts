import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

@Controller('payments')
export class PaymentsController {
  @Post('webhook')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  webhook() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}