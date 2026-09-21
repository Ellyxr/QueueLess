import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImagekitService } from './imagekit.service';

@ApiBearerAuth()
@Controller('imagekit')
export class ImagekitController {
  constructor(private readonly imagekitService: ImagekitService) {}

  @Get('auth')
  @UseGuards(JwtAuthGuard)
  getAuth() {
    return this.imagekitService.getAuthenticationParameters();
  }
}