import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum AdminUserRoleDto {
  STUDENT = 'student',
  VENDOR = 'vendor',
  ADMIN = 'admin',
}

export class CreateAdminUserDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(9)
  @MaxLength(100)
  password!: string;

  @IsEnum(AdminUserRoleDto)
  role!: AdminUserRoleDto;
}

export class UpdateAdminUserRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(AdminUserRoleDto, { each: true })
  roles!: AdminUserRoleDto[];
}

export class UpdateAdminUserStatusDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class UpdateAdminUserEmailDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
}

export class UpdateAdminUserPasswordDto {
  @IsString()
  @MinLength(9)
  @MaxLength(100)
  password!: string;
}
