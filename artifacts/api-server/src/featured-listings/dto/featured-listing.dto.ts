import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeaturedListingPlacement, FeaturedListingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, ValidateIf, IsUUID, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

const provided = (_: object, value: unknown) => value !== undefined;

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
  @ValidateIf(provided) @IsBoolean()
  isActive?: boolean;
  @ValidateIf(provided) @IsString() @MinLength(1) @MaxLength(100)
  name?: string;
  @ValidateIf(provided) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100000)
  price?: number;
  @ValidateIf(provided) @IsInt() @Min(1) @Max(365)
  durationDays?: number;
}

export class CreateFeaturedListingDto {
  @ValidateIf(provided) @IsString() @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  expectedAmount?: string;

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

export class ListAdminFeaturedListingsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: FeaturedListingStatus })
  @ValidateIf(provided) @IsEnum(FeaturedListingStatus)
  status?: FeaturedListingStatus;

  @ApiPropertyOptional({ enum: FeaturedListingPlacement })
  @ValidateIf(provided) @IsEnum(FeaturedListingPlacement)
  placement?: FeaturedListingPlacement;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(provided) @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(provided) @IsUUID()
  planId?: string;
}

export class UpdateFeaturedSettingsDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(100000)
  monthlyPrice!: number;
  @IsInt() @Min(0) @Max(99)
  firstVendorDiscount!: number;
  @IsInt() @Min(0) @Max(99)
  secondVendorDiscount!: number;
  @IsInt() @Min(0) @Max(99)
  thirdVendorDiscount!: number;
  @IsBoolean()
  discountOnRenewals!: boolean;
  @IsInt() @Min(1)
  version!: number;
}
