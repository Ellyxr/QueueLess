import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({ controllers: [AuthController], providers: [JwtStrategy] })
export class AuthModule {}