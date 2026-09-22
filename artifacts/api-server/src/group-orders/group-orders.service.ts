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
import { JoinGroupOrderByCodeDto } from './dto/join-group-order-by-code.dto';
import { Prisma } from '@prisma/client';
import { SetPaymentSplitDto } from './dto/set-payment-split.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from '../common/pricing/pricing.service';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const PING_COOLDOWN_MS = 2 * 60_000;

const groupOrderInclude = {
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
  carts: {
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  },
  order: {
    include: {
      paymentShares: {
        include: {
          payer: {
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
} satisfies Prisma.GroupOrderInclude;

type GroupOrderWithRelations = Prisma.GroupOrderGetPayload<{
  include: typeof groupOrderInclude;
}>;

@Injectable()
export class GroupOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly pricingService: PricingService,
  ) {}

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }

  async createGroupOrder(userId: string, dto: CreateGroupOrderDto) {
    let vendor: {
      id: string;
      name: string;
      status: string;
      vendorType: string;
      campusLocation: string | null;
    } | null = null;

    if (dto.vendorId) {
      vendor = await this.prisma.vendor.findUnique({
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
    }

    const MAX_CODE_ATTEMPTS = 5;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = this.generateCode();

      try {
        const groupOrder = await this.prisma.$transaction(async (tx) => {
          const created = await tx.groupOrder.create({
            data: {
              initiatorUserId: userId,
              vendorId: vendor?.id,
              code,
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
            include: groupOrderInclude,
          });
        });

        return this.buildGroupOrderResponse(groupOrder);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error('Failed to generate a unique group order code');
  }

  async joinGroupOrder(userId: string, groupOrderId: string) {
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

      const existingParticipant = await tx.groupOrderParticipant.findUnique({
        where: {
          groupOrderId_userId: {
            groupOrderId,
            userId,
          },
        },
      });

      if (existingParticipant && existingParticipant.status === 'JOINED') {
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

      const updatedGroupOrder = await tx.groupOrder.findUniqueOrThrow({
        where: {
          id: groupOrderId,
        },
        include: groupOrderInclude,
      });

      return this.buildGroupOrderResponse(updatedGroupOrder);
    });
  }

  async joinGroupOrderByCode(userId: string, dto: JoinGroupOrderByCodeDto) {
    const groupOrder = await this.prisma.groupOrder.findUnique({
      where: {
        code: dto.code.trim().toUpperCase(),
      },
      select: { id: true },
    });

    if (!groupOrder) {
      throw new NotFoundException('Group order not found');
    }

    return this.joinGroupOrder(userId, groupOrder.id);
  }

  async getGroupOrder(userId: string, groupOrderId: string) {
    const groupOrder = await this.prisma.groupOrder.findUnique({
      where: {
        id: groupOrderId,
      },
      include: groupOrderInclude,
    });

    if (!groupOrder) {
      throw new NotFoundException('Group order not found');
    }

    const participant = groupOrder.participants.find(
      (item) => item.userId === userId && item.status === 'JOINED',
    );

    if (!participant) {
      throw new NotFoundException('Group order not found');
    }

    return this.buildGroupOrderResponse(groupOrder);
  }

  async lockGroupOrder(userId: string, groupOrderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const groupOrder = await tx.groupOrder.findUnique({
        where: {
          id: groupOrderId,
        },
        select: {
          id: true,
          initiatorUserId: true,
          status: true,
          vendorId: true,
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
        throw new BadRequestException('Only an open group order can be locked');
      }

      if (!groupOrder.vendorId) {
        throw new BadRequestException(
          'Choose a vendor and add at least one item before locking the group order',
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
        throw new BadRequestException('Group order is no longer open');
      }

      const updatedGroupOrder = await tx.groupOrder.findUniqueOrThrow({
        where: {
          id: groupOrderId,
        },
        include: groupOrderInclude,
      });

      return this.buildGroupOrderResponse(updatedGroupOrder);
    });
  }

  async addGroupOrderItem(
    userId: string,
    groupOrderId: string,
    dto: AddGroupOrderItemDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      let groupOrder = await tx.groupOrder.findUnique({
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

      const product = await tx.product.findUnique({
        where: {
          id: dto.productId,
        },
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

      if (!groupOrder.vendorId) {
        if (product.vendor.status !== 'ACTIVE') {
          throw new BadRequestException(
            'Cannot start a group order for an inactive vendor',
          );
        }

        const assignResult = await tx.groupOrder.updateMany({
          where: {
            id: groupOrderId,
            vendorId: null,
          },
          data: {
            vendorId: product.vendorId,
          },
        });

        if (assignResult.count === 1) {
          groupOrder = {
            ...groupOrder,
            vendorId: product.vendorId,
            vendor: product.vendor,
          };
        } else {
          // Another concurrent request already assigned a vendor; re-fetch and validate against it.
          const refreshed = await tx.groupOrder.findUniqueOrThrow({
            where: { id: groupOrderId },
            include: { vendor: true },
          });
          groupOrder = { ...groupOrder, vendorId: refreshed.vendorId, vendor: refreshed.vendor };
        }
      }

      if (!groupOrder.vendor || groupOrder.vendor.status !== 'ACTIVE') {
        throw new BadRequestException('Vendor is not active');
      }

      if (product.vendorId !== groupOrder.vendorId) {
        throw new BadRequestException(
          'Product does not belong to the group order vendor',
        );
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
        throw new BadRequestException('Group order cart is no longer active');
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
            quantity: existingItem.quantity + dto.quantity,
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
        vendorId: groupOrder.vendorId,
        participantId: participant.id,
        cartId: updatedCart.id,
        status: updatedCart.status,
        items: updatedCart.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.price.toFixed(2),
          subtotal: item.product.price.mul(item.quantity).toFixed(2),
        })),
        total: updatedCart.items
          .reduce(
            (sum, item) => sum + item.product.price.toNumber() * item.quantity,
            0,
          )
          .toFixed(2),
      };
    });
  }

  async removeGroupOrderItem(
    userId: string,
    groupOrderId: string,
    itemId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const groupOrder = await tx.groupOrder.findUnique({
        where: {
          id: groupOrderId,
        },
        include: {
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
          'Items can only be removed while the group order is open',
        );
      }

      const participant = groupOrder.participants.find(
        (item) => item.status === 'JOINED',
      );

      if (!participant) {
        throw new ForbiddenException(
          'You must join the group order before removing items',
        );
      }

      const deleted = await tx.cartItem.deleteMany({
        where: {
          id: itemId,
          cart: {
            groupOrderId,
            userId,
          },
        },
      });

      if (deleted.count === 0) {
        throw new NotFoundException('Item not found in your cart');
      }

      const cart = await tx.cart.findFirstOrThrow({
        where: {
          groupOrderId,
          userId,
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
        cartId: cart.id,
        items: cart.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.price.toFixed(2),
          subtotal: item.product.price.mul(item.quantity).toFixed(2),
        })),
        total: cart.items
          .reduce(
            (sum, item) => sum + item.product.price.toNumber() * item.quantity,
            0,
          )
          .toFixed(2),
      };
    });
  }

  async cancelGroupOrder(userId: string, groupOrderId: string) {
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
          'Only the group order initiator can delete this group order',
        );
      }

      if (groupOrder.status !== 'OPEN' && groupOrder.status !== 'LOCKED') {
        throw new BadRequestException(
          'Only an open or locked group order can be deleted',
        );
      }

      const result = await tx.groupOrder.updateMany({
        where: {
          id: groupOrderId,
          initiatorUserId: userId,
          status: groupOrder.status,
        },
        data: {
          status: 'CANCELLED',
        },
      });

      if (result.count !== 1) {
        throw new ConflictException(
          'Group order could not be deleted because its status changed',
        );
      }

      const updatedGroupOrder = await tx.groupOrder.findUniqueOrThrow({
        where: {
          id: groupOrderId,
        },
        include: groupOrderInclude,
      });

      return this.buildGroupOrderResponse(updatedGroupOrder);
    });
  }

  async pingOwner(userId: string, groupOrderId: string) {
    const groupOrder = await this.prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
      include: {
        initiator: {
          select: { id: true, fullName: true },
        },
        vendor: { select: { name: true } },
        participants: {
          where: { userId, status: 'JOINED' },
        },
      },
    });

    if (!groupOrder) {
      throw new NotFoundException('Group order not found');
    }

    if (groupOrder.participants.length === 0) {
      throw new NotFoundException('Group order not found');
    }

    if (groupOrder.initiatorUserId === userId) {
      throw new BadRequestException(
        'The group order owner cannot ping themselves',
      );
    }

    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });

    const alreadyPinged = await this.notificationsService.hasRecentUnread(
      'GroupOrder',
      groupOrderId,
      'GROUP_ORDER_PING',
      PING_COOLDOWN_MS,
    );

    if (!alreadyPinged) {
      await this.notificationsService.create(
        groupOrder.initiatorUserId,
        'GROUP_ORDER_PING',
        'Group order ping',
        `${requester?.fullName || 'A member'} is asking about your group order${
          groupOrder.vendor ? ` at ${groupOrder.vendor.name}` : ''
        }.`,
        'GroupOrder',
        groupOrderId,
      );
    }

    return { message: 'Owner notified' };
  }

  private buildGroupOrderResponse(groupOrder: GroupOrderWithRelations) {
    const cartsByUserId = new Map(
      groupOrder.carts.map((cart) => [cart.userId, cart]),
    );

    return {
      id: groupOrder.id,
      code: groupOrder.code,
      status: groupOrder.status,
      initiator: groupOrder.initiator,
      vendor: groupOrder.vendor
        ? {
            id: groupOrder.vendor.id,
            name: groupOrder.vendor.name,
            status: groupOrder.vendor.status,
            vendorType: groupOrder.vendor.vendorType,
            campusLocation: groupOrder.vendor.campusLocation,
          }
        : null,
      participants: groupOrder.participants.map((participant) => {
        const cart = cartsByUserId.get(participant.userId);
        const items = (cart?.items ?? []).map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.price.toFixed(2),
          subtotal: item.product.price.mul(item.quantity).toFixed(2),
        }));

        return {
          participantId: participant.id,
          user: participant.user,
          status: participant.status,
          joinedAt: participant.joinedAt,
          isOwner: participant.userId === groupOrder.initiatorUserId,
          items,
          subtotal: items
            .reduce((sum, item) => sum + Number(item.subtotal), 0)
            .toFixed(2),
        };
      }),
      participantCount: groupOrder.participants.filter(
        (participant) => participant.status === 'JOINED',
      ).length,
      authoritativeOrder: groupOrder.order
        ? {
            id: groupOrder.order.id,
            status: groupOrder.order.status,
            orderType: groupOrder.order.orderType,
            totalAmount: groupOrder.order.totalAmount.toFixed(2),
            paymentSplitMode: groupOrder.paymentSplitMode,
            paymentShares: groupOrder.order.paymentShares.map((share) => ({
              id: share.id,
              payer: share.payer,
              amountDue: share.amountDue.toFixed(2),
              status: share.status,
            })),
          }
        : null,
      createdAt: groupOrder.createdAt,
      updatedAt: groupOrder.updatedAt,
    };
  }

  async finalizeGroupOrder(userId: string, groupOrderId: string) {
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

      if (!groupOrder.vendor || groupOrder.vendor.status !== 'ACTIVE') {
        throw new BadRequestException('Vendor is not active');
      }

      const joinedParticipants = groupOrder.participants.filter(
        (participant) => participant.status === 'JOINED',
      );

      const participantByUserId = new Map(
        joinedParticipants.map((participant) => [participant.userId, participant]),
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
        throw new BadRequestException('Group order has no active contribution carts');
      }

      const allItems = groupCarts.flatMap((cart) =>
        cart.items.map((item) => ({
          cart,
          item,
        })),
      );

      if (allItems.length === 0) {
        throw new BadRequestException('Group order has no items');
      }

      let subtotal = new Prisma.Decimal(0);
      let estimatedWaitMinutes = 0;

      const orderItems = allItems.map(({ cart, item }) => {
        const participant = participantByUserId.get(cart.userId);

        if (!participant) {
          throw new BadRequestException(
            'A group cart belongs to a user who is not a joined participant',
          );
        }

        if (cart.vendorId !== groupOrder.vendorId) {
          throw new BadRequestException('A group cart belongs to a different vendor');
        }

        if (item.quantity < 1) {
          throw new BadRequestException('Item quantity must be at least 1');
        }

        if (!item.product.isAvailable) {
          throw new BadRequestException(`Product "${item.product.name}" is unavailable`);
        }

        if (item.product.vendorId !== groupOrder.vendorId) {
          throw new BadRequestException(
            `Product "${item.product.name}" does not belong to the group order vendor`,
          );
        }

        const lineSubtotal = item.product.price.mul(item.quantity).toDecimalPlaces(2);

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
      });

      subtotal = subtotal.toDecimalPlaces(2);

      const totals =
        this.pricingService.calculateOrderTotals(subtotal);

      subtotal = totals.subtotal;
      const marketplaceFee = totals.marketplaceFee;
      const totalAmount = totals.totalAmount;

      const estimatedReadyAt = new Date(Date.now() + estimatedWaitMinutes * 60_000);

      const finalizeResult = await tx.groupOrder.updateMany({
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
        throw new ConflictException('One or more group carts changed during finalization');
      }

      const order = await tx.order.create({
        data: {
          customerId: groupOrder.initiatorUserId,
          vendorId: groupOrder.vendorId!,
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
          marketplaceFee: order.marketplaceFee.toFixed(2),
          totalAmount: order.totalAmount.toFixed(2),
          estimatedReadyAt: order.estimatedReadyAt,
          items: order.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            name: item.product.name,
            quantity: item.quantity,
            unitPrice: item.unitPriceSnapshot.toFixed(2),
            subtotal: item.lineSubtotal.toFixed(2),
            participant: item.participant
              ? {
                  participantId: item.participant.id,
                  user: item.participant.user,
                }
              : null,
          })),
        },
      };
    });
  }

  async setPaymentSplit(
    userId: string,
    groupOrderId: string,
    dto: SetPaymentSplitDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const groupOrder = await tx.groupOrder.findUnique({
        where: {
          id: groupOrderId,
        },
        include: {
          participants: true,
          order: {
            include: {
              items: true,
              paymentShares: true,
            },
          },
        },
      });

      if (!groupOrder) {
        throw new NotFoundException('Group order not found');
      }

      if (groupOrder.initiatorUserId !== userId) {
        throw new ForbiddenException(
          'Only the group order initiator can configure the payment split',
        );
      }

      if (groupOrder.status !== 'FINALIZED' || !groupOrder.order) {
        throw new BadRequestException(
          'Payment split can only be configured after the group order is finalized',
        );
      }

      const joinedParticipants = groupOrder.participants.filter(
        (participant) => participant.status === 'JOINED',
      );

      if (joinedParticipants.length === 0) {
        throw new BadRequestException('Group order has no joined participants');
      }

      const existingShares = groupOrder.order.paymentShares;

      const paymentHasStarted = existingShares.some(
        (share) => share.status === 'PAID' || share.paymentId !== null,
      );

      if (paymentHasStarted) {
        throw new ConflictException('Payment split cannot be changed after payment has started');
      }

      const orderTotalCents = this.decimalToCents(groupOrder.order.totalAmount);

      if (orderTotalCents <= 0) {
        throw new BadRequestException('Order total must be greater than zero');
      }

      let calculatedShares: Array<{
        payerUserId: string;
        amountCents: number;
      }>;

      switch (dto.mode) {
        case 'ITEM_BASED':
          calculatedShares = this.calculateItemBasedShares(
            joinedParticipants,
            groupOrder.order.items,
            orderTotalCents,
          );
          break;

        case 'EQUAL':
          calculatedShares = this.calculateEqualShares(joinedParticipants, orderTotalCents);
          break;

        case 'CUSTOM':
          calculatedShares = this.calculateCustomShares(
            joinedParticipants,
            dto.customShares,
            orderTotalCents,
          );
          break;

        default:
          throw new BadRequestException('Unsupported payment split mode');
      }

      const calculatedTotalCents = calculatedShares.reduce(
        (sum, share) => sum + share.amountCents,
        0,
      );

      if (calculatedTotalCents !== orderTotalCents) {
        throw new BadRequestException(
          'Participant payment shares do not match the order total',
        );
      }

      await tx.paymentShare.deleteMany({
        where: {
          orderId: groupOrder.order.id,
        },
      });

      await tx.paymentShare.createMany({
        data: calculatedShares.map((share) => ({
          orderId: groupOrder.order!.id,
          payerUserId: share.payerUserId,
          amountDue: new Prisma.Decimal(share.amountCents).div(100),
          status: 'PENDING',
        })),
      });

      await tx.groupOrder.update({
        where: {
          id: groupOrder.id,
        },
        data: {
          paymentSplitMode: dto.mode,
        },
      });

      const paymentShares = await tx.paymentShare.findMany({
        where: {
          orderId: groupOrder.order.id,
        },
        include: {
          payer: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return {
        groupOrderId: groupOrder.id,
        orderId: groupOrder.order.id,
        paymentSplitMode: dto.mode,
        orderTotal: groupOrder.order.totalAmount.toFixed(2),

        paymentShares: paymentShares.map((share) => ({
          id: share.id,
          payer: share.payer,
          amountDue: share.amountDue.toFixed(2),
          status: share.status,
        })),

        totalAllocated: calculatedShares
          .reduce(
            (sum, share) => sum.add(new Prisma.Decimal(share.amountCents).div(100)),
            new Prisma.Decimal(0),
          )
          .toFixed(2),
      };
    });
  }

  private decimalToCents(value: Prisma.Decimal): number {
    return value.mul(100).toDecimalPlaces(0).toNumber();
  }

  private calculateItemBasedShares(
    participants: Array<{
      id: string;
      userId: string;
    }>,
    items: Array<{
      participantId: string | null;
      lineSubtotal: Prisma.Decimal;
    }>,
    orderTotalCents: number,
  ): Array<{
    payerUserId: string;
    amountCents: number;
  }> {
    const sortedParticipants = [...participants].sort((a, b) => a.id.localeCompare(b.id));

    const participantSubtotals = sortedParticipants.map((participant) => {
      const subtotal = items
        .filter((item) => item.participantId === participant.id)
        .reduce((sum, item) => sum.add(item.lineSubtotal), new Prisma.Decimal(0));

      return {
        payerUserId: participant.userId,
        subtotalCents: this.decimalToCents(subtotal),
      };
    });

    const totalItemCents = participantSubtotals.reduce(
      (sum, participant) => sum + participant.subtotalCents,
      0,
    );

    if (totalItemCents <= 0) {
      throw new BadRequestException(
        'Cannot calculate item-based shares because the group order has no payable items',
      );
    }

    let allocatedCents = 0;

    return participantSubtotals.map((participant, index) => {
      let amountCents: number;

      if (index === participantSubtotals.length - 1) {
        amountCents = orderTotalCents - allocatedCents;
      } else {
        amountCents = Math.round(
          (participant.subtotalCents * orderTotalCents) / totalItemCents,
        );

        allocatedCents += amountCents;
      }

      return {
        payerUserId: participant.payerUserId,
        amountCents,
      };
    });
  }

  private calculateEqualShares(
    participants: Array<{
      id: string;
      userId: string;
    }>,
    orderTotalCents: number,
  ): Array<{
    payerUserId: string;
    amountCents: number;
  }> {
    const sortedParticipants = [...participants].sort((a, b) => a.id.localeCompare(b.id));

    const baseAmount = Math.floor(orderTotalCents / sortedParticipants.length);

    const remainder = orderTotalCents % sortedParticipants.length;

    return sortedParticipants.map((participant, index) => ({
      payerUserId: participant.userId,
      amountCents: baseAmount + (index < remainder ? 1 : 0),
    }));
  }

  private calculateCustomShares(
    participants: Array<{
      id: string;
      userId: string;
    }>,
    customShares:
      | Array<{
          participantId: string;
          amount: number;
        }>
      | undefined,
    orderTotalCents: number,
  ): Array<{
    payerUserId: string;
    amountCents: number;
  }> {
    if (!customShares || customShares.length === 0) {
      throw new BadRequestException(
        'Custom shares are required when using CUSTOM payment split mode',
      );
    }

    if (customShares.length !== participants.length) {
      throw new BadRequestException(
        'Custom shares must include every joined participant exactly once',
      );
    }

    const participantMap = new Map(
      participants.map((participant) => [participant.id, participant]),
    );

    const seenParticipantIds = new Set<string>();

    const calculatedShares = customShares.map((customShare) => {
      const participant = participantMap.get(customShare.participantId);

      if (!participant) {
        throw new BadRequestException(
          'Custom share contains a participant who is not joined to this group order',
        );
      }

      if (seenParticipantIds.has(customShare.participantId)) {
        throw new BadRequestException('Each participant can only have one custom payment share');
      }

      seenParticipantIds.add(customShare.participantId);

      const amount = new Prisma.Decimal(customShare.amount.toString());

      const amountCents = this.decimalToCents(amount);

      if (amountCents <= 0) {
        throw new BadRequestException('Custom payment shares must be greater than zero');
      }

      return {
        payerUserId: participant.userId,
        amountCents,
      };
    });

    const customTotalCents = calculatedShares.reduce((sum, share) => sum + share.amountCents, 0);

    if (customTotalCents !== orderTotalCents) {
      throw new BadRequestException(
        'Custom payment shares must equal the authoritative order total',
      );
    }

    return calculatedShares;
  }
}
