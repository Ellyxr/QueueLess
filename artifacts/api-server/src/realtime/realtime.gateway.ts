import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { PrismaService } from '../common/prisma/prisma.service';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import type { JwtPayload } from '../auth/jwt.strategy';

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true },
})
export class RealtimeGateway implements OnGatewayConnection {
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