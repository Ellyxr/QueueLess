import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GroupPaymentSplitMode } from '@prisma/client';

class CustomPaymentShareDto {
  @ApiProperty({
    description: 'Group-order participant ID',
    format: 'uuid',
  })
  @IsUUID()
  participantId!: string;

  @ApiProperty({
    description: 'Amount assigned to this participant',
    example: 45,
    minimum: 0.01,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

export class SetPaymentSplitDto {
  @ApiProperty({
    enum: GroupPaymentSplitMode,
    example: GroupPaymentSplitMode.ITEM_BASED,
  })
  @IsEnum(GroupPaymentSplitMode)
  mode!: GroupPaymentSplitMode;

  @ApiPropertyOptional({
    type: [CustomPaymentShareDto],
    description:
      'Required only when mode is CUSTOM. Amounts must sum exactly to the authoritative order total.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomPaymentShareDto)
  customShares?: CustomPaymentShareDto[];
}
