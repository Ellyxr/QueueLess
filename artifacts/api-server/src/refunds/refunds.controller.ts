import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateRefundDto,
  RefundStatusQueryDto,
  UpdateRefundStatusDto,
} from './dto/refund.dto';
import { RefundsService } from './refunds.service';

@ApiTags('refunds')
@Controller('refunds')
export class RefundsController {
  constructor(
    private readonly refundsService: RefundsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  createRefund(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateRefundDto,
  ) {
    return this.refundsService.createRefund(
      user.sub,
      dto,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  listRefunds(
    @Query() query: RefundStatusQueryDto,
  ) {
    return this.refundsService.listRefunds(query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  updateRefundStatus(
    @CurrentUser() user: { sub: string },
    @Param('id') refundId: string,
    @Body() dto: UpdateRefundStatusDto,
  ) {
    return this.refundsService.updateRefundStatus(
      refundId,
      dto,
      user.sub,
    );
  }
}
