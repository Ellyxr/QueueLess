import { ApiPropertyOptional } from '@nestjs/swagger';
import { DealDiscountType, DealTriggerType, VendorType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class CreateDealDto {
  @IsUUID()
  productId!: string;

  @IsEnum(DealDiscountType)
  discountType!: DealDiscountType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(99999999.99)
  discountValue!: number;

  @IsOptional()
  @IsEnum(DealTriggerType)
  triggerType?: DealTriggerType;

  @ValidateIf((dto: CreateDealDto) => dto.triggerType !== undefined && dto.triggerType !== DealTriggerType.NONE)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  triggerValue?: number;
}

export class UpdateDealDto {
  @IsOptional()
  @IsEnum(DealDiscountType)
  discountType?: DealDiscountType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(99999999.99)
  discountValue?: number;

  @IsOptional()
  @IsEnum(DealTriggerType)
  triggerType?: DealTriggerType;

  @ValidateIf((dto: UpdateDealDto) => dto.triggerType !== undefined && dto.triggerType !== DealTriggerType.NONE)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  triggerValue?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListActiveDealsDto {
  @ApiPropertyOptional({ enum: VendorType })
  @IsOptional()
  @IsEnum(VendorType)
  vendorType?: VendorType;
}
