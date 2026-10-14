import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PrismaService } from '../common/prisma/prisma.service';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import type { JwtPayload } from '../auth/jwt.strategy';
import { Logger } from '@nestjs/common';

// CORS and transports come from RenderSocketIoAdapter (see main.ts), so the
// gateway uses the same CORS_ORIGIN allow-list as the REST API.
@WebSocketGateway({
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const secret =
        process.env.JWT_SECRET ??
        'foundation-development-secret';

      const payload = jwt.verify(token, secret) as JwtPayload;

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          isActive: true,
          archivedAt: true,
          roleAssignments: {
            where: {
              revokedAt: null,
            },
            select: {
              role: true,
            },
          },
        },
      });

      if (
        !user ||
        !user.isActive ||
        user.archivedAt !== null ||
        user.roleAssignments.length === 0
      ) {
        client.disconnect(true);
        return;
      }

      await client.join(this.userRoom(user.id));
      // The client can now reconcile any events missed while disconnected.
      client.emit('realtime.ready');
    } catch {
      client.disconnect(true);
    }
  }

  async emitOrderStatusUpdated(
    userId: string,
    payload: {
      orderId: string;
      status: string;
      updatedAt: Date;
    },
  ) {
    try {
      await this.publishOrderStatusUpdated(userId, payload);
    } catch (error) {
      // Callers publish after their transaction commits; a publish failure must
      // not turn a committed status change into an error response.
      this.logger.warn(
        `Could not publish order.status.updated for ${payload.orderId}: ${String(error)}`,
      );
    }
  }

  private async publishOrderStatusUpdated(
    userId: string,
    payload: { orderId: string; status: string; updatedAt: Date },
  ) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: payload.orderId,
      },
      select: {
        customerId: true,
        groupOrder: {
          select: {
            participants: {
              where: {
                status: 'JOINED',
              },
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    const recipientIds = new Set<string>([userId]);

    if (order) {
      recipientIds.add(order.customerId);

      for (const participant of order.groupOrder?.participants ?? []) {
        recipientIds.add(participant.userId);
      }
    }

    for (const recipientId of recipientIds) {
      this.server
        .to(this.userRoom(recipientId))
        .emit('order.status.updated', payload);
    }
  }

  // US-067: buzzer event for the student who collects the order. Called after
  // the READY_FOR_PICKUP transaction commits. Re-reads the order so nothing is
  // published if it has already moved on (completed/cancelled) or rolled back.
  //   - normal order: the customer and joined group-order participants
  //   - Pasabuy order: only the assigned fulfiller (the requester does not
  //     collect it; they still receive order.status.updated)
  // The vendor never receives it. eventId is the status-history id, so clients
  // can ring once per event across tabs and reconnects.
  async emitOrderReady(
    orderId: string,
    event: { eventId: string; readyAt: Date },
  ) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          customerId: true,
          isPasabuyRequest: true,
          vendor: {
            select: { id: true, name: true, pickupLocation: true },
          },
          groupOrder: {
            select: {
              participants: {
                where: { status: 'JOINED' },
                select: { userId: true },
              },
            },
          },
          pasabuyRequests: {
            where: {
              fulfillerUserId: { not: null },
              status: { in: ['ACCEPTED', 'AWAITING_PAYMENT', 'PAID'] },
            },
            select: { fulfillerUserId: true },
          },
        },
      });

      if (!order || order.status !== 'READY_FOR_PICKUP') return;

      const recipientIds = new Set<string>();
      if (order.isPasabuyRequest) {
        for (const request of order.pasabuyRequests) {
          if (request.fulfillerUserId) recipientIds.add(request.fulfillerUserId);
        }
      } else {
        recipientIds.add(order.customerId);
        for (const participant of order.groupOrder?.participants ?? []) {
          recipientIds.add(participant.userId);
        }
      }

      const payload = {
        eventId: event.eventId,
        orderId: order.id,
        // Same short reference the order API returns.
        orderReference: order.id.slice(0, 8).toUpperCase(),
        status: order.status,
        readyAt: event.readyAt,
        vendor: order.vendor,
      };
      for (const recipientId of recipientIds) {
        this.server.to(this.userRoom(recipientId)).emit('order.ready', payload);
      }
    } catch (error) {
      // The status change is already committed; the client recovers through
      // realtime.ready + GET /orders/mine.
      this.logger.warn(`Could not publish order.ready for ${orderId}: ${String(error)}`);
    }
  }

  emitNewOrder(
    vendorOwnerUserId: string,
    payload: {
      orderId: string;
      vendorId: string;
      customerId: string;
      status: string;
      totalAmount: string;
      createdAt: Date;
    },
  ) {
    this.server
      .to(this.userRoom(vendorOwnerUserId))
      .emit('order.created', payload);
  }

  async emitPasabuyStatusUpdated(requestId: string, previousFulfillerUserId?: string) {
    try {
      const request = await this.prisma.pasabuyRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          requesterUserId: true,
          fulfillerUserId: true,
          status: true,
          paymentStatus: true,
          updatedAt: true,
        },
      });
      if (!request) return;

      const recipients = new Set([
        request.requesterUserId,
        request.fulfillerUserId,
        previousFulfillerUserId,
      ]);
      const payload = {
        requestId: request.id,
        status: request.status,
        paymentStatus: request.paymentStatus,
        updatedAt: request.updatedAt,
      };
      for (const userId of recipients) {
        if (userId) this.server.to(this.userRoom(userId)).emit('pasabuy.status.updated', payload);
      }
    } catch (error) {
      this.logger.warn(`Could not publish Pasabuy status for ${requestId}: ${String(error)}`);
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;

    if (
      typeof authToken === 'string' &&
      authToken.trim()
    ) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    const authorization =
      client.handshake.headers.authorization;

    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      return authorization.slice(7).trim();
    }

    return null;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}
