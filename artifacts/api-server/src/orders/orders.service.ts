import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ) {
    const key = idempotencyKey?.trim();

    if (!key) {
      throw new BadRequestException(
        'Idempotency-Key header is required',
      );
    }

    if (key.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key must not exceed 255 characters',
      );
    }

    const existing =
      await this.prisma.orderIdempotencyKey.findUnique({
        where: {
          userId_key: {
            userId,
            key,
          },
        },
        include: {
          order: {
            include: {
              vendor: true,
              items: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });

    if (existing) {
      if (
        existing.cartId !== dto.cartId ||
        existing.eventId !== (dto.eventId ?? null)
      ) {
        throw new ConflictException(
          'Idempotency-Key was already used for a different order request',
        );
      }

      if (existing.order) {
        return this.buildOrderResponse(existing.order);
      }

      throw new ConflictException(
        'This order request is already being processed. Please retry with the same Idempotency-Key.',
      );
    }

    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          await tx.orderIdempotencyKey.create({
            data: {
              userId,
              key,
              cartId: dto.cartId,
              eventId: dto.eventId ?? null,
            },
          });

          const cart = await tx.cart.findFirst({
            where: {
              id: dto.cartId,
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
            throw new NotFoundException(
              'Active cart not found or does not belong to the current user',
            );
          }

          if (cart.items.length === 0) {
            throw new BadRequestException(
              'Cannot create an order from an empty cart',
            );
          }

          if (cart.vendor.status !== 'ACTIVE') {
            throw new BadRequestException(
              'Vendor is not active',
            );
          }

          for (const item of cart.items) {
            if (item.quantity < 1) {
              throw new BadRequestException(
                `Invalid quantity for product ${item.productId}`,
              );
            }

            if (item.product.vendorId !== cart.vendorId) {
              throw new BadRequestException(
                `Product ${item.productId} does not belong to this vendor`,
              );
            }

            if (!item.product.isAvailable) {
              throw new BadRequestException(
                `Product "${item.product.name}" is unavailable`,
              );
            }
          }

          if (dto.eventId) {
            const event =
              await tx.event.findUnique({
                where: {
                  id: dto.eventId,
                },
              });

            if (!event) {
              throw new NotFoundException(
                'Event not found',
              );
            }

            const participation =
              await tx.eventVendorParticipation.findUnique({
                where: {
                  eventId_vendorId: {
                    eventId: dto.eventId,
                    vendorId: cart.vendorId,
                  },
                },
              });

            if (
              !participation ||
              participation.status !== 'CONFIRMED'
            ) {
              throw new BadRequestException(
                'Vendor is not participating in this event',
              );
            }
          }

          let subtotal = new Prisma.Decimal(0);

          const orderItems = cart.items.map((item) => {
            const unitPrice = item.product.price;

            const lineSubtotal = unitPrice.mul(
              item.quantity,
            );

            subtotal = subtotal.add(lineSubtotal);

            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPriceSnapshot: unitPrice,
              lineSubtotal,
            };
          });

          const marketplaceFeeRate =
            this.getMarketplaceFeeRate();

          const marketplaceFee = subtotal
            .mul(marketplaceFeeRate)
            .div(100)
            .toDecimalPlaces(2);

          const totalAmount = subtotal
            .add(marketplaceFee)
            .toDecimalPlaces(2);

          const checkoutResult =
            await tx.cart.updateMany({
              where: {
                id: cart.id,
                userId,
                status: 'ACTIVE',
              },
              data: {
                status: 'CHECKED_OUT',
              },
            });

          if (checkoutResult.count !== 1) {
            throw new ConflictException(
              'Cart has already been checked out',
            );
          }

          const order = await tx.order.create({
            data: {
              customerId: userId,
              vendorId: cart.vendorId,
              eventId: dto.eventId ?? null,
              orderType: 'INDIVIDUAL',
              status: 'PENDING',
              subtotal,
              marketplaceFee,
              totalAmount,
              items: {
                create: orderItems,
              },
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

          await tx.orderIdempotencyKey.update({
            where: {
              userId_key: {
                userId,
                key,
              },
            },
            data: {
              orderId: order.id,
            },
          });

          return order;
        },
      );

      return this.buildOrderResponse(order);
    } catch (error) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingRequest =
          await this.prisma.orderIdempotencyKey.findUnique({
            where: {
              userId_key: {
                userId,
                key,
              },
            },
            include: {
              order: {
                include: {
                  vendor: true,
                  items: {
                    include: {
                      product: true,
                    },
                  },
                },
              },
            },
          });

        if (
          existingRequest &&
          (existingRequest.cartId !== dto.cartId ||
            existingRequest.eventId !==
              (dto.eventId ?? null))
        ) {
          throw new ConflictException(
            'Idempotency-Key was already used for a different order request',
          );
        }

        if (existingRequest?.order) {
          return this.buildOrderResponse(
            existingRequest.order,
          );
        }

        throw new ConflictException(
          'This order request is already being processed. Please retry with the same Idempotency-Key.',
        );
      }

      throw error;
    }
  }

  async getOrder(
    userId: string,
    orderId: string,
  ) {
    const order =
      await this.prisma.order.findFirst({
        where: {
          id: orderId,
          customerId: userId,
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

    if (!order) {
      throw new NotFoundException(
        'Order not found',
      );
    }

    return this.buildOrderResponse(order);
  }

  private getMarketplaceFeeRate(): Prisma.Decimal {
    const rawRate =
      this.configService.get<string>(
        'MARKETPLACE_FEE_RATE',
        '0',
      );

    let rate: Prisma.Decimal;

    try {
      rate = new Prisma.Decimal(rawRate);
    } catch {
      throw new BadRequestException(
        'MARKETPLACE_FEE_RATE must be a valid number',
      );
    }

    if (
      rate.lessThan(0) ||
      rate.greaterThan(100)
    ) {
      throw new BadRequestException(
        'MARKETPLACE_FEE_RATE must be between 0 and 100',
      );
    }

    return rate;
  }

  private buildOrderResponse(
    order: Prisma.OrderGetPayload<{
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
    return {
      id: order.id,
      customerId: order.customerId,
      vendor: {
        id: order.vendor.id,
        name: order.vendor.name,
        status: order.vendor.status,
      },
      eventId: order.eventId,
      orderType: order.orderType,
      status: order.status,
      subtotal: order.subtotal.toFixed(2),
      marketplaceFee:
        order.marketplaceFee.toFixed(2),
      totalAmount:
        order.totalAmount.toFixed(2),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice:
          item.unitPriceSnapshot.toFixed(2),
        subtotal:
          item.lineSubtotal.toFixed(2),
      })),
    };
  }
}
