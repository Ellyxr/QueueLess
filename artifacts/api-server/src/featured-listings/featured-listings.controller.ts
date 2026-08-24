import { Controller, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('featured-listings')
export class FeaturedListingsController {
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  placeholder() {
    return { statusCode: HttpStatus.NOT_IMPLEMENTED, message: 'Not implemented' };
  }
}
