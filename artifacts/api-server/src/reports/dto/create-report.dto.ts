import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export enum ReportTargetType {
  VENDOR = 'VENDOR',
  USER = 'USER',
  ORDER = 'ORDER',
  TRANSACTION = 'TRANSACTION',
  PRODUCT = 'PRODUCT',
  PASABUY = 'PASABUY',
}

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @ApiProperty({ format: 'uuid', description: 'The target UUID; TRANSACTION uses a Payment ID' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ minLength: 1, maxLength: 100, example: 'WRONG_ITEM' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;
}
