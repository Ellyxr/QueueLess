import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeaturedListingPlacement } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export type FeaturedListingPaymentMethod = 'PAYMONGO' | 'WALLET';

export class CreateFeaturedPlanDto {
  @ApiProperty({ maxLength: 100 })
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: FeaturedListingPlacement })
  @IsEnum(FeaturedListingPlacement)
  placement!: FeaturedListingPlacement;

  @ApiProperty({ minimum: 1, maximum: 100000 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100000)
  price!: number;

  @ApiProperty({ minimum: 1, maximum: 365 })
  @IsInt() @Min(1) @Max(365)
  durationDays!: number;
}

export class UpdateFeaturedPlanDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class CreateFeaturedListingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  planId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for PRODUCT_SPOTLIGHT, optional for MARKETPLACE_HOME' })
  @IsOptional() @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Custom promo image URL; defaults to the chosen product image' })
  @IsOptional() @IsUrl() @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({ enum: ['PAYMONGO', 'WALLET'], default: 'PAYMONGO' })
  @IsOptional() @IsIn(['PAYMONGO', 'WALLET'])
  paymentMethod?: FeaturedListingPaymentMethod;
}

export class ListFeaturedDto {
  @ApiPropertyOptional({ enum: FeaturedListingPlacement })
  @IsOptional() @IsEnum(FeaturedListingPlacement)
  placement?: FeaturedListingPlacement;
}
