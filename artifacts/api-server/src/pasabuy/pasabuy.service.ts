import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/prisma/prisma.service';
import { UpsertPasabuyProfileDto } from './dto/upsert-pasabuy-profile.dto';

@Injectable()
export class PasabuyService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.pasabuyProfile.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        studentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      isComplete: Boolean(profile?.studentId?.trim()),
      profile,
    };
  }

  async getAvailableRequests(userId: string) {
    return this.prisma.pasabuyRequest.findMany({
      where: {
        status: 'PENDING',
        fulfillerUserId: null,
        requesterUserId: {
          not: userId,
        },
      },
      select: {
        id: true,
        status: true,
        itemDescription: true,
        pickupLocation: true,
        dropoffLocation: true,
        convenienceFee: true,
        totalAmount: true,
        createdAt: true,
        requester: {
          select: {
            id: true,
            fullName: true,
          },
        },
        relatedOrder: {
          select: {
            id: true,
            estimatedReadyAt: true,
            vendor: {
              select: {
                id: true,
                businessName: true,
              },
            },
            items: {
              select: {
                quantity: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async acceptRequest(
    userId: string,
    requestId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.pasabuyRequest.findUnique({
        where: {
          id: requestId,
        },
        select: {
          id: true,
          requesterUserId: true,
          fulfillerUserId: true,
          status: true,
        },
      });

      if (!request) {
        throw new NotFoundException(
          'Pasabuy request not found',
        );
      }

      if (request.requesterUserId === userId) {
        throw new BadRequestException(
          'You cannot accept your own Pasabuy request',
        );
      }

      const user = await tx.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          isActive: true,
          pasabuyProfile: {
            select: {
              studentId: true,
            },
          },
        },
      });

      if (!user?.isActive) {
        throw new ForbiddenException(
          'Your account is not eligible to accept Pasabuy requests',
        );
      }

      if (!user.pasabuyProfile?.studentId?.trim()) {
        throw new ForbiddenException(
          'Complete your Pasabuy profile before accepting a request',
        );
      }

      const acceptedAt = new Date();

      const claimed =
        await tx.pasabuyRequest.updateMany({
          where: {
            id: requestId,
            status: 'PENDING',
            fulfillerUserId: null,
          },
          data: {
            fulfillerUserId: userId,
            status: 'ACCEPTED',
            acceptedAt,
          },
        });

      if (claimed.count !== 1) {
        throw new ConflictException(
          'This Pasabuy request is no longer available',
        );
      }

      await tx.pasabuyStatusHistory.create({
        data: {
          pasabuyRequestId: requestId,
          status: 'ACCEPTED',
          changedByUserId: userId,
          note: 'Pasabuy request accepted',
        },
      });

      await tx.notification.create({
        data: {
          userId: request.requesterUserId,
          type: 'PASABUY_ACCEPTED',
          title: 'Pasabuy request accepted',
          body: 'A student has accepted your Pasabuy request.',
          relatedEntityType: 'PASABUY_REQUEST',
          relatedEntityId: requestId,
        },
      });

      return tx.pasabuyRequest.findUnique({
        where: {
          id: requestId,
        },
        select: {
          id: true,
          status: true,
          requesterUserId: true,
          fulfillerUserId: true,
          itemDescription: true,
          convenienceFee: true,
          totalAmount: true,
          acceptedAt: true,
          createdAt: true,
        },
      });
    });
  }

  async markPickedUp(
  userId: string,
  requestId: string,
) {
  return this.prisma.$transaction(async (tx) => {
    const request = await tx.pasabuyRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        requesterUserId: true,
        fulfillerUserId: true,
        status: true,
        relatedOrderId: true,
        relatedOrder: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Pasabuy request not found',
      );
    }

    if (request.fulfillerUserId !== userId) {
      throw new ForbiddenException(
        'Only the assigned fulfiller can mark this Pasabuy request as picked up',
      );
    }

    if (request.status !== 'ACCEPTED') {
      throw new ConflictException(
        'Only an accepted Pasabuy request can be marked as picked up',
      );
    }

    if (
      !request.relatedOrderId ||
      !request.relatedOrder
    ) {
      throw new ConflictException(
        'Pasabuy request is not linked to an order',
      );
    }

    if (request.relatedOrder.status !== 'READY_FOR_PICKUP') {
      throw new ConflictException(
        'The related order must be ready for pickup before it can be collected',
      );
    }

    if (request.fulfillerUserId !== userId) {
      throw new ForbiddenException(
        'Only the assigned fulfiller can mark this Pasabuy request as picked up',
      );
    }

    if (request.status !== 'ACCEPTED') {
      throw new ConflictException(
        'Only an accepted Pasabuy request can be marked as picked up',
      );
    }
    const completedOrder = await tx.order.updateMany({
      where: {
        id: request.relatedOrderId,
        status: 'READY_FOR_PICKUP',
        pickupConfirmedAt: null,
      },
      data: {
        status: 'COMPLETED',
        pickupConfirmedAt: new Date(),
      },
    });

    if (completedOrder.count !== 1) {
      throw new ConflictException(
        'The related order is no longer available for pickup',
      );
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: request.relatedOrderId,
        status: 'COMPLETED',
        changedByUserId: userId,
        note: 'Order collected by assigned Pasabuy fulfiller',
      },
    });
    const pickedUpAt = new Date();

    const updated = await tx.pasabuyRequest.updateMany({
      where: {
        id: requestId,
        fulfillerUserId: userId,
        status: 'ACCEPTED',
      },
      data: {
        status: 'IN_PROGRESS',
        pickedUpAt,
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Pasabuy request status has already changed',
      );
    }

    await tx.pasabuyStatusHistory.create({
      data: {
        pasabuyRequestId: requestId,
        status: 'IN_PROGRESS',
        changedByUserId: userId,
        note: 'Pasabuy order picked up',
      },
    });

    await tx.notification.create({
      data: {
        userId: request.requesterUserId,
        type: 'PASABUY_PICKED_UP',
        title: 'Pasabuy order picked up',
        body: 'Your Pasabuy order has been picked up and is on the way.',
        relatedEntityType: 'PASABUY_REQUEST',
        relatedEntityId: requestId,
      },
    });

    return tx.pasabuyRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        status: true,
        requesterUserId: true,
        fulfillerUserId: true,
        itemDescription: true,
        convenienceFee: true,
        totalAmount: true,
        acceptedAt: true,
        pickedUpAt: true,
        deliveredAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });
}

