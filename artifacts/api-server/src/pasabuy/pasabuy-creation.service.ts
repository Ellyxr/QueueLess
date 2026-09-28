import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PricingService } from '../common/pricing/pricing.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreatePasabuyRequestDto } from './dto/create-pasabuy-request.dto';

const REQUEST_WINDOW_MS = 15 * 60_000;

@Injectable()
export class PasabuyCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly pricing: PricingService,
  ) {}

  async create(userId: string, dto: CreatePasabuyRequestDto) {
    if (dto.termsAccepted !== true) {
      throw new BadRequestException('Pasabuy terms must be accepted');
    }
    const dropoffLocation = dto.dropoffLocation.trim();
    if (!dropoffLocation) {
      throw new BadRequestException('Dropoff location is required');
    }

    const bounds = process.env.PASABUY_CAMPUS_BOUNDS?.split(',').map(Number);
    if (!bounds || bounds.length !== 4 || bounds.some((value) => !Number.isFinite(value)) ||
      bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
      throw new ServiceUnavailableException('Pasabuy campus boundary is not configured');
    }

    try {
      const { request, expiredIds } = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: dto.orderId, customerId: userId },
          include: { vendor: true, items: { include: { product: true } } },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.isPreorder) {
          throw new ConflictException('Preorders cannot use Pasabuy');
        }
        if (order.orderType !== 'INDIVIDUAL' ||
          !(order.status === OrderStatus.PAID || order.status === OrderStatus.COOKING || order.status === OrderStatus.READY_FOR_PICKUP)) {
          throw new ConflictException('An individual paid order is required');
        }
        if (!order.items.length) throw new ConflictException('Order has no items');
        if (order.vendor.pickupLatitude == null || order.vendor.pickupLongitude == null ||
          !order.vendor.pickupLocation?.trim()) {
          throw new ConflictException('Vendor pickup address and coordinates are required');
        }
        const radians = (degrees: number) => degrees * Math.PI / 180;
        const dLat = radians(dto.dropoffLatitude - order.vendor.pickupLatitude);
        const dLon = radians(dto.dropoffLongitude - order.vendor.pickupLongitude);
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(radians(order.vendor.pickupLatitude)) * Math.cos(radians(dto.dropoffLatitude)) *
          Math.sin(dLon / 2) ** 2;
        const distance = Math.ceil(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        if (distance > 270) {
          throw new BadRequestException('Delivery location must be within 270 meters of the vendor');
        }

        const inCampus = dto.dropoffLatitude >= bounds[0] && dto.dropoffLatitude <= bounds[2] &&
          dto.dropoffLongitude >= bounds[1] && dto.dropoffLongitude <= bounds[3];
        const feeAssessment = this.pricing.calculatePasabuyFee(inCampus);
        const fee = feeAssessment.amount;
        const now = new Date();
        const expired = await tx.pasabuyRequest.findMany({
          where: { relatedOrderId: order.id, status: 'PENDING', expiresAt: { lte: now } },
          select: { id: true },
        });
        const expiredIds: string[] = [];
        for (const oldRequest of expired) {
          const changed = await tx.pasabuyRequest.updateMany({
            where: { id: oldRequest.id, status: 'PENDING', expiresAt: { lte: now } },
            data: { status: 'EXPIRED' },
          });
          if (changed.count) {
            expiredIds.push(oldRequest.id);
            await tx.pasabuyStatusHistory.create({
              data: { pasabuyRequestId: oldRequest.id, status: 'EXPIRED', note: 'Request window expired' },
            });
            await tx.auditRecord.create({ data: {
              actorUserId: null, actionType: 'PASABUY_STATUS_UPDATED',
              entityType: 'PasabuyRequest', entityId: oldRequest.id,
              beforeState: { status: 'PENDING' }, afterState: { status: 'EXPIRED' },
            } });
          }
        }
        const active = await tx.pasabuyRequest.findFirst({
          where: {
            relatedOrderId: order.id,
            status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED', 'PAYMENT_EXPIRED'] },
          },
          select: { id: true },
        });
        if (active) throw new ConflictException('Order already has an active Pasabuy request');

        const request = await tx.pasabuyRequest.create({
          data: {
            requesterUserId: userId,
            relatedOrderId: order.id,
            status: 'PENDING',
            paymentStatus: 'NOT_CHARGED',
            pickupLocation: order.vendor.pickupLocation,
            dropoffLocation,
            dropoffLatitude: dto.dropoffLatitude,
            dropoffLongitude: dto.dropoffLongitude,
            feeTier: feeAssessment.feeTier,
            deliveryDistanceMeters: distance,
            convenienceFee: fee,
            totalAmount: order.totalAmount.add(fee),
            feeAssessments: {
              create: {
                type: 'PASABUY_CONVENIENCE',
                amount: fee,
                feeTier: feeAssessment.feeTier,
                distanceMeters: distance,
                ruleVersion: feeAssessment.ruleVersion,
              },
            },
            itemDescription: order.items.map((item) => `${item.quantity}x ${item.product.name}`).join(', '),
            termsAcceptedAt: now,
            expiresAt: new Date(now.getTime() + REQUEST_WINDOW_MS),
            statusHistory: {
              create: { status: 'PENDING', changedByUserId: userId, note: 'Pasabuy request created' },
            },
          },
        });
        await tx.order.update({ where: { id: order.id }, data: { isPasabuyRequest: true } });
        await tx.auditRecord.create({ data: {
          actorUserId: userId, actionType: 'PASABUY_CREATED',
          entityType: 'PasabuyRequest', entityId: request.id,
          afterState: { status: 'PENDING', relatedOrderId: order.id,
            feeTier: feeAssessment.feeTier },
        } });
        await tx.auditRecord.create({ data: {
          actorUserId: userId, actionType: 'FEE_ASSESSED',
          entityType: 'PasabuyRequest', entityId: request.id,
          afterState: { type: 'PASABUY_CONVENIENCE', amount: fee.toFixed(2),
            ruleVersion: feeAssessment.ruleVersion },
        } });
        return { request, expiredIds };
      });
      for (const expiredId of expiredIds) {
        await this.realtimeGateway.emitPasabuyStatusUpdated(expiredId);
      }
      await this.realtimeGateway.emitPasabuyStatusUpdated(request.id);
      return request;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Order already has an active Pasabuy request');
      }
      throw error;
    }
  }
}
