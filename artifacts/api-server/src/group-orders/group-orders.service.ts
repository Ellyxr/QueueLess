import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateGroupOrderDto } from './dto/create-group-order.dto';
import { AddGroupOrderItemDto } from './dto/add-group-order-item.dto';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

@Injectable()
export class GroupOrdersService {
  constructor(
  private readonly prisma: PrismaService,
  private readonly configService: ConfigService,
) {}

  async createGroupOrder(
    userId: string,
    dto: CreateGroupOrderDto,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: {
        id: dto.vendorId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        vendorType: true,
        campusLocation: true,
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (vendor.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot create a group order for an inactive vendor',
      );
    }

    const groupOrder = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.groupOrder.create({
          data: {
            initiatorUserId: userId,
            vendorId: vendor.id,
            status: 'OPEN',
          },
        });

        await tx.groupOrderParticipant.create({
          data: {
            groupOrderId: created.id,
            userId,
            status: 'JOINED',
            joinedAt: new Date(),
          },
        });

        return tx.groupOrder.findUniqueOrThrow({
          where: {
            id: created.id,
          },
          include: {
            vendor: true,
            initiator: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
            order: {
              select: {
                id: true,
                status: true,
                orderType: true,
              },
            },
          },
        });
      },
    );

    return this.buildGroupOrderResponse(groupOrder);
  }

  async joinGroupOrder(
  userId: string,
  groupOrderId: string,
) {
  return this.prisma.$transaction(async (tx) => {
    const groupOrder = await tx.groupOrder.findUnique({
      where: {
        id: groupOrderId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!groupOrder) {
      throw new NotFoundException('Group order not found');
    }

    if (groupOrder.status !== 'OPEN') {
      throw new BadRequestException(
        'Group order is no longer open for participants',
      );
    }

    const existingParticipant =
      await tx.groupOrderParticipant.findUnique({
        where: {
          groupOrderId_userId: {
            groupOrderId,
            userId,
          },
        },
      });

    if (
      existingParticipant &&
      existingParticipant.status === 'JOINED'
    ) {
      throw new ConflictException(
        'You have already joined this group order',
      );
    }

    if (existingParticipant) {
      await tx.groupOrderParticipant.update({
        where: {
          id: existingParticipant.id,
        },
        data: {
          status: 'JOINED',
          joinedAt: new Date(),
        },
      });
    } else {
      await tx.groupOrderParticipant.create({
        data: {
          groupOrderId,
          userId,
          status: 'JOINED',
          joinedAt: new Date(),
        },
      });
    }

    const updatedGroupOrder =
      await tx.groupOrder.findUniqueOrThrow({
        where: {
          id: groupOrderId,
        },
        include: {
          vendor: true,
          initiator: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
          order: {
            select: {
              id: true,
              status: true,
              orderType: true,
            },
          },
        },
      });

    return this.buildGroupOrderResponse(
      updatedGroupOrder,
    );
  });
}

  async getGroupOrder(
  userId: string,
  groupOrderId: string,
) {
  const groupOrder =
    await this.prisma.groupOrder.findUnique({
      where: {
        id: groupOrderId,
      },
      include: {
        vendor: true,
        initiator: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            status: true,
            orderType: true,
          },
        },
      },
    });

  if (!groupOrder) {
    throw new NotFoundException('Group order not found');
  }

  const participant =
    groupOrder.participants.find(
      (item) =>
        item.userId === userId &&
        item.status === 'JOINED',
    );

  if (!participant) {
    throw new NotFoundException('Group order not found');
  }

  return this.buildGroupOrderResponse(groupOrder);
}

  async lockGroupOrder(
  userId: string,
  groupOrderId: string,
) {
  return this.prisma.$transaction(async (tx) => {
    const groupOrder = await tx.groupOrder.findUnique({
      where: {
        id: groupOrderId,
      },
      select: {
        id: true,
        initiatorUserId: true,
        status: true,
      },
    });

    if (!groupOrder) {
      throw new NotFoundException('Group order not found');
    }

    if (groupOrder.initiatorUserId !== userId) {
      throw new ForbiddenException(
        'Only the group order initiator can lock this group order',
      );
    }

    if (groupOrder.status !== 'OPEN') {
      throw new BadRequestException(
        'Only an open group order can be locked',
      );
    }

    const result = await tx.groupOrder.updateMany({
      where: {
        id: groupOrderId,
        initiatorUserId: userId,
        status: 'OPEN',
      },
      data: {
        status: 'LOCKED',
      },
    });

    if (result.count !== 1) {
      throw new BadRequestException(
        'Group order is no longer open',
      );
    }

    const updatedGroupOrder =
      await tx.groupOrder.findUniqueOrThrow({
        where: {
          id: groupOrderId,
        },
        include: {
          vendor: true,
          initiator: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
          order: {
            select: {
              id: true,
              status: true,
              orderType: true,
            },
          },
        },
      });

    return this.buildGroupOrderResponse(
      updatedGroupOrder,
    );
  });
}

