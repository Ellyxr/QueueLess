import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CancellationReason, OrderStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    description: 'Next status for the order',
  })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({
    description: 'Optional note explaining the status change',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    enum: CancellationReason,
    description: 'Required when status is CANCELLED',
  })
  @ValidateIf((dto) => dto.status === OrderStatus.CANCELLED)
  @IsEnum(CancellationReason)
  cancellationReason?: CancellationReason;

  @ApiPropertyOptional({
    description: 'Required detail when cancellationReason is OTHER',
    maxLength: 500,
  })
  @ValidateIf(
    (dto) => dto.cancellationReason === CancellationReason.OTHER,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  cancellationNote?: string;
}