async markDelivered(
  userId: string,
  requestId: string,
) {
  return this.prisma.$transaction(async (tx) => {
    const request = await tx.pasabuyRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        requesterUserId: true,
        fulfillerUserId: true,
        status: true,
      },
    });

    if (!request) {
      throw new NotFoundException(
        'Pasabuy request not found',
      );
    }

    if (request.fulfillerUserId !== userId) {
      throw new ForbiddenException(
        'Only the assigned fulfiller can mark this Pasabuy request as delivered',
      );
    }

    if (request.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        'Only an in-progress Pasabuy request can be marked as delivered',
      );
    }

    const deliveredAt = new Date();

    const updated = await tx.pasabuyRequest.updateMany({
      where: {
        id: requestId,
        fulfillerUserId: userId,
        status: 'IN_PROGRESS',
      },
      data: {
        status: 'DELIVERED',
        deliveredAt,
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException(
        'Pasabuy request status has already changed',
      );
    }

    await tx.pasabuyStatusHistory.create({
      data: {
        pasabuyRequestId: requestId,
        status: 'DELIVERED',
        changedByUserId: userId,
        note: 'Pasabuy order delivered',
      },
    });

    await tx.notification.create({
      data: {
        userId: request.requesterUserId,
        type: 'PASABUY_DELIVERED',
        title: 'Pasabuy order delivered',
        body: 'Your Pasabuy order has been marked as delivered.',
        relatedEntityType: 'PASABUY_REQUEST',
        relatedEntityId: requestId,
      },
    });

    return tx.pasabuyRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        id: true,
        status: true,
        requesterUserId: true,
        fulfillerUserId: true,
        itemDescription: true,
        convenienceFee: true,
        totalAmount: true,
        acceptedAt: true,
        pickedUpAt: true,
        deliveredAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });
}

  async upsertProfile(
    userId: string,
    dto: UpsertPasabuyProfileDto,
  ) {
    const studentId = dto.studentId.trim();

    try {
      const profile = await this.prisma.pasabuyProfile.upsert({
        where: {
          userId,
        },
        update: {
          studentId,
        },
        create: {
          userId,
          studentId,
        },
        select: {
          id: true,
          studentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        isComplete: true,
        profile,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This Student ID is already associated with another account',
        );
      }

      throw error;
    }
  }
}
