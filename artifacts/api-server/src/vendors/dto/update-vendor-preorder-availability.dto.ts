import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Weekday } from '@prisma/client';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class VendorPreorderDayDto {
  @ApiProperty({ enum: Weekday })
  @IsEnum(Weekday)
  dayOfWeek!: Weekday;

  @ApiProperty()
  @IsBoolean()
  isEnabled!: boolean;

  @ApiPropertyOptional({
    example: '09:00',
    description: '24-hour "HH:mm" local time. Required when isEnabled is true.',
  })
  @ValidateIf((day: VendorPreorderDayDto) => day.isEnabled)
  @Matches(TIME_PATTERN, { message: 'openTime must be in HH:mm 24-hour format' })
  @IsOptional()
  openTime?: string;

  @ApiPropertyOptional({
    example: '17:00',
    description: '24-hour "HH:mm" local time. Required when isEnabled is true.',
  })
  @ValidateIf((day: VendorPreorderDayDto) => day.isEnabled)
  @Matches(TIME_PATTERN, { message: 'closeTime must be in HH:mm 24-hour format' })
  @IsOptional()
  closeTime?: string;
}

export class UpdateVendorPreorderAvailabilityDto {
  @ApiProperty({
    description: 'Whether preorders are enabled for this vendor at all.',
  })
  @IsBoolean()
  preorderEnabled!: boolean;

  @ApiProperty({
    description:
      'When true, preorder availability mirrors the vendor\'s store availability and `days` is ignored.',
  })
  @IsBoolean()
  sameAsStoreHours!: boolean;

  @ApiPropertyOptional({
    type: [VendorPreorderDayDto],
    description:
      'One entry per weekday, Monday through Saturday. Required when sameAsStoreHours is false.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => VendorPreorderDayDto)
  days?: VendorPreorderDayDto[];
}
