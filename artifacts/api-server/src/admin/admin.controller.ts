import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('admin')
export class AdminController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
