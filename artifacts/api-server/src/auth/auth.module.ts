import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';

@Module({ controllers: [AuthController], providers: [AuthService, JwtStrategy] })
export class AuthModule {}
