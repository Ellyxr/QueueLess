import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  ChangePasswordDto,
  UpdateProfileDto,
} from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        allowParticipantOrderCompletion: true,
        studentEmailVerifiedAt: true,
        dataAccessGrantedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      dataAccessGranted: user.dataAccessGrantedAt !== null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const data: {
      fullName?: string;
      phone?: string | null;
      allowParticipantOrderCompletion?: boolean;
    } = {};

    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName.trim();
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() || null;
    }

    if (dto.allowParticipantOrderCompletion !== undefined) {
      data.allowParticipantOrderCompletion =
        dto.allowParticipantOrderCompletion;
    }

    const user = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        isActive: true,
        allowParticipantOrderCompletion: true,
        studentEmailVerifiedAt: true,
        dataAccessGrantedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...user,
      dataAccessGranted: user.dataAccessGrantedAt !== null,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        passwordHash: true,
      },
    });

    if (
      !user ||
      !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
    ) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 12),
      },
    });

    return {
      message: 'Password updated successfully',
    };
  }

  async updateDataAccessConsent(userId: string, granted: boolean) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        dataAccessGrantedAt: granted ? new Date() : null,
      },
      select: {
        id: true,
        dataAccessGrantedAt: true,
      },
    });

    return {
      dataAccessGranted: user.dataAccessGrantedAt !== null,
      dataAccessGrantedAt: user.dataAccessGrantedAt,
    };
  }
}
