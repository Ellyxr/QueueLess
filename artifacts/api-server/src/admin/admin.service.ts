import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AdminUserRoleDto,
  CreateAdminUserDto,
  UpdateAdminUserEmailDto,
  UpdateAdminUserPasswordDto,
  UpdateAdminUserRolesDto,
  UpdateAdminUserStatusDto,
} from './dto/admin-user.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private toPrismaRole(role: AdminUserRoleDto): UserRole {
    switch (role) {
      case AdminUserRoleDto.STUDENT:
        return UserRole.BUYER;
      case AdminUserRoleDto.VENDOR:
        return UserRole.VENDOR_OWNER;
      case AdminUserRoleDto.ADMIN:
        return UserRole.ADMIN;
    }
  }

  private toFrontendRole(
    role: UserRole,
  ): 'student' | 'vendor' | 'admin' {
    switch (role) {
      case UserRole.BUYER:
        return 'student';
      case UserRole.VENDOR_OWNER:
        return 'vendor';
      case UserRole.ADMIN:
        return 'admin';
    }
  }

  private formatUser(user: {
    id: string;
    email: string;
    fullName: string;
    isActive: boolean;
    archivedAt: Date | null;
    dataAccessGrantedAt: Date | null;
    createdAt: Date;
    roleAssignments: {
      role: UserRole;
      revokedAt: Date | null;
    }[];
  }) {
    return {
      id: user.id,
      fullName: user.fullName,

      // The frontend needs an email value for its table, but sensitive
      // administrative changes are still protected by explicit consent.
      email:
        user.dataAccessGrantedAt !== null
          ? user.email
          : null,

      roles: user.roleAssignments
        .filter((assignment) => assignment.revokedAt === null)
        .map((assignment) => this.toFrontendRole(assignment.role)),

      isActive: user.isActive,
      isArchived: user.archivedAt !== null,
      dataAccessGranted: user.dataAccessGrantedAt !== null,
      createdAt: user.createdAt,
    };
  }

  async listUsers(search?: string, role?: AdminUserRoleDto) {
    const normalizedSearch = search?.trim();

    const where: Prisma.UserWhereInput = {};

    if (normalizedSearch) {
      where.OR = [
        {
          fullName: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
        {
          AND: [
            {
              dataAccessGrantedAt: {
                not: null,
              },
            },
            {
              email: {
                contains: normalizedSearch,
                mode: 'insensitive',
              },
            },
          ],
        },
      ];
    }

    if (role) {
      where.roleAssignments = {
        some: {
          role: this.toPrismaRole(role),
          revokedAt: null,
        },
      };
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        archivedAt: true,
        dataAccessGrantedAt: true,
        createdAt: true,
        roleAssignments: {
          where: {
            revokedAt: null,
          },
          select: {
            role: true,
            revokedAt: true,
          },
        },
      },
    });

    return users.map((user) => this.formatUser(user));
  }

  async createUser(
    dto: CreateAdminUserDto,
    actorUserId: string,
  ) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();
    const prismaRole = this.toPrismaRole(dto.role);

    const duplicate = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { fullName }],
      },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });

    if (duplicate) {
      if (duplicate.email === email) {
        throw new ConflictException('Email is already registered');
      }

      throw new ConflictException('Full name is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            fullName,
            passwordHash,
            roleAssignments: {
              create: {
                role: prismaRole,
              },
            },
          },
          select: {
            id: true,
          },
         });
        await tx.auditRecord.create({
            data: {
              actorUserId,
              actionType: 'USER_CREATED',
              entityType: 'User',
              entityId: createdUser.id,
              afterState: {
                fullName,
                role: this.toFrontendRole(prismaRole),
              },
            },
        });

        return createdUser;
      });

      return this.getUserById(user.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A user with the same email or full name already exists',
        );
      }

      throw error;
    }
  }

  async updateRoles(
    userId: string,
    dto: UpdateAdminUserRolesDto,
    actorUserId: string,
  ) {
    await this.assertUserExists(userId);

    const beforeAssignments =
      await this.prisma.roleAssignment.findMany({
        where: {
          userId,
          revokedAt: null,
        },
        select: {
          role: true,
        },
      });

    const beforeRoles = beforeAssignments.map((assignment) =>
      this.toFrontendRole(assignment.role),
    );

    const requestedRoles = [
      ...new Set(
        dto.roles.map((role) => this.toPrismaRole(role)),
      ),
    ];

    await this.prisma.$transaction(async (tx) => {
      const assignments = await tx.roleAssignment.findMany({
        where: {
          userId,
        },
        orderBy: {
          grantedAt: 'desc',
        },
      });

      const now = new Date();

      for (const role of Object.values(UserRole)) {
        const roleAssignments = assignments.filter(
          (assignment) => assignment.role === role,
        );

        const activeAssignments = roleAssignments.filter(
          (assignment) => assignment.revokedAt === null,
        );

        const shouldBeActive = requestedRoles.includes(role);

        if (shouldBeActive) {
          if (activeAssignments.length === 0) {
            await tx.roleAssignment.create({
              data: {
                userId,
                role,
              },
            });
          } else if (activeAssignments.length > 1) {
            await tx.roleAssignment.updateMany({
              where: {
                id: {
                  in: activeAssignments.slice(1).map(
                    (assignment) => assignment.id,
                  ),
                },
              },
              data: {
                revokedAt: now,
              },
            });
          }
                } else if (activeAssignments.length > 0) {
          await tx.roleAssignment.updateMany({
            where: {
              id: {
                in: activeAssignments.map(
                  (assignment) => assignment.id,
                ),
              },
            },
            data: {
              revokedAt: now,
            },
          });
        }
      }

      await tx.auditRecord.create({
        data: {
          actorUserId,
          actionType: 'USER_ROLES_UPDATED',
          entityType: 'User',
          entityId: userId,
          beforeState: {
            roles: beforeRoles,
          },
          afterState: {
            roles: requestedRoles.map((role) =>
              this.toFrontendRole(role),
            ),
          },
        },
      });
    });

    return this.getUserById(userId);
  }

  async updateStatus(
    userId: string,
    dto: UpdateAdminUserStatusDto,
    actorUserId: string,
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        isActive: true,
        archivedAt: true,
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (
      dto.isActive === undefined &&
      dto.isArchived === undefined
    ) {
      throw new BadRequestException(
        'Provide isActive or isArchived',
      );
    }

    if (
      dto.isActive === true &&
      existingUser.archivedAt !== null &&
      dto.isArchived !== false
    ) {
      throw new BadRequestException(
        'Unarchive the user before activating the account',
      );
    }

    const data: Prisma.UserUpdateInput = {};

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.isArchived !== undefined) {
      data.archivedAt = dto.isArchived ? new Date() : null;

      // Archived accounts must not remain active.
      if (dto.isArchived) {
        data.isActive = false;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: {
          id: userId,
        },
        data,
        select: {
          isActive: true,
          archivedAt: true,
        },
      });

      await tx.auditRecord.create({
        data: {
          actorUserId,
          actionType: 'USER_STATUS_UPDATED',
          entityType: 'User',
          entityId: userId,
          beforeState: {
            isActive: existingUser.isActive,
            isArchived: existingUser.archivedAt !== null,
          },
          afterState: {
            isActive: updatedUser.isActive,
            isArchived: updatedUser.archivedAt !== null,
          },
        },
      });
    });

    return this.getUserById(userId);
  }

  async updateEmail(
    userId: string,
    dto: UpdateAdminUserEmailDto,
    actorUserId: string,
  ) {
    const user = await this.getSensitiveAccessUser(userId);
    const email = dto.email.trim().toLowerCase();

    if (user.email === email) {
      return this.getUserById(userId);
    }

    const duplicate = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (duplicate && duplicate.id !== userId) {
      throw new ConflictException('Email is already registered');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: {
            id: userId,
          },
          data: {
            email,
            studentEmailVerifiedAt: null,
          },
        });

        await tx.auditRecord.create({
          data: {
            actorUserId,
            actionType: 'USER_EMAIL_UPDATED',
            entityType: 'User',
            entityId: userId,
            afterState: {
              emailChanged: true,
              studentEmailVerificationReset: true,
            },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }

    return this.getUserById(userId);
  }

  async updatePassword(
    userId: string,
    dto: UpdateAdminUserPasswordDto,
    actorUserId: string,
  ) {
    await this.getSensitiveAccessUser(userId);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          passwordHash,
        },
      });

      await tx.auditRecord.create({
        data: {
          actorUserId,
          actionType: 'USER_PASSWORD_UPDATED',
          entityType: 'User',
          entityId: userId,
          afterState: {
            passwordChanged: true,
          },
        },
      });
    });

    return {
      message: 'Password updated successfully',
    };
  }

  async getDashboard() {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const activeOrderStatuses = [
    'PENDING',
    'PAID',
    'COOKING',
    'OUT_FOR_DELIVERY',
    'READY_FOR_PICKUP',
  ] as const;

  const [
    totalStudents,
    totalVendors,
    totalAdmins,
    activeOrdersToday,
    completedTodayHistory,
    pendingRefunds,
    newSignupsThisWeek,
    recentAuditRecords,
  ] = await Promise.all([
    this.prisma.user.count({
      where: {
        archivedAt: null,
        roleAssignments: {
          some: {
            role: UserRole.BUYER,
            revokedAt: null,
          },
        },
      },
    }),

    this.prisma.user.count({
      where: {
        archivedAt: null,
        roleAssignments: {
          some: {
            role: UserRole.VENDOR_OWNER,
            revokedAt: null,
          },
        },
      },
    }),

    this.prisma.user.count({
      where: {
        archivedAt: null,
        roleAssignments: {
          some: {
            role: UserRole.ADMIN,
            revokedAt: null,
          },
        },
      },
    }),

    this.prisma.order.count({
      where: {
        createdAt: {
          gte: startOfToday,
          lt: startOfTomorrow,
        },
        status: {
          in: [...activeOrderStatuses],
        },
      },
    }),

    this.prisma.orderStatusHistory.findMany({
      where: {
        status: 'COMPLETED',
        changedAt: {
          gte: startOfToday,
          lt: startOfTomorrow,
        },
      },
      select: {
        orderId: true,
        changedAt: true,
        order: {
          select: {
            marketplaceFee: true,
          },
        },
      },
      orderBy: {
        changedAt: 'desc',
      },
    }),

    this.prisma.refund.count({
      where: {
        status: 'REQUESTED',
      },
    }),

    this.prisma.user.count({
      where: {
        archivedAt: null,
        createdAt: {
          gte: sevenDaysAgo,
          lte: now,
        },
      },
    }),

    this.prisma.auditRecord.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        actionType: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: {
          select: {
            fullName: true,
          },
        },
      },
    }),
  ]);

  // An order should only contribute once even if duplicate COMPLETED
  // history rows somehow exist.
  const completedOrders = new Map<
    string,
    {
      marketplaceFee: Prisma.Decimal;
    }
  >();

  for (const history of completedTodayHistory) {
    if (!completedOrders.has(history.orderId)) {
      completedOrders.set(history.orderId, {
        marketplaceFee: history.order.marketplaceFee,
      });
    }
  }

  const completedOrdersToday = completedOrders.size;

  const platformRevenueToday = Array.from(
    completedOrders.values(),
  ).reduce(
    (total, order) => total.plus(order.marketplaceFee),
    new Prisma.Decimal(0),
  );

  const recentActivity = recentAuditRecords.map((record) => {
    const actorName = record.actor?.fullName ?? 'System';

    const actionMessages: Record<string, string> = {
      USER_CREATED: 'created a user account',
      USER_ROLES_UPDATED: "updated a user's roles",
      USER_STATUS_UPDATED: "updated a user's status",
      USER_EMAIL_UPDATED: "updated a user's email",
      USER_PASSWORD_UPDATED: "updated a user's password",
      REFUND_STATUS_UPDATED: "updated a refund's status",
    };

    const actionMessage =
      actionMessages[record.actionType] ??
      `performed ${record.actionType} on ${record.entityType}`;

    return {
      id: record.id,
      message: `${actorName} ${actionMessage}`,
      timestamp: record.createdAt,
    };
  });

  return {
    metrics: {
      totalStudents,
      totalVendors,
      totalAdmins,
      activeOrdersToday,
      completedOrdersToday,
      platformRevenueToday: Number(
        platformRevenueToday.toFixed(2),
      ),
      pendingRefunds,
      newSignupsThisWeek,
    },
    recentActivity,
  };
}

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async getSensitiveAccessUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        dataAccessGrantedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.dataAccessGrantedAt) {
      throw new ForbiddenException(
        'User has not granted permission to change sensitive account information',
      );
    }

    return user;
  }

  private async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        archivedAt: true,
        dataAccessGrantedAt: true,
        createdAt: true,
        roleAssignments: {
          where: {
            revokedAt: null,
          },
          select: {
            role: true,
            revokedAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.formatUser(user);
  }
}
