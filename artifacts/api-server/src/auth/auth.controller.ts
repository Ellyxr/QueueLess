import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Post('register')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  register() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }

  @Post('login')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  login() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }

  @Post('switch-profile')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  switchProfile() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}