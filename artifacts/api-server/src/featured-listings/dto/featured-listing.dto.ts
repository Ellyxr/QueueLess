import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeaturedListingPlacement } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ format: 'uuid', description: 'Required only for PRODUCT_SPOTLIGHT' })
  @IsOptional() @IsUUID()
  productId?: string;
}

export class ListFeaturedDto {
  @ApiPropertyOptional({ enum: FeaturedListingPlacement })
  @IsOptional() @IsEnum(FeaturedListingPlacement)
  placement?: FeaturedListingPlacement;
}
