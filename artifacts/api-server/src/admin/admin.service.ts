import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, VendorStatus } from '@prisma/client';
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
import { ListAdminVendorsDto } from './dto/admin-vendor.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listVendors(query: ListAdminVendorsDto = {}) {
    const where: Prisma.VendorWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.vendorType ? { vendorType: query.vendorType } : {}),
      ...(query.search ? {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { businessName: { contains: query.search, mode: 'insensitive' as const } },
          { owner: { fullName: { contains: query.search, mode: 'insensitive' as const } } },
        ],
      } : {}),
    };
    return this.prisma.vendor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        owner: { select: { fullName: true } },
      },
    });
  }

  async getVendor(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        name: true,
        businessName: true,
        description: true,
        campusLocation: true,
        pickupLocation: true,
        vendorType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true, fullName: true, isActive: true, archivedAt: true,
            roleAssignments: {
              where: { role: UserRole.VENDOR_OWNER, revokedAt: null },
              select: { id: true },
            },
          },
        },
        _count: { select: { products: true, orders: true, reportsTargeting: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return {
      id: vendor.id,
      name: vendor.name,
      businessName: vendor.businessName,
      description: vendor.description,
      campusLocation: vendor.campusLocation,
      pickupLocation: vendor.pickupLocation,
      vendorType: vendor.vendorType,
      status: vendor.status,
      createdAt: vendor.createdAt,
      updatedAt: vendor.updatedAt,
      owner: {
        id: vendor.owner.id,
        fullName: vendor.owner.fullName,
        isActive: vendor.owner.isActive,
        isArchived: vendor.owner.archivedAt !== null,
        hasVendorRole: vendor.owner.roleAssignments.length > 0,
      },
      productCount: vendor._count.products,
      orderCount: vendor._count.orders,
      reportCount: vendor._count.reportsTargeting,
    };
  }

  async getVendorAudit(vendorId: string, page: number, limit: number) {
    if (!Number.isSafeInteger(page) || page < 1 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger((page - 1) * limit)) {
      throw new BadRequestException('page must be positive and limit must be between 1 and 100');
    }
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId }, select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const where: Prisma.AuditRecordWhereInput = {
      entityType: 'Vendor', entityId: vendorId,
      actionType: { startsWith: 'VENDOR_' },
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditRecord.count({ where }),
      this.prisma.auditRecord.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, actorUserId: true, actionType: true,
          beforeState: true, afterState: true, createdAt: true,
        },
      }),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async updateVendorStatus(
    vendorId: string,
    status: VendorStatus,
    actorUserId: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true, status: true, name: true,
          owner: {
            select: {
              isActive: true, archivedAt: true,
              roleAssignments: {
                where: { role: UserRole.VENDOR_OWNER, revokedAt: null },
                select: { id: true },
              },
            },
          },
        },
      });

      if (!vendor) {
        throw new NotFoundException('Vendor not found');
      }
      if (vendor.status === status) {
        throw new ConflictException('Vendor already has this status');
      }
      if (status === VendorStatus.ACTIVE &&
          (!vendor.owner.isActive || vendor.owner.archivedAt !== null ||
           vendor.owner.roleAssignments.length === 0)) {
        throw new ConflictException('Vendor owner needs an active account and vendor role');
      }

      const updated = await tx.vendor.updateMany({
        where: { id: vendorId, status: vendor.status },
        data: { status },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Vendor status changed; please retry');
      }

      const approved =
        vendor.status === VendorStatus.PENDING_APPROVAL &&
        status === VendorStatus.ACTIVE;
      await tx.auditRecord.create({
        data: {
          actorUserId,
          actionType: approved ? 'VENDOR_APPROVED' : 'VENDOR_STATUS_UPDATED',
          entityType: 'Vendor',
          entityId: vendor.id,
          beforeState: { status: vendor.status },
          afterState: { status, ...(reason ? { reason } : {}) },
        },
      });

      return { id: vendor.id, name: vendor.name, status };
    });
  }

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

  async getUser(userId: string) {
    return this.getUserById(userId);
  }

  async getUserAudit(userId: string, page: number, limit: number) {
    if (!Number.isSafeInteger(page) || page < 1 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger((page - 1) * limit)) {
      throw new BadRequestException('page must be positive and limit must be between 1 and 100');
    }
    await this.assertUserExists(userId);
    const where: Prisma.AuditRecordWhereInput = {
      entityType: 'User',
      entityId: userId,
      actionType: { startsWith: 'USER_' },
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditRecord.count({ where }),
      this.prisma.auditRecord.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          actorUserId: true,
          actionType: true,
          beforeState: true,
          afterState: true,
          createdAt: true,
        },
      }),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async updateRoles(
    userId: string,
    dto: UpdateAdminUserRolesDto,
    actorUserId: string,
  ) {
    const requestedRoles = [
      ...new Set(
        dto.roles.map((role) => this.toPrismaRole(role)),
      ),
    ];

    try {
      await this.prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, isActive: true, archivedAt: true },
        });
        if (!target) throw new NotFoundException('User not found');
        const assignments = await tx.roleAssignment.findMany({
          where: {
            userId,
          },
          orderBy: {
            grantedAt: 'desc',
          },
        });

        const before = assignments.filter((assignment) => assignment.revokedAt === null);
        const beforeRoles = before.map((assignment) => this.toFrontendRole(assignment.role));
        const currentRoles = new Set(before.map((assignment) => assignment.role));
        if (requestedRoles.length === currentRoles.size &&
            requestedRoles.every((role) => currentRoles.has(role))) return;

        if (currentRoles.has(UserRole.ADMIN) && !requestedRoles.includes(UserRole.ADMIN)) {
          if (userId === actorUserId) {
            throw new ForbiddenException('Cannot remove your own admin role');
          }
          if (target.isActive && target.archivedAt === null &&
              await this.countActiveAdmins(tx) <= 1) {
            throw new ConflictException('Cannot remove the last active administrator');
          }
        }

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
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConcurrentAdminUpdate(error);
    }

    return this.getUserById(userId);
  }

  async updateStatus(
    userId: string,
    dto: UpdateAdminUserStatusDto,
    actorUserId: string,
  ) {
    if (dto.isActive === undefined && dto.isArchived === undefined) {
      throw new BadRequestException('Provide isActive or isArchived');
    }
    if (dto.isActive === true && dto.isArchived === true) {
      throw new BadRequestException('An archived account cannot be active');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            isActive: true,
            archivedAt: true,
            roleAssignments: {
              where: { role: UserRole.ADMIN, revokedAt: null },
              select: { id: true },
            },
          },
        });
        if (!existingUser) throw new NotFoundException('User not found');
        if (dto.isActive === true && existingUser.archivedAt !== null &&
            dto.isArchived !== false) {
          throw new BadRequestException('Unarchive the user before activating the account');
        }

        const isArchived = dto.isArchived ?? (existingUser.archivedAt !== null);
        const isActive = isArchived ? false : (dto.isActive ?? existingUser.isActive);
        if (isActive === existingUser.isActive &&
            isArchived === (existingUser.archivedAt !== null)) return;

        if (existingUser.roleAssignments.length && existingUser.isActive &&
            existingUser.archivedAt === null && !isActive) {
          if (userId === actorUserId) {
            throw new ForbiddenException('Cannot deactivate your own admin account');
          }
          if (await this.countActiveAdmins(tx) <= 1) {
            throw new ConflictException('Cannot deactivate the last active administrator');
          }
        }

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            isActive,
            archivedAt: isArchived ? (existingUser.archivedAt ?? new Date()) : null,
          },
          select: { isActive: true, archivedAt: true },
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
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConcurrentAdminUpdate(error);
    }

    return this.getUserById(userId);
  }

  private countActiveAdmins(tx: Prisma.TransactionClient) {
    return tx.user.count({
      where: {
        isActive: true,
        archivedAt: null,
        roleAssignments: { some: { role: UserRole.ADMIN, revokedAt: null } },
      },
    });
  }

  private rethrowConcurrentAdminUpdate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034') {
      throw new ConflictException('Concurrent admin update; please retry');
    }
    throw error;
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
        const updated = await tx.user.updateMany({
          where: {
            id: userId,
            dataAccessGrantedAt: { not: null },
          },
          data: {
            email,
            studentEmailVerifiedAt: null,
          },
        });

        if (updated.count !== 1) {
          throw new ForbiddenException('User consent has been revoked');
        }

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
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          dataAccessGrantedAt: { not: null },
        },
        data: {
          passwordHash,
        },
      });

      if (updated.count !== 1) {
        throw new ForbiddenException('User consent has been revoked');
      }

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
    recentOrders,
    recentRefunds,
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
    this.prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    }),
    this.prisma.refund.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
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

  const auditActivity = recentAuditRecords.map((record) => {
    const actorName = record.actor?.fullName ?? 'System';

    const actionMessages: Record<string, string> = {
      USER_CREATED: 'created a user account',
      USER_ROLES_UPDATED: "updated a user's roles",
      USER_STATUS_UPDATED: "updated a user's status",
      USER_EMAIL_UPDATED: "updated a user's email",
      USER_PASSWORD_UPDATED: "updated a user's password",
      REFUND_STATUS_UPDATED: "updated a refund's status",
      VENDOR_APPROVED: 'approved a vendor',
      VENDOR_STATUS_UPDATED: "updated a vendor's status",
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

  const recentActivity = [
    ...auditActivity,
    ...recentOrders.map((order) => ({
      id: `order:${order.id}`,
      message: 'New order placed',
      timestamp: order.createdAt,
    })),
    ...recentRefunds.map((refund) => ({
      id: `refund:${refund.id}`,
      message: 'Refund requested',
      timestamp: refund.createdAt,
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 10);

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
