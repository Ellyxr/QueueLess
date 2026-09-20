import { RefundStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateRefundDto {
  @IsUUID()
  paymentId!: string;

  @IsOptional()
  @IsUUID()
  orderItemId?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? Number(value) : value,
  )
  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RefundStatusQueryDto {
  @ApiPropertyOptional({
    enum: RefundStatus,
    description: 'Filter refunds by status',
  })
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;
}

export class UpdateRefundStatusDto {
  @IsEnum(RefundStatus)
  status!: RefundStatus;
}
