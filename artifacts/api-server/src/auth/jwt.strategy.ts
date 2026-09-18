import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import type { UserRole } from './roles';

export type JwtPayload = {
  sub: string;
  email: string;
  roles: UserRole[];
  activeRole?: UserRole;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:
        process.env.JWT_SECRET ?? 'foundation-development-secret',
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
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

    if (!user || !user.isActive || user.archivedAt !== null) {
      throw new UnauthorizedException('Invalid or inactive session');
    }

    const roles = user.roleAssignments.map(
      (assignment) => assignment.role,
    ) as UserRole[];

    if (roles.length === 0) {
      throw new UnauthorizedException('User has no active role');
    }

    const activeRole =
      payload.activeRole && roles.includes(payload.activeRole)
        ? payload.activeRole
        : roles[0];

    return {
      sub: user.id,
      email: user.email,
      roles,
      activeRole,
    };
  }
}
