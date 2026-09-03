import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartDto } from './dto/cart.dto';
import { CartsService } from './carts.service';

@ApiBearerAuth()
@Controller('carts')
@UseGuards(JwtAuthGuard)
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post('items')
  async addItem(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartsService.addItem(user.sub, dto);
  }

  @Get(':id')
  async getCart(
    @CurrentUser() user: JwtPayload,
    @Param('id') cartId: string,
  ) {
    return this.cartsService.getCart(user.sub, cartId);
  }

  @Post('validate')
  async validateCart(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CartDto,
  ) {
    return this.cartsService.validateCart(user.sub, dto.cartId);
  }

  @Post('calculate')
  async calculateCart(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CartDto,
  ) {
    return this.cartsService.calculateCart(user.sub, dto.cartId);
  }
}
