import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { VendorType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { FrontendRole } from './roles';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    email: string,
    password: string,
    fullName: string,
    phone?: string,
    role: FrontendRole = 'student',
    businessName?: string,
  ) {
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    if (role === 'vendor' && !businessName?.trim()) {
      throw new BadRequestException(
        'Business name is required for vendor registration',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          fullName: fullName.trim(),
          phone: phone?.trim() || null,
          roleAssignments: {
            create:
              role === 'vendor'
                ? [
                    {
                      role: 'BUYER',
                    },
                    {
                      role: 'VENDOR_OWNER',
                    },
                  ]
                : [
                    {
                      role: 'BUYER',
                    },
                  ],
          },
        },
        include: {
          roleAssignments: {
            where: {
              revokedAt: null,
            },
          },
        },
      });

      if (role === 'vendor') {
        await tx.vendor.create({
          data: {
            ownerUserId: createdUser.id,
            name: businessName!.trim(),
            vendorType: VendorType.STUDENT,
          },
        });
      }

      return createdUser;
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      roles: user.roleAssignments.map(
        (assignment) => assignment.role,
      ),
    };
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      include: {
        roleAssignments: {
          where: {
            revokedAt: null,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const roles = user.roleAssignments.map(
      (assignment) => assignment.role,
    );

    const payload = {
      sub: user.id,
      email: user.email,
      roles,
      activeRole: roles[0],
    };

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const options: SignOptions = {
      expiresIn: process.env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };

    const accessToken = jwt.sign(payload, secret, options);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        roles,
        activeRole: roles[0],
      },
    };
  }
}