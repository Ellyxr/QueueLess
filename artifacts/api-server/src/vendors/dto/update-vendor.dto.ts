import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsNumber,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateVendorDto {
  @ApiPropertyOptional({
    example: 'Test Vendor Stall',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'Fresh and affordable campus meals.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'NU Laguna - Sampaloc Lane',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  campusLocation?: string;

  @ApiPropertyOptional({ description: 'Address where a Pasabuy deliverer collects orders.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  pickupLocation?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickupLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickupLongitude?: number;

  @ApiPropertyOptional({
    example: ['Rice Bowls', 'Drinks', 'Snacks'],
    description: 'Ordered list of category names as the vendor wants them displayed.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  categoryOrder?: string[];
}
