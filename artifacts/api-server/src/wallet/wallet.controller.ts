import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsString, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { WalletService } from "./wallet.service";
class TopupDto {
  @IsString() amount!: string;
}
class PayDto {
  @IsUUID() paymentShareId!: string;
}
class HistoryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}
@Controller("wallet")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("BUYER")
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get() get(@CurrentUser() user: { sub: string }) {
    return this.wallet.get(user.sub);
  }
  @Get("entries") entries(
    @CurrentUser() user: { sub: string },
    @Query() query: HistoryDto,
  ) {
    return this.wallet.history(user.sub, query.page);
  }
  @Post("topups") topup(
    @CurrentUser() user: { sub: string },
    @Body() body: TopupDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.wallet.topup(user.sub, body.amount, key);
  }
  @Get("topups/:id") status(
    @CurrentUser() user: { sub: string },
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.wallet.topupStatus(user.sub, id);
  }
  @Get("purchases/:id") purchase(
    @CurrentUser() user: { sub: string },
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.wallet.purchaseStatus(user.sub, id);
  }
  @Post("pay") pay(
    @CurrentUser() user: { sub: string },
    @Body() body: PayDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.wallet.pay(user.sub, body.paymentShareId, key);
  }
}
