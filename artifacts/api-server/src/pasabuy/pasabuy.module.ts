import { Module } from '@nestjs/common';
import { PasabuyController } from './pasabuy.controller';
import { PasabuyService } from './pasabuy.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [PasabuyController],
  providers: [PasabuyService],
})
export class PasabuyModule {}
