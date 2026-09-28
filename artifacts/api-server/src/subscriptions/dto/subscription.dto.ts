import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  planId!: string;
}

export class CreatePlanDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 100000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100000)
  price!: number;

  @ApiProperty({ minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  benefitsDescription?: string;
}
