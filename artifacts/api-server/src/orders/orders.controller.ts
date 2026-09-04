import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an individual order from an active cart',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Unique key for safely retrying the same order creation request',
  })
  @ApiResponse({
    status: 201,
    description: 'Individual order created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or unavailable cart/order data',
  })
  @ApiResponse({
    status: 409,
    description: 'Idempotency conflict or cart already checked out',
  })
  async createOrder(
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(
      user.sub,
      dto,
      idempotencyKey,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one of the authenticated user’s orders',
  })
  @ApiResponse({
    status: 200,
    description: 'Order returned successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async getOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.getOrder(user.sub, orderId);
  }
}
