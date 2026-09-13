import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    type: string,
    title: string,
    body: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        relatedEntityType,
        relatedEntityId,
      },
    });
  }

  async hasRecentUnread(
    relatedEntityType: string,
    relatedEntityId: string,
    type: string,
    sinceMs: number,
  ) {
    const recent = await this.prisma.notification.findFirst({
      where: {
        relatedEntityType,
        relatedEntityId,
        type,
        isRead: false,
        createdAt: {
          gte: new Date(Date.now() - sinceMs),
        },
      },
      select: { id: true },
    });

    return recent !== null;
  }

  async listMine(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { unreadCount: count };
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }

    return { message: 'Notification marked as read' };
  }
}
