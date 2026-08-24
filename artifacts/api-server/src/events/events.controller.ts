import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('events')
export class EventsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
