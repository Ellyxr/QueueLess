import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
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
}