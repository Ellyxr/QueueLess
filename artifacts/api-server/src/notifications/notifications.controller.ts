import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('notifications')
export class NotificationsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
