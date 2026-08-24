import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('subscriptions')
export class SubscriptionsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
