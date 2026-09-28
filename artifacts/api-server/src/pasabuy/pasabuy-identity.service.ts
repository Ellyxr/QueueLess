import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ImagekitService } from '../imagekit/imagekit.service';
import { StudentIdDecision } from './dto/review-student-id.dto';

type UploadedPhoto = { buffer: Buffer; mimetype: string; size: number };

@Injectable()
export class PasabuyIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImagekitService,
  ) {}

  async uploadPhoto(userId: string, photo?: UploadedPhoto) {
    if (!photo?.buffer || photo.size > 2 * 1024 * 1024 || photo.size < 100) {
      throw new BadRequestException('A student ID photo up to 2 MB is required');
    }
    const types: Array<[string, string, number[]]> = [
      ['image/jpeg', 'jpg', [0xff, 0xd8, 0xff]],
      ['image/png', 'png', [0x89, 0x50, 0x4e, 0x47]],
      ['image/webp', 'webp', [0x52, 0x49, 0x46, 0x46]],
    ];
    const kind = types.find(([mime, , prefix]) =>
      mime === photo.mimetype && prefix.every((byte, i) => photo.buffer[i] === byte));
    if (!kind || (kind[0] === 'image/webp' &&
      photo.buffer.toString('ascii', 8, 12) !== 'WEBP')) {
      throw new BadRequestException('Only JPEG, PNG, or WebP ID photos are allowed');
    }
    const profile = await this.prisma.pasabuyProfile.findUnique({ where: { userId } });
    if (!profile?.studentId.trim()) {
      throw new ConflictException('Save your student ID number before uploading a photo');
    }
    const path = await this.images.uploadPrivateStudentId(userId, photo.buffer, kind[1]);
    await this.prisma.pasabuyProfile.update({ where: { userId },
      data: { studentIdPhotoUrl: path, verifiedAt: null } });
    return { submitted: true, studentIdVerified: false };
  }

  async pendingReviews() {
    const profiles = await this.prisma.pasabuyProfile.findMany({
      where: { studentIdPhotoUrl: { not: null }, verifiedAt: null },
      select: { userId: true, studentId: true, studentIdPhotoUrl: true,
        updatedAt: true, user: { select: { fullName: true } } },
      orderBy: { updatedAt: 'asc' },
    });
    return profiles.map((profile) => ({
      userId: profile.userId,
      fullName: profile.user.fullName,
      studentId: profile.studentId,
      photoUrl: this.images.signedStudentIdUrl(profile.studentIdPhotoUrl!),
      updatedAt: profile.updatedAt,
    }));
  }

  async reviewPhoto(userId: string) {
    const profile = await this.prisma.pasabuyProfile.findUnique({
      where: { userId }, select: { studentIdPhotoUrl: true },
    });
    if (!profile?.studentIdPhotoUrl) throw new NotFoundException('ID submission not found');
    return { photoUrl: this.images.signedStudentIdUrl(profile.studentIdPhotoUrl) };
  }

  async review(userId: string, decision: StudentIdDecision, adminId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.pasabuyProfile.findUnique({ where: { userId },
        select: { studentIdPhotoUrl: true, verifiedAt: true } });
      if (!profile?.studentIdPhotoUrl) throw new NotFoundException('ID submission not found');
      if (profile.verifiedAt) throw new ConflictException('ID was already verified');
      const changed = await tx.pasabuyProfile.updateMany({
        where: { userId, studentIdPhotoUrl: profile.studentIdPhotoUrl, verifiedAt: null },
        data: decision === StudentIdDecision.APPROVE
          ? { verifiedAt: new Date() }
          : { studentIdPhotoUrl: null, verifiedAt: null },
      });
      if (changed.count !== 1) throw new ConflictException('ID submission changed; retry');
      await tx.auditRecord.create({ data: {
        actorUserId: adminId,
        actionType: decision === StudentIdDecision.APPROVE
          ? 'PASABUY_STUDENT_ID_APPROVED' : 'PASABUY_STUDENT_ID_REJECTED',
        entityType: 'PasabuyProfile', entityId: userId,
        afterState: { verified: decision === StudentIdDecision.APPROVE },
      } });
      return { studentIdVerified: decision === StudentIdDecision.APPROVE };
    });
    return result;
  }
}
