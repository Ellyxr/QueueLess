import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CancellationReason, OrderStatus, Prisma } from '@prisma/client';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
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

          const estimatedWaitMinutes = Math.max(
            ...cart.items.map(
              (item) => item.product.preparationTimeMinutes,
            ),
          );

          const estimatedReadyAt = new Date(
            Date.now() + estimatedWaitMinutes * 60_000,
          );

          const order = await tx.order.create({
            data: {
              customerId: userId,
              vendorId: cart.vendorId,
              eventId: dto.eventId ?? null,
              orderType: 'INDIVIDUAL',
              status: 'PENDING',
              isPasabuyRequest: dto.isPasabuyRequest ?? false,
              subtotal,
              marketplaceFee,
              estimatedReadyAt,
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

  async getCustomerOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        vendor: { select: { id: true, name: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            quantity: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.totalAmount.toFixed(2),
      createdAt: order.createdAt,
      vendor: order.vendor,
      items: order.items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        quantity: item.quantity,
      })),
    }));
  }

  async getOrderStatus(
    userId: string,
    orderId: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [
          { customerId: userId },
          {
            groupOrder: {
              participants: {
                some: { userId, status: 'JOINED' },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        customerId: true,
        orderType: true,
        status: true,
        isPasabuyRequest: true,
        cancellationReason: true,
        cancellationNote: true,
        estimatedReadyAt: true,
        updatedAt: true,
        pickupConfirmedAt: true,
        vendor: {
          select: {
            id: true,
            name: true,
            campusLocation: true,
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                name: true,
              },
            },
          },
        },
        statusHistory: {
          orderBy: {
            changedAt: 'asc',
          },
          select: {
            status: true,
            note: true,
            changedAt: true,
          },
        },
        groupOrder: {
          select: {
            id: true,
            code: true,
            initiatorUserId: true,
            initiator: {
              select: { allowParticipantOrderCompletion: true },
            },
            participants: {
              where: { status: 'JOINED' },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const estimatedWaitMinutes =
      order.estimatedReadyAt &&
      order.status !== OrderStatus.COMPLETED &&
      order.status !== OrderStatus.CANCELLED
        ? Math.max(
            0,
            Math.ceil(
              (order.estimatedReadyAt.getTime() - Date.now()) /
                60_000,
            ),
          )
        : null;

    const isOwner = order.customerId === userId;
    const viewerRole = order.groupOrder ? (isOwner ? 'OWNER' : 'MEMBER') : null;
    const canComplete = order.groupOrder
      ? isOwner || order.groupOrder.initiator.allowParticipantOrderCompletion
      : true;

    return {
      orderId: order.id,
      orderType: order.orderType,
      status: order.status,
      isPasabuyRequest: order.isPasabuyRequest,
      cancellationReason: order.cancellationReason,
      cancellationNote: order.cancellationNote,
      estimatedReadyAt: order.estimatedReadyAt,
      estimatedWaitMinutes,
      updatedAt: order.updatedAt,
      vendor: order.vendor,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.product.name,
        quantity: item.quantity,
      })),
      history: order.statusHistory,
      viewerRole,
      canComplete,
      groupOrder: order.groupOrder
        ? {
            id: order.groupOrder.id,
            code: order.groupOrder.code,
            participantCount: order.groupOrder.participants.length,
          }
        : null,
    };
  }

  async getVendorOrderQueue(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: {
        ownerUserId: userId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!vendor) {
      throw new NotFoundException(
        'Vendor not found for this user',
      );
    }

    const orders = await this.prisma.order.findMany({
      where: {
        vendorId: vendor.id,
        status: {
          in: ['PENDING', 'PAID', 'COOKING'],
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        customerId: true,
        orderType: true,
        status: true,
        isPasabuyRequest: true,
        subtotal: true,
        marketplaceFee: true,
        totalAmount: true,
        eventId: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            fullName: true,
            email: true,
          },
        },
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPriceSnapshot: true,
            lineSubtotal: true,
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      vendor: {
        id: vendor.id,
        name: vendor.name,
        status: vendor.status,
      },
      queueCount: orders.length,
      orders: orders.map((order) => ({
        id: order.id,
        customer: {
          id: order.customerId,
          fullName: order.customer.fullName,
        },
        userId: order.customerId,
        customerName: order.customer.fullName,
        customerEmail: order.customer.email,
        paymentStatus:
          order.status === 'PENDING' ? 'PENDING' : 'PAID',
        isPasabuyRequest: order.isPasabuyRequest,
        orderType: order.orderType,
        status: order.status,
        eventId: order.eventId,
        subtotal: order.subtotal.toFixed(2),
        marketplaceFee:
          order.marketplaceFee.toFixed(2),
        totalAmount: order.totalAmount.toFixed(2),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product.name,
          quantity: item.quantity,
          unitPrice:
            item.unitPriceSnapshot.toFixed(2),
          lineSubtotal:
            item.lineSubtotal.toFixed(2),
        })),
      })),
    };
  }

  async updateVendorOrderStatus(
    userId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: {
        ownerUserId: userId,
      },
      select: {
        id: true,
      },
    });

    if (!vendor) {
      throw new NotFoundException(
        'Vendor not found for this user',
      );
    }

    const note = dto.note?.trim() || null;
    const isCancelling = dto.status === OrderStatus.CANCELLED;

    const updatedOrder = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: {
            id: orderId,
          },
          select: {
            id: true,
            vendorId: true,
            status: true,
            isPasabuyRequest: true,
            items: {
              select: {
                productId: true,
              },
            },
          },
        });

        if (!order) {
          throw new NotFoundException('Order not found');
        }

        if (order.vendorId !== vendor.id) {
          throw new ForbiddenException(
            'You do not have permission to update this order',
          );
        }

        if (order.status === dto.status) {
          return tx.order.findUniqueOrThrow({
            where: { id: order.id },
            include: {
              vendor: true,
              items: {
                include: {
                  product: true,
                },
              },
            },
          });
        }

        this.validateOrderStatusTransition(
          order.status,
          dto.status,
          order.isPasabuyRequest,
        );

        const updated = await tx.order.update({
          where: {
            id: order.id,
          },
          data: {
            status: dto.status,
            ...(isCancelling
              ? {
                  cancellationReason: dto.cancellationReason,
                  cancellationNote:
                    dto.cancellationNote?.trim() || null,
                }
              : {}),
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

        if (
          isCancelling &&
          dto.cancellationReason ===
            CancellationReason.NOT_AVAILABLE
        ) {
          const productIds = order.items.map(
            (item) => item.productId,
          );
          await tx.product.updateMany({
            where: {
              id: { in: productIds },
            },
            data: {
              isAvailable: false,
            },
          });
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: dto.status,
            changedByUserId: userId,
            note,
          },
        });

        return updated;
      },
    );

    return this.buildOrderResponse(updatedOrder);
  }

  async confirmPickup(
    userId: string,
    orderId: string,
  ) {
    const pickupConfirmedAt = new Date();

    const updatedOrder = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            OR: [
              { customerId: userId },
              {
                groupOrder: {
                  participants: {
                    some: { userId, status: 'JOINED' },
                  },
                },
              },
            ],
          },
          select: {
            id: true,
            status: true,
            customerId: true,
            pickupConfirmedAt: true,
            groupOrder: {
              select: {
                initiator: {
                  select: { allowParticipantOrderCompletion: true },
                },
              },
            },
          },
        });

        if (!order) {
          throw new NotFoundException('Order not found');
        }

        const isOwner = order.customerId === userId;

        if (
          !isOwner &&
          order.groupOrder &&
          !order.groupOrder.initiator.allowParticipantOrderCompletion
        ) {
          throw new ForbiddenException(
            'Only the group order owner can complete this order',
          );
        }

        if (order.pickupConfirmedAt) {
          throw new ConflictException(
            'Order pickup has already been confirmed',
          );
        }

        const pickupEligibleStatuses: OrderStatus[] = [
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.READY_FOR_PICKUP,
        ];

        if (!pickupEligibleStatuses.includes(order.status)) {
          throw new BadRequestException(
            'Order is not ready for pickup',
          );
        }

        const updateResult = await tx.order.updateMany({
          where: {
            id: order.id,
            status: order.status,
            pickupConfirmedAt: null,
          },
          data: {
            status: OrderStatus.COMPLETED,
            pickupConfirmedAt,
          },
        });

        if (updateResult.count !== 1) {
          throw new ConflictException(
            'Order pickup has already been confirmed',
          );
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: OrderStatus.COMPLETED,
            changedByUserId: userId,
            note: isOwner
              ? 'Order completed by customer'
              : 'Order completed by group order participant',
          },
        });

        return tx.order.findUniqueOrThrow({
          where: {
            id: order.id,
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
      },
    );

    return this.buildOrderResponse(updatedOrder);
  }

  async getVendorDashboard(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId: userId },
      select: { id: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found for this user');
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        customer: { select: { fullName: true } },
        items: {
          take: 1,
          select: { product: { select: { name: true } } },
        },
      },
    });

    const todayOrders = orders.filter((order) => order.createdAt >= startOfToday);
    const todaySales = todayOrders.reduce(
      (total, order) => total.add(order.totalAmount),
      new Prisma.Decimal(0),
    );
    const pendingStatuses = new Set([
      'PENDING',
      'PAID',
      'COOKING',
      'OUT_FOR_DELIVERY',
      'READY_FOR_PICKUP',
    ]);
    const pendingOrders = orders.filter((order) => pendingStatuses.has(order.status)).length;

    return {
      todaySales: todaySales.toFixed(2),
      averageTicket: todayOrders.length
        ? todaySales.div(todayOrders.length).toFixed(2)
        : '0.00',
      pendingOrders,
      recentOrders: orders.slice(0, 5).map((order) => ({
        id: order.id,
        customer: order.customer.fullName,
        item: order.items[0]?.product.name ?? 'No items',
        total: order.totalAmount.toFixed(2),
        status: order.status,
        createdAt: order.createdAt,
      })),
    };
  }

  private validateOrderStatusTransition(
    currentStatus: OrderStatus,
    nextStatus: OrderStatus,
    isPasabuyRequest: boolean,
  ) {
    const allowedTransitions: Record<
      OrderStatus,
      OrderStatus[]
    > = {
      PENDING: [
        OrderStatus.PAID,
        OrderStatus.CANCELLED,
      ],
      PAID: [
        OrderStatus.COOKING,
        OrderStatus.CANCELLED,
      ],
      COOKING: [
        isPasabuyRequest
          ? OrderStatus.OUT_FOR_DELIVERY
          : OrderStatus.READY_FOR_PICKUP,
        OrderStatus.CANCELLED,
      ],
      OUT_FOR_DELIVERY: [
        OrderStatus.COMPLETED,
      ],
      READY_FOR_PICKUP: [
        OrderStatus.COMPLETED,
      ],
      COMPLETED: [],
      CANCELLED: [],
    };

    if (
      !allowedTransitions[currentStatus].includes(
        nextStatus,
      )
    ) {
      throw new BadRequestException(
        `Invalid order status transition from ${currentStatus} to ${nextStatus}`,
      );
    }
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
    const estimatedWaitMinutes =
      order.estimatedReadyAt &&
      order.status !== OrderStatus.COMPLETED &&
      order.status !== OrderStatus.CANCELLED
        ? Math.max(
            0,
            Math.ceil(
              (order.estimatedReadyAt.getTime() - Date.now()) /
                60_000,
            ),
          )
        : null;

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
      isPasabuyRequest: order.isPasabuyRequest,
      cancellationReason: order.cancellationReason,
      cancellationNote: order.cancellationNote,
      estimatedReadyAt: order.estimatedReadyAt,
      pickupConfirmedAt: order.pickupConfirmedAt,
      estimatedWaitMinutes,
      subtotal: order.subtotal.toFixed(2),
    };
  }
  }
