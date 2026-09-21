import { Module } from '@nestjs/common';
import { ImagekitService } from './imagekit.service';
import { ImagekitController } from './imagekit.controller';

@Module({
  providers: [ImagekitService],
  controllers: [ImagekitController],
  exports: [ImagekitService],
})
export class ImagekitModule {}