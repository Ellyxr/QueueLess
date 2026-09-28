import { PaymentProvider, PaymentPurpose, PaymentStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class AdminTransactionFiltersDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentPurpose })
  @IsOptional()
  @IsEnum(PaymentPurpose)
  purpose?: PaymentPurpose;

  @ApiPropertyOptional({ enum: PaymentProvider })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  payerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class AdminTransactionsQueryDto extends AdminTransactionFiltersDto {
  // ParseIntPipe checks these separately; Allow keeps them through the global
  // whitelist when the complete query is also bound to the filters DTO.
  @Allow()
  page?: string;

  @Allow()
  limit?: string;
}
