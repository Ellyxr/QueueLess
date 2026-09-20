import { Module } from '@nestjs/common';
import { PaymongoService } from './paymongo.service';

@Module({
  providers: [PaymongoService],
  exports: [PaymongoService],
})
export class PaymongoModule {}
