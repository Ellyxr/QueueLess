import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
