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

export class VendorAvailabilityDayDto {
  @ApiProperty({ enum: Weekday })
  @IsEnum(Weekday)
  dayOfWeek!: Weekday;

  @ApiProperty()
  @IsBoolean()
  isOpen!: boolean;

  @ApiPropertyOptional({
    example: '09:00',
    description: '24-hour "HH:mm" local time. Required when isOpen is true.',
  })
  @ValidateIf((day: VendorAvailabilityDayDto) => day.isOpen)
  @Matches(TIME_PATTERN, { message: 'openTime must be in HH:mm 24-hour format' })
  @IsOptional()
  openTime?: string;

  @ApiPropertyOptional({
    example: '17:00',
    description: '24-hour "HH:mm" local time. Required when isOpen is true.',
  })
  @ValidateIf((day: VendorAvailabilityDayDto) => day.isOpen)
  @Matches(TIME_PATTERN, { message: 'closeTime must be in HH:mm 24-hour format' })
  @IsOptional()
  closeTime?: string;
}

export class UpdateVendorAvailabilityDto {
  @ApiProperty({
    type: [VendorAvailabilityDayDto],
    description: 'One entry per weekday, Monday through Saturday.',
  })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => VendorAvailabilityDayDto)
  days!: VendorAvailabilityDayDto[];
}
