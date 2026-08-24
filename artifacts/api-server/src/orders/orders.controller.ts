import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('orders')
export class OrdersController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
