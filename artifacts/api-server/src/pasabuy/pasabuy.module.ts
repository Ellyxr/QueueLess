import { Module } from '@nestjs/common';
import { PasabuyController } from './pasabuy.controller';
import { PasabuyService } from './pasabuy.service';

@Module({ controllers: [PasabuyController], providers: [PasabuyService] })
export class PasabuyModule {}
