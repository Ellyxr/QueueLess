import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { Interval } from '@nestjs/schedule';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpsertPasabuyProfileDto } from './dto/upsert-pasabuy-profile.dto';

@Injectable()
export class PasabuyService {
  private readonly logger = new Logger(PasabuyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Interval(30_000)
  async expireOpenRequests() {
    const expired = await this.prisma.pasabuyRequest.findMany({
      where: { status: 'PENDING', expiresAt: { lte: new Date() } },
      select: { id: true },
      take: 50,
    });
    for (const request of expired) {
      try {
        const changed = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.pasabuyRequest.updateMany({
            where: { id: request.id, status: 'PENDING', expiresAt: { lte: new Date() } },
            data: { status: 'EXPIRED' },
          });
          if (updated.count) {
            await tx.pasabuyStatusHistory.create({
              data: { pasabuyRequestId: request.id, status: 'EXPIRED',
                note: 'Request window expired' },
            });
            await tx.auditRecord.create({ data: {
              actorUserId: null, actionType: 'PASABUY_STATUS_UPDATED',
              entityType: 'PasabuyRequest', entityId: request.id,
              beforeState: { status: 'PENDING' }, afterState: { status: 'EXPIRED' },
            } });
          }
          return updated.count;
        });
        if (changed) await this.realtimeGateway.emitPasabuyStatusUpdated(request.id);
      } catch (error) {
        this.logger.warn(`Could not expire Pasabuy request ${request.id}: ${String(error)}`);
      }
    }
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.pasabuyProfile.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        studentId: true,
        studentIdPhotoUrl: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      isComplete: Boolean(profile?.studentId?.trim() && profile.studentIdPhotoUrl && profile.verifiedAt),
      studentIdVerified: profile?.verifiedAt != null && profile.studentIdPhotoUrl != null,
      profile: profile && {
        id: profile.id,
        studentId: profile.studentId,
        studentIdVerified: profile.verifiedAt != null && profile.studentIdPhotoUrl != null,
        photoSubmitted: profile.studentIdPhotoUrl != null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    };
  }

  async getAvailableRequests(userId: string) {
    const profile = await this.prisma.pasabuyProfile.findUnique({
      where: { userId },
      select: { studentId: true, studentIdPhotoUrl: true, verifiedAt: true },
    });
    if (!profile?.studentId?.trim() || !profile.studentIdPhotoUrl || !profile.verifiedAt) {
      throw new ForbiddenException(
        'A verified student ID is required to browse requests',
      );
    }

    return this.prisma.pasabuyRequest.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        fulfillerUserId: null,
        requesterUserId: {
          not: userId,
        },
        relatedOrder: {
          status: { in: ['PAID', 'COOKING', 'READY_FOR_PICKUP'] },
        },
      },
      select: {
        id: true,
        status: true,
        itemDescription: true,
        pickupLocation: true,
        convenienceFee: true,
        feeTier: true,
        deliveryDistanceMeters: true,
        expiresAt: true,
        createdAt: true,
        relatedOrder: {
          select: {
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

  async getRequest(userId: string, requestId: string) {
    const request = await this.prisma.pasabuyRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true, requesterUserId: true, fulfillerUserId: true,
        status: true, paymentStatus: true, paymentDeadline: true,
        feeTier: true, convenienceFee: true, deliveryDistanceMeters: true,
        pickupLocation: true, dropoffLocation: true, itemDescription: true,
        expiresAt: true, acceptedAt: true, pickedUpAt: true,
        deliveredAt: true, createdAt: true, updatedAt: true,
        payment: { select: { id: true, status: true, amount: true } },
        pickupCode: true,
        statusHistory: { orderBy: { changedAt: 'asc' },
          select: { status: true, note: true, changedAt: true } },
      },
    });
    if (!request ||
      (request.requesterUserId !== userId && request.fulfillerUserId !== userId)) {
      throw new NotFoundException('Pasabuy request not found');
    }
    return {
      ...request,
      pickupCode: request.fulfillerUserId === userId &&
        request.paymentStatus === 'PAID' ? request.pickupCode : null,
    };
  }

  async confirmReceipt(userId: string, requestId: string) {
    const completed = await this.prisma.$transaction(async (tx) => {
      const request = await tx.pasabuyRequest.findUnique({
        where: { id: requestId },
        select: { requesterUserId: true },
      });
      if (!request || request.requesterUserId !== userId) {
        throw new NotFoundException('Pasabuy request not found');
      }
      const updated = await tx.pasabuyRequest.updateMany({
        where: { id: requestId, requesterUserId: userId, status: 'DELIVERED',
          paymentStatus: 'PAID' },
        data: { status: 'COMPLETED' },
      });
      if (updated.count !== 1) throw new ConflictException('Request is not ready to complete');
      await tx.pasabuyStatusHistory.create({
        data: { pasabuyRequestId: requestId, status: 'COMPLETED',
          changedByUserId: userId, note: 'Requester confirmed receipt' },
      });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'PASABUY_STATUS_UPDATED',
        entityType: 'PasabuyRequest', entityId: requestId,
        beforeState: { status: 'DELIVERED' }, afterState: { status: 'COMPLETED' },
      } });
      return tx.pasabuyRequest.findUniqueOrThrow({ where: { id: requestId },
        select: { id: true, status: true, paymentStatus: true, updatedAt: true } });
    });
    await this.realtimeGateway.emitPasabuyStatusUpdated(requestId);
    return completed;
  }

  async acceptRequest(
    userId: string,
    requestId: string,
  ) {
    const accepted = await this.prisma.$transaction(async (tx) => {
      const request = await tx.pasabuyRequest.findUnique({
        where: {
          id: requestId,
        },
        select: {
          id: true,
          requesterUserId: true,
          fulfillerUserId: true,
          status: true,
          expiresAt: true,
          relatedOrder: { select: { status: true } },
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
              studentIdPhotoUrl: true,
              verifiedAt: true,
            },
          },
        },
      });

      if (!user?.isActive) {
        throw new ForbiddenException(
          'Your account is not eligible to accept Pasabuy requests',
        );
      }

      if (!user.pasabuyProfile?.studentId?.trim() ||
        !user.pasabuyProfile.studentIdPhotoUrl || !user.pasabuyProfile.verifiedAt) {
        throw new ForbiddenException(
          'A verified student ID is required to accept a request',
        );
      }

      const acceptedAt = new Date();
      if (!request.expiresAt || request.expiresAt <= acceptedAt) {
        throw new ConflictException('Pasabuy request has expired');
      }
      if (!request.relatedOrder ||
        (request.relatedOrder.status !== 'PAID' &&
          request.relatedOrder.status !== 'COOKING' &&
          request.relatedOrder.status !== 'READY_FOR_PICKUP')) {
        throw new ConflictException('The related order is no longer eligible');
      }

      const claimed =
        await tx.pasabuyRequest.updateMany({
          where: {
            id: requestId,
            status: 'PENDING',
            expiresAt: { gt: acceptedAt },
            fulfillerUserId: null,
            relatedOrder: {
              status: { in: ['PAID', 'COOKING', 'READY_FOR_PICKUP'] },
            },
          },
          data: {
            fulfillerUserId: userId,
            status: 'AWAITING_PAYMENT',
            paymentStatus: 'AWAITING_PAYMENT',
            paymentDeadline: new Date(acceptedAt.getTime() + 5 * 60_000),
            pickupCode: randomInt(100000, 1000000).toString(),
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

      await tx.pasabuyStatusHistory.create({
        data: {
          pasabuyRequestId: requestId,
          status: 'AWAITING_PAYMENT',
          changedByUserId: userId,
          note: 'Waiting for requester to pay the Pasabuy fee',
        },
      });

      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'PASABUY_STATUS_UPDATED',
        entityType: 'PasabuyRequest', entityId: requestId,
        beforeState: { status: request.status },
        afterState: { status: 'AWAITING_PAYMENT', fulfillerUserId: userId },
      } });

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
          paymentStatus: true,
          paymentDeadline: true,
          totalAmount: true,
          acceptedAt: true,
          createdAt: true,
        },
      });
    });
    await this.realtimeGateway.emitPasabuyStatusUpdated(requestId);
    return accepted;
  }

  async markPickedUp(
    userId: string,
    requestId: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.pasabuyRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          requesterUserId: true,
          fulfillerUserId: true,
          status: true,
          paymentStatus: true,
          relatedOrderId: true,
          relatedOrder: { select: { status: true } },
        },
      });

      if (!request) {
        throw new NotFoundException('Pasabuy request not found');
      }
      if (request.fulfillerUserId !== userId) {
        throw new ForbiddenException(
          'Only the assigned fulfiller can mark this Pasabuy request as picked up',
        );
      }
      if (request.status !== 'PICKUP_READY' || request.paymentStatus !== 'PAID') {
        throw new ConflictException(
          'The fee must be paid and the pickup code verified by the vendor',
        );
      }
      if (!request.relatedOrderId || !request.relatedOrder) {
        throw new ConflictException(
          'Pasabuy request is not linked to an order',
        );
      }
      if (request.relatedOrder.status !== 'READY_FOR_PICKUP') {
        throw new ConflictException(
          'The related order must be ready for pickup before it can be collected',
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
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'ORDER_STATUS_UPDATED',
        entityType: 'Order', entityId: request.relatedOrderId,
        beforeState: { status: 'READY_FOR_PICKUP' },
        afterState: { status: 'COMPLETED', source: 'PASABUY_PICKUP' },
      } });

      const pickedUpAt = new Date();
      const updated = await tx.pasabuyRequest.updateMany({
        where: {
          id: requestId,
          fulfillerUserId: userId,
          status: 'PICKUP_READY',
          paymentStatus: 'PAID',
          pickupVerifiedAt: { not: null },
        },
        data: {
          status: 'PICKED_UP',
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
          status: 'PICKED_UP',
          changedByUserId: userId,
          note: 'Pasabuy order picked up',
        },
      });
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'PASABUY_STATUS_UPDATED',
        entityType: 'PasabuyRequest', entityId: requestId,
        beforeState: { status: 'PICKUP_READY' }, afterState: { status: 'PICKED_UP' },
      } });

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

      const updatedRequest = await tx.pasabuyRequest.findUnique({
        where: { id: requestId },
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

      const order = await tx.order.findUniqueOrThrow({
        where: { id: request.relatedOrderId },
        select: {
          id: true,
          customerId: true,
          status: true,
          updatedAt: true,
        },
      });

      return { updatedRequest, order };
    });

    await this.realtimeGateway.emitOrderStatusUpdated(
      result.order.customerId,
      {
        orderId: result.order.id,
        status: result.order.status,
        updatedAt: result.order.updatedAt,
      },
    );

    await this.realtimeGateway.emitPasabuyStatusUpdated(requestId);

    return result.updatedRequest;
  }

  async markDelivered(
    userId: string,
    requestId: string,
  ) {
    const delivered = await this.prisma.$transaction(async (tx) => {
      const request = await tx.pasabuyRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          requesterUserId: true,
          fulfillerUserId: true,
          status: true,
        },
      });

      if (!request) {
        throw new NotFoundException('Pasabuy request not found');
      }
      if (request.fulfillerUserId !== userId) {
        throw new ForbiddenException(
          'Only the assigned fulfiller can mark this Pasabuy request as delivered',
        );
      }
      if (request.status !== 'PICKED_UP') {
        throw new ConflictException(
          'Only an in-progress Pasabuy request can be marked as delivered',
        );
      }

      const deliveredAt = new Date();
      const updated = await tx.pasabuyRequest.updateMany({
        where: {
          id: requestId,
          fulfillerUserId: userId,
          status: 'PICKED_UP',
        },
        data: { status: 'DELIVERED', deliveredAt },
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
      await tx.auditRecord.create({ data: {
        actorUserId: userId, actionType: 'PASABUY_STATUS_UPDATED',
        entityType: 'PasabuyRequest', entityId: requestId,
        beforeState: { status: 'PICKED_UP' }, afterState: { status: 'DELIVERED' },
      } });

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
        where: { id: requestId },
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
    await this.realtimeGateway.emitPasabuyStatusUpdated(requestId);
    return delivered;
  }

  async upsertProfile(
    userId: string,
    dto: UpsertPasabuyProfileDto,
  ) {
    const studentId = dto.studentId.trim();
    const existing = await this.prisma.pasabuyProfile.findUnique({
      where: { userId }, select: { studentId: true },
    });

    try {
      const profile = await this.prisma.pasabuyProfile.upsert({
        where: {
          userId,
        },
        update: {
          studentId,
          ...(existing?.studentId !== studentId
            ? { studentIdPhotoUrl: null, verifiedAt: null }
            : {}),
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

      const current = await this.prisma.pasabuyProfile.findUniqueOrThrow({
        where: { userId }, select: { verifiedAt: true, studentIdPhotoUrl: true },
      });
      return { isComplete: current.verifiedAt != null && current.studentIdPhotoUrl != null,
        studentIdVerified: current.verifiedAt != null && current.studentIdPhotoUrl != null,
        profile: {
          id: profile.id,
          studentId: profile.studentId,
          studentIdVerified: current.verifiedAt != null && current.studentIdPhotoUrl != null,
          photoSubmitted: current.studentIdPhotoUrl != null,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        } };
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