async addGroupOrderItem(
  userId: string,
  groupOrderId: string,
  dto: AddGroupOrderItemDto,
) {
  return this.prisma.$transaction(async (tx) => {
    const groupOrder = await tx.groupOrder.findUnique({
      where: {
        id: groupOrderId,
      },
      include: {
        vendor: true,
        participants: {
          where: {
            userId,
          },
        },
      },
    });

    if (!groupOrder) {
      throw new NotFoundException('Group order not found');
    }

    if (groupOrder.status !== 'OPEN') {
      throw new BadRequestException(
        'Items can only be added while the group order is open',
      );
    }

    const participant = groupOrder.participants.find(
      (item) => item.status === 'JOINED',
    );

    if (!participant) {
      throw new ForbiddenException(
        'You must join the group order before adding items',
      );
    }

    if (groupOrder.vendor.status !== 'ACTIVE') {
      throw new BadRequestException('Vendor is not active');
    }

    const product = await tx.product.findUnique({
      where: {
        id: dto.productId,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.vendorId !== groupOrder.vendorId) {
      throw new BadRequestException(
        'Product does not belong to the group order vendor',
      );
    }

    if (!product.isAvailable) {
      throw new BadRequestException('Product is unavailable');
    }

    let cart = await tx.cart.findFirst({
  where: {
    groupOrderId,
    userId,
  },
});

    if (!cart) {
      cart = await tx.cart.create({
        data: {
          userId,
          vendorId: groupOrder.vendorId,
          groupOrderId,
          status: 'ACTIVE',
        },
      });
    } else if (cart.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Group order cart is no longer active',
      );
    }

    const existingItem = await tx.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: product.id,
        },
      },
    });

    if (existingItem) {
      await tx.cartItem.update({
        where: {
          id: existingItem.id,
        },
        data: {
          quantity:
            existingItem.quantity + dto.quantity,
        },
      });
    } else {
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          quantity: dto.quantity,
        },
      });
    }

    const updatedCart = await tx.cart.findUniqueOrThrow({
      where: {
        id: cart.id,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return {
      groupOrderId,
      participantId: participant.id,
      cartId: updatedCart.id,
      status: updatedCart.status,
      items: updatedCart.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price.toFixed(2),
        subtotal: item.product.price
          .mul(item.quantity)
          .toFixed(2),
      })),
      total: updatedCart.items
        .reduce(
          (sum, item) =>
            sum +
            item.product.price.toNumber() *
              item.quantity,
          0,
        )
        .toFixed(2),
    };
  });
}

  private buildGroupOrderResponse(groupOrder: {
    id: string;
    initiatorUserId: string;
    vendorId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    vendor: {
      id: string;
      name: string;
      status: string;
      vendorType: string;
      campusLocation: string | null;
    };
    initiator: {
      id: string;
      fullName: string;
      email: string;
    };
    participants: Array<{
      id: string;
      userId: string;
      status: string;
      joinedAt: Date | null;
      user: {
        id: string;
        fullName: string;
        email: string;
      };
    }>;
    order: {
      id: string;
      status: string;
      orderType: string;
    } | null;
  }) {
    return {
      id: groupOrder.id,
      status: groupOrder.status,
      initiator: groupOrder.initiator,
      vendor: {
        id: groupOrder.vendor.id,
        name: groupOrder.vendor.name,
        status: groupOrder.vendor.status,
        vendorType: groupOrder.vendor.vendorType,
        campusLocation: groupOrder.vendor.campusLocation,
      },
      participants: groupOrder.participants.map(
        (participant) => ({
          participantId: participant.id,
          user: participant.user,
          status: participant.status,
          joinedAt: participant.joinedAt,
        }),
      ),
      participantCount: groupOrder.participants.filter(
        (participant) => participant.status === 'JOINED',
      ).length,
      authoritativeOrder: groupOrder.order,
      createdAt: groupOrder.createdAt,
      updatedAt: groupOrder.updatedAt,
    };
  }

  async finalizeGroupOrder(
  userId: string,
  groupOrderId: string,
) {
  return this.prisma.$transaction(async (tx) => {
    const groupOrder = await tx.groupOrder.findUnique({
  where: {
    id: groupOrderId,
  },
  include: {
    vendor: true,
    participants: true,
    order: {
      select: {
        id: true,
      },
    },
  },
});

    if (!groupOrder) {
      throw new NotFoundException('Group order not found');
    }

    if (groupOrder.initiatorUserId !== userId) {
      throw new ForbiddenException(
        'Only the group order initiator can finalize this group order',
      );
    }

    if (groupOrder.order) {
      throw new ConflictException(
        'This group order already has an authoritative order',
      );
    }

    if (groupOrder.status !== 'LOCKED') {
      throw new BadRequestException(
        'Only a locked group order can be finalized',
      );
    }

    if (groupOrder.vendor.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Vendor is not active',
      );
    }

    const joinedParticipants =
      groupOrder.participants.filter(
        (participant) =>
          participant.status === 'JOINED',
      );

    const participantByUserId = new Map(
      joinedParticipants.map((participant) => [
        participant.userId,
        participant,
      ]),
    );

    const groupCarts = await tx.cart.findMany({
  where: {
    groupOrderId,
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

    if (groupCarts.length === 0) {
      throw new BadRequestException(
        'Group order has no active contribution carts',
      );
    }

    const allItems = groupCarts.flatMap((cart) =>
      cart.items.map((item) => ({
        cart,
        item,
      })),
    );

    if (allItems.length === 0) {
      throw new BadRequestException(
        'Group order has no items',
      );
    }

    let subtotal = new Prisma.Decimal(0);
    let estimatedWaitMinutes = 0;

    const orderItems = allItems.map(
      ({ cart, item }) => {
        const participant =
          participantByUserId.get(cart.userId);

        if (!participant) {
          throw new BadRequestException(
            'A group cart belongs to a user who is not a joined participant',
          );
        }

        if (cart.vendorId !== groupOrder.vendorId) {
          throw new BadRequestException(
            'A group cart belongs to a different vendor',
          );
        }

        if (item.quantity < 1) {
          throw new BadRequestException(
            'Item quantity must be at least 1',
          );
        }

        if (!item.product.isAvailable) {
          throw new BadRequestException(
            `Product "${item.product.name}" is unavailable`,
          );
        }

        if (
          item.product.vendorId !==
          groupOrder.vendorId
        ) {
          throw new BadRequestException(
            `Product "${item.product.name}" does not belong to the group order vendor`,
          );
        }

        const lineSubtotal = item.product.price
          .mul(item.quantity)
          .toDecimalPlaces(2);

        subtotal = subtotal.add(lineSubtotal);

        estimatedWaitMinutes = Math.max(
          estimatedWaitMinutes,
          item.product.preparationTimeMinutes,
        );

        return {
          productId: item.productId,
          participantId: participant.id,
          quantity: item.quantity,
          unitPriceSnapshot: item.product.price,
          lineSubtotal,
        };
      },
    );

    subtotal = subtotal.toDecimalPlaces(2);

    const marketplaceFeeRate =
      this.getMarketplaceFeeRate();

    const marketplaceFee = subtotal
      .mul(marketplaceFeeRate)
      .div(100)
      .toDecimalPlaces(2);

    const totalAmount = subtotal
      .add(marketplaceFee)
      .toDecimalPlaces(2);

    const estimatedReadyAt = new Date(
      Date.now() +
        estimatedWaitMinutes * 60_000,
    );

    const finalizeResult =
      await tx.groupOrder.updateMany({
        where: {
          id: groupOrderId,
          initiatorUserId: userId,
          status: 'LOCKED',
        },
        data: {
          status: 'FINALIZED',
        },
      });

    if (finalizeResult.count !== 1) {
      throw new ConflictException(
        'Group order could not be finalized because its status changed',
      );
    }

    const checkoutResult = await tx.cart.updateMany({
      where: {
        groupOrderId,
        status: 'ACTIVE',
      },
      data: {
        status: 'CHECKED_OUT',
      },
    });

    if (checkoutResult.count !== groupCarts.length) {
      throw new ConflictException(
        'One or more group carts changed during finalization',
      );
    }

    const order = await tx.order.create({
      data: {
        customerId: groupOrder.initiatorUserId,
        vendorId: groupOrder.vendorId,
        groupOrderId: groupOrder.id,
        orderType: 'GROUP',
        status: 'PENDING',
        subtotal,
        marketplaceFee,
        totalAmount,
        estimatedReadyAt,
        items: {
          create: orderItems,
        },
      },
      include: {
        vendor: true,
        items: {
          include: {
            product: true,
            participant: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      groupOrderId: groupOrder.id,
      groupOrderStatus: 'FINALIZED',
      authoritativeOrder: {
        id: order.id,
        orderType: order.orderType,
        status: order.status,
        vendor: {
          id: order.vendor.id,
          name: order.vendor.name,
        },
        subtotal: order.subtotal.toFixed(2),
        marketplaceFee:
          order.marketplaceFee.toFixed(2),
        totalAmount: order.totalAmount.toFixed(2),
        estimatedReadyAt:
          order.estimatedReadyAt,
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product.name,
          quantity: item.quantity,
          unitPrice:
            item.unitPriceSnapshot.toFixed(2),
          subtotal:
            item.lineSubtotal.toFixed(2),
          participant: item.participant
            ? {
                participantId:
                  item.participant.id,
                user: item.participant.user,
              }
            : null,
        })),
      },
    };
  });
}

    private getMarketplaceFeeRate(): Prisma.Decimal {
    const rawRate = this.configService.get<string>(
      'MARKETPLACE_FEE_RATE',
      '0',
    );

    let rate: Prisma.Decimal;

    try {
      rate = new Prisma.Decimal(rawRate);
    } catch {
      throw new BadRequestException(
        'Invalid marketplace fee configuration',
      );
    }

    if (rate.isNegative()) {
      throw new BadRequestException(
        'Invalid marketplace fee configuration',
      );
    }

    return rate;
  }
}
