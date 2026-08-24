import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('reports')
export class ReportsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
