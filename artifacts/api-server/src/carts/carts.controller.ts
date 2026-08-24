import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('carts')
export class CartsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
