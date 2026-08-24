import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('products')
export class ProductsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
