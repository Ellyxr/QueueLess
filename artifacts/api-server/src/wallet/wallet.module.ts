import { Module } from "@nestjs/common";
import { PaymongoModule } from "../payments/paymongo.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";
@Module({
  imports: [PaymongoModule, RealtimeModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
