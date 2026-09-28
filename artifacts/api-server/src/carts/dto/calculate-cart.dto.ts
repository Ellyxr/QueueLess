import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CalculateCartDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Cart UUID',
  })
  @IsUUID()
  cartId!: string;

  @ApiPropertyOptional({
    description:
      'Whether to show the Pasabuy fee options. The fee is paid after a deliverer accepts and is not included in this food checkout total.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPasabuyRequest?: boolean;
}
