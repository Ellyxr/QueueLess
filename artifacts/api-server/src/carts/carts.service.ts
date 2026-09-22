import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PricingService } from '../common/pricing/pricing.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: {
        vendor: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isAvailable) {
      throw new BadRequestException('Product is unavailable');
    }

    if (product.vendor.status !== 'ACTIVE') {
      throw new BadRequestException('Vendor is not active');
    }

    let cart = await this.prisma.cart.findFirst({
      where: {
        userId,
        vendorId: product.vendorId,
        status: 'ACTIVE',
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          userId,
          vendorId: product.vendorId,
          status: 'ACTIVE',
        },
      });
    }

    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: product.id,
        },
      },
    });

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + dto.quantity,
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCart(userId, cart.id);
  }

  async getCart(userId: string, cartId: string) {
    const cart = await this.prisma.cart.findFirst({
      where: {
        id: cartId,
        userId,
      },
      include: {
        vendor: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    return this.buildCartResponse(cart);
  }

  async validateCart(userId: string, cartId: string) {
    const cart = await this.prisma.cart.findFirst({
      where: {
        id: cartId,
        userId,
        status: 'ACTIVE',
      },
      include: {
        vendor: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const issues: Array<{
      productId: string;
      issue: string;
    }> = [];

    if (cart.vendor.status !== 'ACTIVE') {
      issues.push({
        productId: '',
        issue: 'Vendor is not active',
      });
    }

    for (const item of cart.items) {
      if (!item.product.isAvailable) {
        issues.push({
          productId: item.productId,
          issue: 'Product is unavailable',
        });
      }

      if (item.product.vendorId !== cart.vendorId) {
        issues.push({
          productId: item.productId,
          issue: 'Product does not belong to this cart vendor',
        });
      }

      if (item.quantity < 1) {
        issues.push({
          productId: item.productId,
          issue: 'Quantity must be at least 1',
        });
      }
    }

    return {
      cartId: cart.id,
      valid: issues.length === 0,
      issues,
    };
  }

  async calculateCart(
    userId: string,
    cartId: string,
    isPasabuyRequest = false,
  ) {
    const cart = await this.prisma.cart.findFirst({
      where: {
        id: cartId,
        userId,
        status: 'ACTIVE',
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    let subtotal = new Prisma.Decimal(0);

    const items = cart.items.map((item) => {
      const unitPrice = item.product.price;
      const lineSubtotal = unitPrice
        .mul(item.quantity)
        .toDecimalPlaces(2);

      subtotal = subtotal.add(lineSubtotal);

      return {
        productId: item.productId,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: unitPrice.toFixed(2),
        subtotal: lineSubtotal.toFixed(2),
      };
    });

    const totals =
      this.pricingService.calculateOrderTotals(subtotal);

    const pasabuyDeliveryFee = isPasabuyRequest
      ? this.pricingService.getPasabuyDeliveryFee()
      : new Prisma.Decimal(0);

    const finalTotal = totals.totalAmount
      .add(pasabuyDeliveryFee)
      .toDecimalPlaces(2);

    return {
      cartId: cart.id,
      items,
      subtotal: totals.subtotal.toFixed(2),
      fees: {
        marketplaceFee: totals.marketplaceFee.toFixed(2),
        pasabuyDeliveryFee: pasabuyDeliveryFee.toFixed(2),
      },
      totalAmount: finalTotal.toFixed(2),
    };
  }

    private buildCartResponse(
      cart: Prisma.CartGetPayload<{
        include: {
          vendor: true;
          items: {
            include: {
              product: true;
            };
          };
        };
      }>,
    ) {
    const subtotal = cart.items.reduce(
      (sum, item) =>
        sum.add(
          item.product.price
            .mul(item.quantity)
            .toDecimalPlaces(2),
        ),
      new Prisma.Decimal(0),
    );

    const totals =
      this.pricingService.calculateOrderTotals(subtotal);

    return {
      id: cart.id,
      vendor: {
        id: cart.vendor.id,
        name: cart.vendor.name,
        status: cart.vendor.status,
      },
      status: cart.status,
      items: cart.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price.toFixed(2),
        subtotal: item.product.price
          .mul(item.quantity)
          .toDecimalPlaces(2)
          .toFixed(2),
      })),
      subtotal: totals.subtotal.toFixed(2),
      fees: {
        marketplaceFee: totals.marketplaceFee.toFixed(2),
      },
      totalAmount: totals.totalAmount.toFixed(2),
    };
  }
}